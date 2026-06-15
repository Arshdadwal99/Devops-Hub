import { spawn } from "child_process";
import crypto from "crypto";
import { Build } from "../models/Build.js";
import { Image } from "../models/Image.js";
import { Deployment } from "../models/Deployment.js";
import {
  emitDockerPushStarted,
  emitDockerPushLog,
  emitDockerPushCompleted,
} from "./socketEventsService.js";
import { getDockerConnectionConfig, getDockerStatus } from "./dockerService.js";

function getImageId() {
  return `img-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function getUserId(user) {
  return user?.userId || user?.uid || user?.id || "system";
}

function validateDockerHubCreds(username, password) {
  if (!username || !password) {
    throw new Error("Docker Hub username and password are required");
  }
  if (typeof username !== "string" || typeof password !== "string") {
    throw new Error("Username and password must be strings");
  }
  if (username.length < 1 || password.length < 1) {
    throw new Error("Username and password cannot be empty");
  }
  return true;
}

async function appendPushLog(imageId, message, level = "info") {
  try {
    await Image.updateOne(
      { imageId },
      {
        $push: {
          pushLogs: {
            timestamp: new Date(),
            message,
            level,
          },
        },
        updatedAt: new Date(),
      }
    );
  } catch (error) {
    console.warn("[Docker Push] Failed to persist log:", error.message);
  }
}

function sanitizeImagePart(value) {
  return String(value || "app")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "app";
}

export async function pushImageToDockerHub({
  user,
  buildId,
  dockerHubUsername,
  dockerHubPassword,
  dockerHubRepo,
}) {
  const userId = getUserId(user);

  // Validate Docker Hub credentials
  validateDockerHubCreds(dockerHubUsername, dockerHubPassword);

  if (!buildId || typeof buildId !== "string") {
    throw new Error("buildId is required");
  }

  if (!dockerHubRepo || typeof dockerHubRepo !== "string") {
    throw new Error("dockerHubRepo is required");
  }

  // Find the build
  const build = await Build.findOne({ buildId, userId });
  if (!build) {
    throw new Error("Build not found");
  }

  if (build.status !== "SUCCESS") {
    throw new Error(`Build status is ${build.status}, only SUCCESS builds can be pushed`);
  }

  // Check Docker availability
  const dockerStatus = await getDockerStatus({ force: true });
  if (!dockerStatus.available) {
    throw new Error(dockerStatus.error || "Docker daemon unavailable. Start Docker before pushing an image.");
  }

  const imageId = getImageId();
  const sourceImageTag = build.imageTag;
  const sanitizedRepo = sanitizeImagePart(dockerHubRepo);
  const targetImageName = `${dockerHubUsername}/${sanitizedRepo}`;
  const tag = build.imageTag.split(":")[1] || "latest";
  const targetImageTag = `${targetImageName}:${tag}`;

  console.log("[Docker Push] Starting push", {
    imageId,
    buildId,
    sourceImageTag,
    targetImageTag,
  });

  // Create image record
  await Image.create({
    imageId,
    buildId,
    projectId: build.projectId,
    commitSha: build.commitSha,
    userId,
    imageName: targetImageName,
    tag,
    imageTag: targetImageTag,
    buildStatus: build.buildStatus || build.status,
    repository: sanitizedRepo,
    status: "PENDING",
    dockerConfig: {
      username: dockerHubUsername,
      registry: "docker.io",
    },
    deploymentId: build.deploymentId,
    pushLogs: ["Push queued"],
  });

  // Update to PUSHING status
  await Image.updateOne(
    { imageId },
    {
      status: "PUSHING",
      pushStartedAt: new Date(),
      $push: { pushLogs: { timestamp: new Date(), message: "Docker push started", level: "info" } },
    }
  );

  emitDockerPushStarted({ imageId, buildId, sourceImageTag, targetImageTag });
  console.log("[Docker Push] Emitted start event", { imageId });

  return new Promise((resolve) => {
    const connection = getDockerConnectionConfig();
    const startTime = Date.now();

    // First, tag the image
    console.log("[Docker Push] Tagging image", { sourceImageTag, targetImageTag });

    const tagChild = spawn("docker", ["tag", sourceImageTag, targetImageTag], {
      env: connection.env,
      shell: false,
      windowsHide: true,
    });

    tagChild.on("error", async (error) => {
      const errorMsg = `Failed to tag image: ${error.message}`;
      console.error("[Docker Push] Tag failed:", error);

      await appendPushLog(imageId, errorMsg, "error");
      await Image.updateOne(
        { imageId },
        {
          status: "FAILED",
          pushError: errorMsg,
          pushedAt: new Date(),
          pushDuration: Date.now() - startTime,
        }
      );

      emitDockerPushLog({ imageId, buildId, message: errorMsg, level: "error" });
      emitDockerPushCompleted({
        imageId,
        buildId,
        targetImageTag,
        status: "FAILED",
        error: errorMsg,
      });

      resolve({
        success: false,
        imageId,
        buildId,
        targetImageTag,
        status: "FAILED",
        error: errorMsg,
        image: await Image.findOne({ imageId }).lean(),
      });
    });

    tagChild.on("close", async (code) => {
      if (code !== 0) {
        const errorMsg = `Failed to tag image (exit code ${code})`;
        console.error("[Docker Push] Tag failed with code:", code);

        await appendPushLog(imageId, errorMsg, "error");
        await Image.updateOne(
          { imageId },
          {
            status: "FAILED",
            pushError: errorMsg,
            pushedAt: new Date(),
            pushDuration: Date.now() - startTime,
          }
        );

        emitDockerPushLog({ imageId, buildId, message: errorMsg, level: "error" });
        emitDockerPushCompleted({
          imageId,
          buildId,
          targetImageTag,
          status: "FAILED",
          error: errorMsg,
        });

        return resolve({
          success: false,
          imageId,
          buildId,
          targetImageTag,
          status: "FAILED",
          error: errorMsg,
          image: await Image.findOne({ imageId }).lean(),
        });
      }

      console.log("[Docker Push] Image tagged successfully, proceeding to push");
      await appendPushLog(imageId, "Image tagged successfully");

      // Now push the image
      console.log("[Docker Push] Pushing to Docker Hub", { targetImageTag });

      const pushChild = spawn(
        "docker",
        [
          "push",
          targetImageTag,
          "--disable-content-trust", // Disable Docker Content Trust for simplicity
        ],
        {
          env: {
            ...connection.env,
            DOCKER_USERNAME: dockerHubUsername,
            DOCKER_PASSWORD: dockerHubPassword,
          },
          shell: false,
          windowsHide: true,
        }
      );

      const pendingLogWrites = [];

      const handlePushLog = (chunk) => {
        const lines = chunk
          .toString()
          .split(/\r?\n/)
          .map((line) => line.trimEnd())
          .filter(Boolean);

        lines.forEach((line) => {
          console.log("[Docker Push] Log:", line);
          pendingLogWrites.push(appendPushLog(imageId, line, "info"));
          emitDockerPushLog({ imageId, buildId, message: line, level: "info" });
        });
      };

      pushChild.stdout.on("data", handlePushLog);
      pushChild.stderr.on("data", handlePushLog);

      pushChild.on("error", async (error) => {
        const errorMsg = `Docker push failed to start: ${error.message}`;
        console.error("[Docker Push] Push error:", error);

        await Promise.allSettled(pendingLogWrites);
        await appendPushLog(imageId, errorMsg, "error");
        await Image.updateOne(
          { imageId },
          {
            status: "FAILED",
            pushError: errorMsg,
            pushedAt: new Date(),
            pushDuration: Date.now() - startTime,
          }
        );

        emitDockerPushLog({ imageId, buildId, message: errorMsg, level: "error" });
        emitDockerPushCompleted({
          imageId,
          buildId,
          targetImageTag,
          status: "FAILED",
          error: errorMsg,
        });

        resolve({
          success: false,
          imageId,
          buildId,
          targetImageTag,
          status: "FAILED",
          error: errorMsg,
          image: await Image.findOne({ imageId }).lean(),
        });
      });

      pushChild.on("close", async (code) => {
        const duration = Date.now() - startTime;
        const status = code === 0 ? "SUCCESS" : "FAILED";
        const finalMessage =
          code === 0
            ? `Image pushed successfully to Docker Hub: ${targetImageTag}`
            : `Docker push exited with code ${code}`;

        console.log("[Docker Push] Push completed", {
          imageId,
          code,
          status,
          duration,
        });

        await Promise.allSettled(pendingLogWrites);
        await appendPushLog(imageId, finalMessage, code === 0 ? "info" : "error");

        const dockerHubUrl =
          code === 0 ? `https://hub.docker.com/r/${targetImageName}/tags?name=${tag}` : null;

        await Image.updateOne(
          { imageId },
          {
            status,
            pushedAt: new Date(),
            pushDuration: duration,
            ...(dockerHubUrl && { dockerHubUrl }),
            ...(code !== 0 && { pushError: finalMessage }),
          }
        );

        if (code === 0) {
          await Deployment.updateOne(
            { deploymentId: build.deploymentId, userId },
            {
              deploymentStage: "PUSHED_TO_REGISTRY",
              currentBuildId: build.buildId,
              currentImageTag: build.imageTag,
              currentImageId: build.imageId,
              updatedAt: new Date(),
              $push: { logs: `Docker image pushed to registry: ${targetImageTag}` },
            }
          );
        }

        emitDockerPushLog({ imageId, buildId, message: finalMessage, level: code === 0 ? "info" : "error" });
        emitDockerPushCompleted({
          imageId,
          buildId,
          targetImageTag,
          status,
          duration,
          error: code === 0 ? null : finalMessage,
          dockerHubUrl,
        });

        resolve({
          success: code === 0,
          imageId,
          buildId,
          targetImageTag,
          status,
          duration,
          error: code === 0 ? null : finalMessage,
          dockerHubUrl,
          image: await Image.findOne({ imageId }).lean(),
        });
      });
    });
  });
}

export async function getImageHistory(userId, limit = 50) {
  try {
    const images = await Image.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return {
      success: true,
      images,
      total: await Image.countDocuments({ userId }),
    };
  } catch (error) {
    console.error("[Docker Push] Failed to get image history:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function getImageDetails(imageId) {
  try {
    const image = await Image.findOne({ imageId }).lean();

    if (!image) {
      return {
        success: false,
        error: "Image not found",
      };
    }

    return {
      success: true,
      image,
    };
  } catch (error) {
    console.error("[Docker Push] Failed to get image details:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function getImagesByBuild(buildId) {
  try {
    const images = await Image.find({ buildId })
      .sort({ createdAt: -1 })
      .lean();

    return {
      success: true,
      images,
    };
  } catch (error) {
    console.error("[Docker Push] Failed to get images by build:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}
