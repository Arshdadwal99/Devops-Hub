import { execFile, spawn } from "child_process";
import crypto from "crypto";
import path from "path";
import fs from "fs/promises";
import { promisify } from "util";
import { Build } from "../models/Build.js";
import { Deployment } from "../models/Deployment.js";
import {
  emitDockerBuildCompleted,
  emitDockerBuildLog,
  emitDockerBuildStarted,
} from "./socketEventsService.js";
import { getDockerConnectionConfig, getDockerStatus } from "./dockerService.js";

const execFileAsync = promisify(execFile);

function getBuildId() {
  return `build-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function getUserId(user) {
  return user?.userId || user?.uid || user?.id || "system";
}

function sanitizeImagePart(value) {
  return String(value || "app")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "app";
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (_error) {
    return false;
  }
}

function appendBuildLog(buildId, message) {
  return Build.updateOne(
    { buildId },
    {
      $push: { logs: message },
      updatedAt: new Date(),
    }
  ).catch((error) => {
    console.warn("[Docker Build] Failed to persist log:", error.message);
  });
}

async function inspectImageId(imageTag) {
  try {
    const connection = getDockerConnectionConfig();
    const { stdout } = await execFileAsync(
      "docker",
      ["image", "inspect", imageTag, "--format", "{{.Id}}"],
      { env: connection.env }
    );
    return stdout.trim() || null;
  } catch (error) {
    console.warn("[Docker Build] Failed to inspect image id:", error.message);
    return null;
  }
}

export async function buildDockerImage({ user, deploymentId, forceRebuild = false }) {
  const userId = getUserId(user);
  const deployment = await Deployment.findOne({ deploymentId, userId });

  if (!deployment) {
    throw new Error("Deployment workspace not found");
  }

  if (deployment.status !== "READY_FOR_BUILD" && deployment.deploymentStage !== "IMAGE_BUILT") {
    throw new Error(`Deployment is not ready for build. Current status: ${deployment.status}`);
  }

  if (!deployment.workspacePath) {
    throw new Error("Deployment workspace path is missing");
  }

  const dockerfilePath = path.join(deployment.workspacePath, "Dockerfile");
  if (!(await fileExists(dockerfilePath))) {
    throw new Error("Dockerfile not found in deployment workspace");
  }

  const dockerStatus = await getDockerStatus({ force: true });
  if (!dockerStatus.available) {
    throw new Error(dockerStatus.error || "Docker daemon unavailable. Start Docker before building an image.");
  }

  const buildId = getBuildId();
  const imageName = `devopshub/${sanitizeImagePart(deployment.repository)}`;
  const imageTag = `${imageName}:${sanitizeImagePart(deployment.commitSha?.slice(0, 12) || deployment.deploymentId)}`;
  const startedAt = new Date();
  const projectId = deployment.projectId || `${deployment.owner}/${deployment.repository}`;

  if (!forceRebuild) {
    const existingBuild = await Build.findOne({
      userId,
      status: "SUCCESS",
      $or: [
        { deploymentId },
        { projectId, commitSha: deployment.commitSha },
        { imageTag },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    if (existingBuild) {
      await Deployment.updateOne(
        { deploymentId, userId },
        {
          deploymentStage: "IMAGE_BUILT",
          currentBuildId: existingBuild.buildId,
          currentImageTag: existingBuild.imageTag,
          currentImageId: existingBuild.imageId,
          updatedAt: new Date(),
        }
      );

      return {
        success: true,
        skipped: true,
        reason: "Docker image already exists for this repository commit",
        buildId: existingBuild.buildId,
        deploymentId,
        imageName: existingBuild.imageName,
        imageTag: existingBuild.imageTag,
        imageId: existingBuild.imageId,
        status: "SUCCESS",
        build: existingBuild,
      };
    }
  }

  await Build.create({
    buildId,
    deploymentId,
    projectId,
    repository: deployment.repository,
    owner: deployment.owner,
    commitSha: deployment.commitSha,
    userId,
    imageName,
    imageTag,
    status: "QUEUED",
    buildStatus: "QUEUED",
    startedAt,
    logs: ["Build queued"],
  });

  await Build.updateOne(
    { buildId },
    {
      status: "BUILDING",
      buildStatus: "BUILDING",
      logs: ["Build queued", "Docker build started"],
      updatedAt: new Date(),
    }
  );
  console.log("[Docker] Build started", { buildId, deploymentId, imageTag });
  emitDockerBuildStarted({ buildId, deploymentId, imageTag });

  return new Promise((resolve) => {
    const pendingLogWrites = [];
    const connection = getDockerConnectionConfig();

    const child = spawn("docker", ["build", "-t", imageTag, "-f", "Dockerfile", "."], {
      cwd: deployment.workspacePath,
      env: connection.env,
      shell: false,
      windowsHide: true,
    });

    const handleLog = (chunk) => {
      const lines = chunk
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter(Boolean);

      lines.forEach((line) => {
        pendingLogWrites.push(appendBuildLog(buildId, line));
        emitDockerBuildLog({ buildId, deploymentId, message: line });
      });
    };

    child.stdout.on("data", handleLog);
    child.stderr.on("data", handleLog);

    child.on("error", async (error) => {
      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();
      const message = `Docker build failed to start: ${error.message}`;

      await Promise.allSettled(pendingLogWrites);
      await Build.updateOne(
        { buildId },
        {
          status: "FAILED",
          buildStatus: "FAILED",
          completedAt,
          duration,
          $push: { logs: message },
        }
      );

      emitDockerBuildLog({ buildId, deploymentId, message });
      emitDockerBuildCompleted({ buildId, deploymentId, imageTag, status: "FAILED", duration, error: error.message });

      resolve({
        success: false,
        buildId,
        deploymentId,
        imageName,
        imageTag,
        status: "FAILED",
        duration,
        error: error.message,
        build: await Build.findOne({ buildId }).lean(),
      });
    });

    child.on("close", async (code) => {
      const completedAt = new Date();
      const duration = completedAt.getTime() - startedAt.getTime();
      const status = code === 0 ? "SUCCESS" : "FAILED";
      const finalMessage = code === 0 ? `Image created: ${imageTag}` : `Docker build exited with code ${code}`;
      const imageId = code === 0 ? await inspectImageId(imageTag) : null;

      await Promise.allSettled(pendingLogWrites);
      await Build.updateOne(
        { buildId },
        {
          status,
          buildStatus: status,
          imageId,
          completedAt,
          duration,
          $push: { logs: finalMessage },
        }
      );

      if (code === 0) {
        await Deployment.updateOne(
          { deploymentId, userId },
          {
            deploymentStage: "IMAGE_BUILT",
            currentBuildId: buildId,
            currentImageTag: imageTag,
            currentImageId: imageId,
            updatedAt: new Date(),
            $push: { logs: `Docker image built: ${imageTag}` },
          }
        );
      }

      emitDockerBuildLog({ buildId, deploymentId, message: finalMessage });
      emitDockerBuildCompleted({
        buildId,
        deploymentId,
        imageTag,
        status,
        duration,
        error: code === 0 ? null : finalMessage,
      });

      resolve({
        success: code === 0,
        buildId,
        deploymentId,
        imageName,
        imageTag,
        imageId,
        status,
        duration,
        error: code === 0 ? null : finalMessage,
        build: await Build.findOne({ buildId }).lean(),
      });
    });
  });
}
