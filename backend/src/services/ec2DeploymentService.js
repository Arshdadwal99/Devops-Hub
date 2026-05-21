import { execFile } from "child_process";
import { promisify } from "util";
import { Deployment } from "../models/Deployment.js";
import { Log } from "../models/Logs.js";
import { createAlert } from "./alertService.js";
import {
  emitDeploymentStarted,
  emitDeploymentProgress,
  emitDeploymentSucceeded,
  emitDeploymentFailed,
} from "./socketEventsService.js";

const execFileAsync = promisify(execFile);

function requireEc2Config() {
  const host = process.env.AWS_EC2_HOST || process.env.EC2_HOST;
  const user = process.env.AWS_EC2_USER || process.env.EC2_USER || "ubuntu";
  const keyPath = process.env.AWS_EC2_KEY_PATH || process.env.EC2_KEY_PATH;

  if (!host || !keyPath) {
    throw new Error("AWS_EC2_HOST and AWS_EC2_KEY_PATH are required for SSH deployment");
  }

  return { host, user, keyPath };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function runSsh(command, logs) {
  const { host, user, keyPath } = requireEc2Config();
  const args = [
    "-i",
    keyPath,
    "-o",
    "StrictHostKeyChecking=no",
    "-o",
    "BatchMode=yes",
    `${user}@${host}`,
    command,
  ];

  logs.push(`[${new Date().toISOString()}] ssh ${user}@${host}: ${command}`);
  const { stdout, stderr } = await execFileAsync("ssh", args, {
    maxBuffer: 10 * 1024 * 1024,
  });

  const output = `${stdout || ""}${stderr || ""}`.trim();
  if (output) {
    logs.push(...output.split("\n").map((line) => `  ${line}`));
  }

  return output;
}

export async function deployDockerImageToEc2(options) {
  const startedAt = Date.now();
  const logs = [];
  const {
    userId = "system",
    image,
    containerName = process.env.CONTAINER_NAME || "devops-hub-app",
    version = image || new Date().toISOString(),
    ports = process.env.CONTAINER_PORTS || "3000:3000",
    env = process.env.CONTAINER_ENV || "NODE_ENV=production",
    deployedBy = "ec2-ssh",
    environment = process.env.WEBHOOK_ENVIRONMENT || "production",
    buildNumber,
    commitSha,
    repository,
  } = options;

  if (!image) {
    throw new Error("image is required for EC2 deployment");
  }

  let deployment;

  try {
    deployment = await Deployment.create({
      userId,
      version,
      buildNumber,
      commitSha,
      repository,
      status: "in-progress",
      environment,
      deploymentType: "auto",
      deployedBy,
      deploymentScript: "ec2-ssh-docker",
      startTime: new Date(),
      containers: [{ name: containerName, image, status: "pending" }],
      logs,
    });

    emitDeploymentStarted({
      deploymentId: deployment._id.toString(),
      version,
      containerName,
      target: "ec2",
    });

    emitDeploymentProgress({
      deploymentId: deployment._id.toString(),
      stage: "ec2-connect",
      status: "running",
      message: "Connecting to EC2",
      progress: 10,
    });

    const envFlags = String(env)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => `-e ${shellQuote(item)}`)
      .join(" ");

    const portFlags = String(ports)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => `-p ${shellQuote(item)}`)
      .join(" ");

    const script = [
      "set -e",
      `docker pull ${shellQuote(image)} || true`,
      `docker stop ${shellQuote(containerName)} || true`,
      `docker rm ${shellQuote(containerName)} || true`,
      "docker image prune -f || true",
      `docker run -d --restart unless-stopped --name ${shellQuote(containerName)} ${portFlags} ${envFlags} ${shellQuote(image)}`,
      `docker ps --filter name=${shellQuote(containerName)} --format '{{json .}}'`,
    ].join(" && ");

    emitDeploymentProgress({
      deploymentId: deployment._id.toString(),
      stage: "docker-deploy",
      status: "running",
      message: "Deploying container on EC2",
      progress: 55,
    });

    await runSsh(script, logs);

    const duration = Date.now() - startedAt;
    const finalDeployment = await Deployment.findByIdAndUpdate(
      deployment._id,
      {
        status: "success",
        endTime: new Date(),
        duration,
        logs,
        containers: [{ name: containerName, image, status: "running", ports: String(ports).split(",") }],
      },
      { new: true }
    );

    await Log.create({
      userId,
      source: "deployment",
      logType: "info",
      deploymentId: deployment._id,
      containerName,
      message: "EC2 SSH deployment completed successfully",
      rawLog: logs.join("\n"),
      metadata: { stage: "ec2-ssh", status: "success", duration },
    });

    await createAlert(userId, {
      type: "deployment_success",
      severity: "info",
      title: "EC2 Deployment Successful",
      message: `${image} deployed on EC2 as ${containerName}`,
      resourceType: "deployment",
      resourceId: deployment._id.toString(),
      metadata: { version },
    });

    emitDeploymentSucceeded({
      deploymentId: deployment._id.toString(),
      version,
      containerName,
      imageTag: image,
      duration,
    });

    return { success: true, deployment: finalDeployment, logs };
  } catch (error) {
    logs.push(`[${new Date().toISOString()}] EC2 deployment failed: ${error.message}`);

    if (deployment?._id) {
      await Deployment.findByIdAndUpdate(deployment._id, {
        status: "failed",
        endTime: new Date(),
        duration: Date.now() - startedAt,
        logs,
      });
    }

    await Log.create({
      userId,
      source: "deployment",
      logType: "error",
      deploymentId: deployment?._id,
      containerName,
      message: "EC2 SSH deployment failed",
      rawLog: logs.join("\n"),
      metadata: { stage: "ec2-ssh", status: "failed", exitCode: error.code },
    });

    await createAlert(userId, {
      type: "deployment_failed",
      severity: "critical",
      title: "EC2 Deployment Failed",
      message: error.message,
      resourceType: "deployment",
      resourceId: deployment?._id?.toString(),
      metadata: { version },
    });

    emitDeploymentFailed({
      deploymentId: deployment?._id?.toString(),
      version,
      containerName,
      error: error.message,
      failedStage: "ec2-ssh",
    });

    return { success: false, error: error.message, logs };
  }
}

export default {
  deployDockerImageToEc2,
};
