import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Deployment } from "../models/Deployment.js";
import { User } from "../models/User.js";

const WORKSPACE_ROOT = path.resolve(process.cwd(), "deployment-workspaces");

function getDeploymentId() {
  return `deploy-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function getUserId(user) {
  return user?.userId || user?.uid || user?.id || "system";
}

async function getGitHubAccessToken(userId) {
  const user = await User.findById(userId).select("+githubAccessToken");

  if (!user || !user.githubAccessToken) {
    throw new Error("GitHub not connected");
  }

  return user.githubAccessToken;
}

function buildAuthenticatedCloneUrl(owner, repositoryName, accessToken) {
  const safeOwner = encodeURIComponent(owner);
  const safeRepo = encodeURIComponent(repositoryName);
  return `https://x-access-token:${accessToken}@github.com/${safeOwner}/${safeRepo}.git`;
}

function runGitClone({ cloneUrl, branch, workspacePath }) {
  return new Promise((resolve, reject) => {
    const args = ["clone", "--depth", "1"];

    if (branch) {
      args.push("--branch", branch);
    }

    args.push(cloneUrl, workspacePath);

    const child = spawn("git", args, {
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(new Error(stderr || stdout || `git clone exited with code ${code}`));
    });
  });
}

function runGitRevParse({ workspacePath }) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["rev-parse", "HEAD"], {
      cwd: workspacePath,
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }

      reject(new Error(stderr || stdout || `git rev-parse exited with code ${code}`));
    });
  });
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (_error) {
    return false;
  }
}

async function readOptionalFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (_error) {
    return null;
  }
}

async function validateRepository(workspacePath) {
  const packageJsonPath = path.join(workspacePath, "package.json");
  const requirementsPath = path.join(workspacePath, "requirements.txt");
  const pomPath = path.join(workspacePath, "pom.xml");
  const dockerfilePath = path.join(workspacePath, "Dockerfile");
  const jenkinsfilePath = path.join(workspacePath, "Jenkinsfile");
  const dockerComposePath = path.join(workspacePath, "docker-compose.yml");
  const dockerComposeYamlPath = path.join(workspacePath, "docker-compose.yaml");

  const hasPackageJson = await fileExists(packageJsonPath);
  const hasRequirements = await fileExists(requirementsPath);
  const hasPom = await fileExists(pomPath);
  const hasDockerfile = await fileExists(dockerfilePath);
  const hasJenkinsfile = await fileExists(jenkinsfilePath);
  const hasDockerCompose = (await fileExists(dockerComposePath)) || (await fileExists(dockerComposeYamlPath));

  const notes = [];

  if (!hasPackageJson && !hasRequirements && !hasPom) {
    notes.push("No primary project manifest detected");
  }

  const dockerfileContent = hasDockerfile ? await readOptionalFile(dockerfilePath) : null;
  const jenkinsfileContent = hasJenkinsfile ? await readOptionalFile(jenkinsfilePath) : null;

  const dockerfileValid = hasDockerfile ? Boolean(dockerfileContent?.trim()) : false;
  const jenkinsfileValid = hasJenkinsfile ? Boolean(jenkinsfileContent?.trim()) : false;

  if (hasDockerfile && !dockerfileValid) {
    notes.push("Dockerfile is present but empty");
  }

  if (hasJenkinsfile && !jenkinsfileValid) {
    notes.push("Jenkinsfile is present but empty");
  }

  return {
    hasPackageJson,
    hasRequirements,
    hasPom,
    hasDockerfile,
    hasJenkinsfile,
    hasDockerCompose,
    dockerfileValid,
    jenkinsfileValid,
    notes,
  };
}

export async function prepareDeploymentWorkspace({ user, repositoryOwner, repositoryName, branch = "main", repositoryId }) {
  const userId = getUserId(user);
  const deploymentId = getDeploymentId();
  const workspacePath = path.join(WORKSPACE_ROOT, deploymentId, repositoryName);
  const projectId = repositoryId ? String(repositoryId) : `${repositoryOwner}/${repositoryName}`;

  const deployment = await Deployment.create({
    userId,
    deploymentId,
    projectId,
    repository: repositoryName,
    owner: repositoryOwner,
    branch,
    deploymentStage: "PREPARED",
    setup: {
      repositoryConnected: true,
      analyzed: false,
      readinessReported: false,
      deploymentFilesGenerated: false,
      dockerHubConnected: false,
      ec2Connected: false,
      cicdGenerated: false,
      autoDeployEnabled: false,
      updatedAt: new Date(),
    },
    status: "PENDING",
    version: deploymentId,
    deploymentType: "workspace-prepare",
    deployedBy: user?.email || "api-user",
    workspacePath,
    startTime: new Date(),
    logs: ["Deployment workspace record created"],
  });

  try {
    await Deployment.findByIdAndUpdate(deployment._id, {
      status: "PREPARING",
      updatedAt: new Date(),
      $push: { logs: "Preparing temporary deployment workspace" },
    });

    await fs.mkdir(path.dirname(workspacePath), { recursive: true });

    const accessToken = await getGitHubAccessToken(userId);
    const cloneUrl = buildAuthenticatedCloneUrl(repositoryOwner, repositoryName, accessToken);

    await runGitClone({
      cloneUrl,
      branch,
      workspacePath,
    });

    const commitSha = await runGitRevParse({ workspacePath });
    const validation = await validateRepository(workspacePath);

    const readyDeployment = await Deployment.findByIdAndUpdate(
      deployment._id,
      {
        status: "READY_FOR_BUILD",
        commitSha,
        deploymentStage: "PREPARED",
        "setup.repositoryConnected": true,
        "setup.analyzed": true,
        "setup.readinessReported": true,
        "setup.updatedAt": new Date(),
        validation,
        updatedAt: new Date(),
        endTime: new Date(),
        $push: {
          logs: {
            $each: [
              "Repository cloned into deployment workspace",
              "Repository structure validated",
              "Deployment readiness report generated",
            ],
          },
        },
      },
      { new: true }
    );

    return {
      success: true,
      deploymentId,
      status: "READY_FOR_BUILD",
      deployment: readyDeployment,
      projectId,
      commitSha,
      workspace: {
        path: workspacePath,
        projectId,
        repositoryOwner,
        repositoryName,
        branch,
      },
      validation,
      steps: [
        { key: "clone", label: "Cloning Repository", status: "completed" },
        { key: "validate", label: "Validating Files", status: "completed" },
        { key: "workspace", label: "Preparing Workspace", status: "completed" },
        { key: "ready", label: "Ready For Build", status: "completed" },
      ],
    };
  } catch (error) {
    const failedDeployment = await Deployment.findByIdAndUpdate(
      deployment._id,
      {
        status: "FAILED",
        updatedAt: new Date(),
        endTime: new Date(),
        $push: { logs: `Workspace preparation failed: ${error.message}` },
      },
      { new: true }
    );

    return {
      success: false,
      deploymentId,
      status: "FAILED",
      deployment: failedDeployment,
      error: error.message,
      steps: [
        { key: "clone", label: "Cloning Repository", status: "failed" },
        { key: "validate", label: "Validating Files", status: "pending" },
        { key: "workspace", label: "Preparing Workspace", status: "pending" },
        { key: "ready", label: "Ready For Build", status: "pending" },
      ],
    };
  }
}
