import { execFile } from "child_process";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";
import { Deployment } from "../models/Deployment.js";
import { Log } from "../models/Logs.js";
import { buildImage, deployContainer, getContainers, removeContainer, stopContainer } from "./dockerService.js";
import { createAlert } from "./alertService.js";
import {
  emitDeploymentStarted,
  emitDeploymentProgress,
  emitDeploymentSucceeded,
  emitDeploymentFailed,
} from "./socketEventsService.js";

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = path.resolve(process.cwd(), "pipeline-workspace");
const DEFAULT_CONTAINER_PORT = process.env.CONTAINER_PORT || "3000";
const DEFAULT_HOST_PORT = process.env.HOST_PORT || "3000";

function normalizeGitHubUrl(repoUrl) {
  if (typeof repoUrl !== "string") {
    throw new Error("GitHub repository URL is required");
  }

  const trimmed = repoUrl.trim();
  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  const sshMatch = trimmed.match(/^git@github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  const match = httpsMatch || sshMatch;

  if (!match) {
    throw new Error("Only GitHub repository URLs are supported, for example https://github.com/owner/repo.git");
  }

  return {
    cloneUrl: httpsMatch ? `https://github.com/${match[1]}/${match[2]}.git` : trimmed,
    owner: match[1],
    repo: match[2],
  };
}

function sanitizeSlug(value, fallback = "app") {
  const slug = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || fallback;
}

function sanitizeTagPart(value) {
  return sanitizeSlug(value).replace(/^[.-]+/, "");
}

function toArray(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }

  return fallback;
}

function resolveRepoFile(repoDir, requestedPath) {
  const resolvedPath = path.resolve(repoDir, requestedPath);
  const relativePath = path.relative(repoDir, resolvedPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Build file path must stay inside the repository: ${requestedPath}`);
  }

  return resolvedPath;
}

function isComposeFile(filePath) {
  const fileName = path.basename(filePath).toLowerCase();
  return ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].includes(fileName);
}

function findComposeFile(repoDir) {
  const composeFiles = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
  return composeFiles
    .map((fileName) => path.join(repoDir, fileName))
    .find((filePath) => existsSync(filePath));
}

function findDockerfile(repoDir) {
  const dockerfiles = ["Dockerfile", "dockerfile"];
  return dockerfiles
    .map((fileName) => path.join(repoDir, fileName))
    .find((filePath) => existsSync(filePath));
}

function detectBuildFile(repoDir) {
  const composeFile = findComposeFile(repoDir);
  if (composeFile) return composeFile;

  const dockerfile = findDockerfile(repoDir);
  if (dockerfile) return dockerfile;

  return null;
}

async function runComposeDeployment({ composeFile, projectName, logs }) {
  logs.push(`[${new Date().toISOString()}] Running Docker Compose project ${projectName}`);

  const baseArgs = [
    "compose",
    "-f",
    composeFile,
    "-p",
    projectName,
  ];

  try {
    const downArgs = [...baseArgs, "down", "--remove-orphans"];
    const { stdout, stderr } = await execFileAsync("docker", downArgs, {
      maxBuffer: 10 * 1024 * 1024,
    });
    const cleanupLogs = (stdout + stderr).split("\n").filter(Boolean);
    logs.push(...cleanupLogs.map((line) => `  ${line}`));
  } catch (error) {
    const cleanupOutput = `${error.stdout || ""}${error.stderr || ""}`.trim();
    logs.push(
      `[${new Date().toISOString()}] Docker Compose cleanup warning: ${
        cleanupOutput || error.message
      }`
    );
  }

  const args = [
    ...baseArgs,
    "up",
    "-d",
    "--build",
    "--remove-orphans",
  ];

  const { stdout, stderr } = await execFileAsync("docker", args, {
    maxBuffer: 10 * 1024 * 1024,
  });

  return (stdout + stderr).split("\n").filter(Boolean);
}

async function cloneRepository({ cloneUrl, branch, targetDir, logs }) {
  logs.push(`[${new Date().toISOString()}] Cloning ${cloneUrl} (${branch})`);

  try {
    await execFileAsync("git", ["clone", "--depth", "1", "--branch", branch, cloneUrl, targetDir], {
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    if (!String(error.message).includes("Remote branch")) {
      throw error;
    }

    logs.push(`[${new Date().toISOString()}] Branch ${branch} was not found, cloning default branch instead`);
    await execFileAsync("git", ["clone", "--depth", "1", cloneUrl, targetDir], {
      maxBuffer: 10 * 1024 * 1024,
    });
  }
}

async function getShortCommit(repoDir) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: repoDir,
    });
    return stdout.trim();
  } catch {
    return String(Date.now());
  }
}

export async function deployGitHubRepository(options) {
  const startedAt = Date.now();
  const logs = [];
  let deployment;
  let repoDir;

  const {
    repoUrl,
    branch = "main",
    containerName,
    environment = "production",
    dockerfilePath = "auto",
    userId,
    deployedBy = "dashboard",
    keepWorkspace = false,
  } = options;

  const { cloneUrl, owner, repo } = normalizeGitHubUrl(repoUrl);
  const appName = sanitizeSlug(containerName || repo);
  const branchTag = sanitizeTagPart(branch);
  const ports = toArray(options.ports, [`${DEFAULT_HOST_PORT}:${DEFAULT_CONTAINER_PORT}`]);
  const env = toArray(options.env, ["NODE_ENV=production"]);
  const volumes = toArray(options.volumes);

  try {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
    repoDir = path.join(WORKSPACE_ROOT, `${appName}-${Date.now()}`);

    deployment = await Deployment.create({
      userId,
      version: "pending",
      status: "in-progress",
      deploymentType: "auto",
      environment,
      deployedBy,
      startTime: new Date(),
      deploymentScript: "github-repo-docker-auto",
      containers: [{ name: appName, status: "pending" }],
      logs,
    });

    emitDeploymentStarted({
      deploymentId: deployment._id.toString(),
      version: "pending",
      containerName: appName,
      repository: `${owner}/${repo}`,
      branch,
    });

    await cloneRepository({ cloneUrl, branch, targetDir: repoDir, logs });
    const commit = await getShortCommit(repoDir);
    const imageTag = `${appName}:${branchTag}-${commit}`;
    const shouldAutoDetectBuildFile = !dockerfilePath || String(dockerfilePath).toLowerCase() === "auto";
    let buildFile = shouldAutoDetectBuildFile ? detectBuildFile(repoDir) : resolveRepoFile(repoDir, dockerfilePath);

    if (!buildFile || !existsSync(buildFile)) {
      const composeFile = findComposeFile(repoDir);

      if (!shouldAutoDetectBuildFile && path.basename(dockerfilePath).toLowerCase() === "dockerfile" && composeFile) {
        buildFile = composeFile;
        logs.push(
          `[${new Date().toISOString()}] Dockerfile was not found; using ${path.basename(composeFile)} instead`
        );
      } else {
        throw new Error(
          shouldAutoDetectBuildFile
            ? "No Docker build file found. Add docker-compose.yml, compose.yml, or Dockerfile to the repository root."
            : `Build file not found at ${dockerfilePath}`
        );
      }
    }

    if (shouldAutoDetectBuildFile) {
      logs.push(`[${new Date().toISOString()}] Auto-detected build file: ${path.basename(buildFile)}`);
    }

    logs.push(`[${new Date().toISOString()}] Repository cloned at commit ${commit}`);
    emitDeploymentProgress({
      deploymentId: deployment._id.toString(),
      stage: "clone",
      status: "completed",
      message: "GitHub repository cloned",
      progress: 20,
    });

    if (isComposeFile(buildFile)) {
      logs.push(`[${new Date().toISOString()}] Building and starting Docker Compose services`);
      const composeLogs = await runComposeDeployment({
        composeFile: buildFile,
        projectName: appName,
        logs,
      });
      logs.push(...composeLogs.map((line) => `  ${line}`));

      emitDeploymentProgress({
        deploymentId: deployment._id.toString(),
        stage: "docker-compose",
        status: "completed",
        message: "Docker Compose services started",
        progress: 90,
      });
    } else {
      logs.push(`[${new Date().toISOString()}] Building Docker image ${imageTag}`);
      const buildResult = await buildImage(buildFile, imageTag, repoDir);
      if (!buildResult.success) {
        throw new Error(`Docker build failed: ${buildResult.error}`);
      }

      logs.push(...buildResult.logs.map((line) => `  ${line}`));
      emitDeploymentProgress({
        deploymentId: deployment._id.toString(),
        stage: "docker-build",
        status: "completed",
        message: "Docker image built",
        progress: 55,
      });

      const containersResult = await getContainers();
      let oldContainerId = null;
      if (containersResult.success) {
        const oldContainer = containersResult.containers.find(
          (container) => container.Names?.includes(`/${appName}`) || container.Names?.includes(appName)
        );
        oldContainerId = oldContainer?.ID || null;
      }

      if (oldContainerId) {
        logs.push(`[${new Date().toISOString()}] Replacing existing container ${oldContainerId}`);
        await stopContainer(oldContainerId, 30);
        await removeContainer(oldContainerId, true);
      }

      emitDeploymentProgress({
        deploymentId: deployment._id.toString(),
        stage: "container-replace",
        status: "running",
        message: "Starting new container",
        progress: 75,
      });

      const deployResult = await deployContainer({
        oldContainerId: null,
        image: imageTag,
        newContainerName: appName,
        ports,
        env,
        volumes,
        userId,
      });

      if (!deployResult.success) {
        throw new Error(`Container deployment failed: ${deployResult.error}`);
      }

      logs.push(...deployResult.logs.map((line) => `  ${line}`));
    }

    logs.push(`[${new Date().toISOString()}] Deployment completed successfully`);

    const duration = Date.now() - startedAt;
    const finalDeployment = await Deployment.findByIdAndUpdate(
      deployment._id,
      {
        version: imageTag,
        status: "success",
        endTime: new Date(),
        duration,
        logs,
        containers: [{ name: appName, image: imageTag, status: "running", ports }],
      },
      { new: true }
    );

    await createAlert(userId, {
      type: "deployment_success",
      severity: "info",
      title: `GitHub Deployment Successful`,
      message: `${owner}/${repo} was built and deployed as ${appName}`,
      resourceType: "deployment",
      resourceId: deployment._id.toString(),
      metadata: { repoUrl: cloneUrl, branch, imageTag, commit },
    });

    await Log.create({
      userId,
      source: "deployment",
      logType: "info",
      containerName: appName,
      message: "GitHub repository deployed automatically",
      rawLog: logs.join("\n"),
      deploymentId: deployment._id,
      metadata: { stage: "github-auto-deploy", status: "success", duration },
    });

    emitDeploymentSucceeded({
      deploymentId: deployment._id.toString(),
      version: imageTag,
      containerName: appName,
      duration,
      imageTag,
    });

    return {
      success: true,
      deployment: finalDeployment,
      imageTag,
      containerName: appName,
      commit,
      logs,
      deploymentMode: isComposeFile(buildFile) ? "compose" : "dockerfile",
    };
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] Deployment failed: ${error.message}`);

    if (deployment?._id) {
      await Deployment.findByIdAndUpdate(deployment._id, {
        status: "failed",
        endTime: new Date(),
        duration: Date.now() - startedAt,
        logs,
      });

      emitDeploymentFailed({
        deploymentId: deployment._id.toString(),
        version: deployment.version,
        containerName: appName,
        error: error.message,
        failedStage: "github-auto-deploy",
      });
    }

    await createAlert(userId, {
      type: "deployment_failed",
      severity: "critical",
      title: `GitHub Deployment Failed`,
      message: error.message,
      resourceType: "deployment",
      resourceId: deployment?._id?.toString(),
      metadata: { repoUrl: cloneUrl, branch },
    });

    return {
      success: false,
      error: error.message,
      deploymentId: deployment?._id,
      logs,
    };
  } finally {
    if (repoDir && !keepWorkspace) {
      await fs.rm(repoDir, { recursive: true, force: true });
    }
  }
}

export default {
  deployGitHubRepository,
};
