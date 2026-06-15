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
import { INSTANCE_TYPE, getConfiguredInstanceType } from "./freeTierInstanceTypes.js";
import { logEc2SshTarget, resolveEc2SshKeyForCli } from "./ec2SshKeyService.js";
import { ec2AutomaticSSHDeploymentService } from "./ec2AutomaticSSHDeploymentService.js";
import { logger } from "../utils/logger.js";

const execFileAsync = promisify(execFile);

async function requireEc2Config(deployment = {}) {
  const host =
    deployment.publicIp ||
    deployment.host ||
    deployment.infrastructure?.publicIp ||
    deployment.ec2Instance?.publicIp ||
    process.env.AWS_EC2_HOST ||
    process.env.EC2_HOST;
  const user =
    deployment.username ||
    deployment.user ||
    deployment.infrastructure?.username ||
    deployment.ec2Instance?.username ||
    process.env.AWS_EC2_USER ||
    process.env.EC2_USER ||
    "ubuntu";

  if (!host) {
    throw new Error("AWS_EC2_HOST is required for SSH deployment");
  }

  const keyConfig = await resolveEc2SshKeyForCli(deployment);
  logEc2SshTarget({
    keySource: keyConfig.keySource,
    keyPairName: keyConfig.keyPairName,
    host,
    operation: "ec2-ssh-deployment",
  });

  return { host, user, keyPath: keyConfig.keyPath };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function runSsh(command, logs, deployment = {}) {
  const { host, user, keyPath } = await requireEc2Config(deployment);
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

async function testSshConnection(logs, deployment = {}) {
  const maxAttempts = Number(deployment.sshMaxAttempts || process.env.EC2_SSH_MAX_ATTEMPTS || 20);
  const retryDelayMs = Number(deployment.sshRetryDelayMs || process.env.EC2_SSH_RETRY_DELAY_MS || 15000);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      logs.push(`[${new Date().toISOString()}] SSH attempt ${attempt}/${maxAttempts}`);
      await runSsh("true", logs, deployment);
      logs.push(`[${new Date().toISOString()}] SSH success on attempt ${attempt}`);
      return;
    } catch (error) {
      lastError = error;
      logs.push(`[${new Date().toISOString()}] SSH failure reason: ${error.message}`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
  }

  throw new Error(
    `SSH preflight failed before EC2 deployment after ${maxAttempts} attempts. Verify generated key pair, security group port 22, instance state, and SSH user. ${lastError?.message || ""}`
  );
}

export async function deployDockerImageToEc2(options) {
  const startedAt = Date.now();
  const logs = [];
  const instanceType = getConfiguredInstanceType(options.instanceType || INSTANCE_TYPE);
  const {
    userId = "system",
    image,
    containerName = "to-do-list",
    version = image || new Date().toISOString(),
    ports = "",
    env = process.env.CONTAINER_ENV || "NODE_ENV=production",
    deployedBy = "ec2-ssh",
    environment = process.env.WEBHOOK_ENVIRONMENT || "production",
    buildNumber,
    commitSha,
    repository,
    instanceId,
    publicIp,
    publicDns,
    osIdentifier = "ubuntu",
    generatedKeyName,
    generatedPrivateKey,
    generatedKeyMaterial,
    keyPairName,
    privateKey,
  } = options;

  if (!image) {
    throw new Error("image is required for EC2 deployment");
  }

  let deployment;

  try {
    // ✅ STEP 1: Create deployment record with generated key metadata
    const sshDeployment = {
      instanceId,
      publicIp,
      publicDns,
      generatedKeyName: generatedKeyName || keyPairName,
      generatedPrivateKey: generatedPrivateKey || generatedKeyMaterial || privateKey,
      keyPairName: generatedKeyName || keyPairName,
      privateKey: generatedPrivateKey || generatedKeyMaterial || privateKey,
      username: options.username,
    };

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
      deploymentScript: "ec2-ssh-docker-automated",
      startTime: new Date(),
      containers: [{ name: containerName, image, status: "pending" }],
      logs,
      ec2Instance: {
        instanceType,
        instanceId,
        publicIp,
        publicDns,
        osIdentifier,
        keyPairName: sshDeployment.keyPairName,
        generatedKeyName: sshDeployment.generatedKeyName,
        generatedPrivateKey: sshDeployment.generatedPrivateKey,
      },
    });

    const deploymentId = deployment._id.toString();
    logs.push(`[DEPLOYMENT_STARTED] 🚀 deploymentId: ${deploymentId}`);
    logs.push(`[INSTANCE_INFO] instanceId: ${instanceId}, publicIp: ${publicIp}, osType: ${osIdentifier}`);
    logs.push(`[KEY_PAIR] Using generated key: ${sshDeployment.generatedKeyName}`);

    emitDeploymentStarted({
      deploymentId,
      version,
      containerName,
      target: "ec2",
    });

    // ✅ STEP 2: Execute automated SSH deployment (install Docker, Docker Compose, Git)
    logger.info("🔨 Executing automated SSH deployment (Docker, Docker Compose, Git installation)", {
      deploymentId,
      instanceId,
      publicIp,
    });

    emitDeploymentProgress({
      deploymentId,
      stage: "ec2-bootstrap",
      status: "running",
      message: "Installing Docker and dependencies on EC2...",
      progress: 15,
    });

    logs.push(`[BOOTSTRAP_START] ⏳ Installing Docker, Docker Compose, and Git on EC2...`);

    const bootstrapResult = await ec2AutomaticSSHDeploymentService.executeAutomatedDeployment({
      deploymentId,
      instanceId,
      publicIp,
      publicDns,
      osIdentifier,
      deployment: sshDeployment,
    });

    logs.push(`[BOOTSTRAP_COMPLETE] ✅ Bootstrap successful`);
    logs.push(`[BOOTSTRAP_LOGS] ${JSON.stringify(bootstrapResult.logs.slice(-5))}`);
    logs.push(`[INSTALLATIONS] Docker: ${bootstrapResult.installations.docker.success}, Compose: ${bootstrapResult.installations.dockerCompose.success}, Git: ${bootstrapResult.installations.git.success}`);

    emitDeploymentProgress({
      deploymentId,
      stage: "ec2-bootstrap",
      status: "complete",
      message: "Docker and dependencies installed successfully",
      progress: 40,
    });

    // ✅ STEP 3: Deploy Docker container
    logger.info("🐳 Deploying Docker container to EC2", {
      deploymentId,
      image,
      containerName,
    });

    emitDeploymentProgress({
      deploymentId,
      stage: "docker-deploy",
      status: "running",
      message: "Pulling and deploying Docker container...",
      progress: 55,
    });

    logs.push(`[DOCKER_DEPLOY_START] 🐳 Deploying container: ${containerName}, image: ${image}`);

    const deployResult = await ec2AutomaticSSHDeploymentService.deployDockerContainer({
      host: publicIp,
      username: bootstrapResult.username,
      privateKey: sshDeployment.generatedPrivateKey,
      deploymentId,
      image,
      containerName,
      ports,
      environment: parseEnvironmentVariables(env),
    });

    logs.push(`[DOCKER_DEPLOY_SUCCESS] ✅ Container deployed: ${containerName}`);
    logs.push(`[CONTAINER_OUTPUT] ${deployResult.output}`);

    // ✅ STEP 4: Update deployment record with success status
    const duration = Date.now() - startedAt;
    
    const exposedPortMatch = String(deployResult.output || "").match(/exposed_port=(\d+)/);
    const containerPort = exposedPortMatch ? Number(exposedPortMatch[1]) : undefined;
    
    // Construct application URL
    const appUrlForRecord = publicIp ? `http://${publicIp}` : undefined;

    const finalDeployment = await Deployment.findByIdAndUpdate(
      deployment._id,
      {
        status: "success",
        endTime: new Date(),
        duration,
        logs,
        applicationUrl: appUrlForRecord,
        deploymentEndpoint: {
          publicIp,
          publicDns,
          instanceId,
          containerPort,
          publicPort: 80,
          imageName: image,
          healthStatus: "healthy",
          isLive: true,
          logs: deployResult.deploymentLogs || deployResult.output,
        },
        containers: [
          {
            name: containerName,
            image,
            status: "running",
            ports: containerPort ? [`80:${containerPort}`] : ["80"],
          },
        ],
      },
      { new: true }
    );

    await Log.create({
      userId,
      source: "deployment",
      logType: "info",
      deploymentId: deployment._id,
      containerName,
      message: "✅ EC2 SSH automated deployment completed successfully",
      rawLog: logs.join("\n"),
      metadata: {
        stage: "ec2-ssh-automated",
        status: "success",
        duration,
        bootstrapDuration: bootstrapResult.duration,
        osType: osIdentifier,
      },
    });

    await createAlert(userId, {
      type: "deployment_success",
      severity: "info",
      title: "✅ EC2 Deployment Successful",
      message: `${image} deployed on EC2 as ${containerName}. Auto-installed Docker, Docker Compose, and Git.`,
      resourceType: "deployment",
      resourceId: deploymentId,
      metadata: { version, containerName },
    });

    emitDeploymentSucceeded({
      deploymentId,
      version,
      containerName,
      imageTag: image,
      duration,
    });

    emitDeploymentProgress({
      deploymentId,
      stage: "deployment-complete",
      status: "complete",
      message: "Deployment complete",
      progress: 100,
    });

    // ✅ STEP 5: Return complete deployment info
    const appUrl = finalDeployment.applicationUrl || (publicIp ? `http://${publicIp}:${containerPort}` : undefined);
    const jenkinsUrl = publicIp ? `http://${publicIp}:8080` : undefined;

    const result = {
      success: true,
      deploymentId,
      instanceId,
      publicIp,
      publicDns,
      appUrl,
      jenkinsUrl,
      containerPort,
      imageName: image,
      status: "completed",
      deployment: finalDeployment,
      logs,
      metrics: {
        duration,
        containerName,
        image,
        osType: osIdentifier,
        sshAttempts: bootstrapResult.sshAttempts,
      },
    };

    logger.info("✅ EC2 deployment completed successfully", {
      deploymentId,
      appUrl,
      jenkinsUrl,
      duration,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startedAt;
    const errorMessage = error.message || String(error);

    logs.push(`[DEPLOYMENT_FAILED] ❌ Error: ${errorMessage}`);
    logs.push(`[STACK_TRACE] ${error.stack}`);

    if (deployment?._id) {
      await Deployment.findByIdAndUpdate(deployment._id, {
        status: "failed",
        endTime: new Date(),
        duration,
        logs,
      });
    }

    await Log.create({
      userId,
      source: "deployment",
      logType: "error",
      deploymentId: deployment?._id,
      containerName,
      message: `❌ EC2 SSH automated deployment failed: ${errorMessage}`,
      rawLog: logs.join("\n"),
      metadata: {
        stage: "ec2-ssh-automated",
        status: "failed",
        duration,
        errorType: error.name,
      },
    });

    await createAlert(userId, {
      type: "deployment_failed",
      severity: "critical",
      title: "❌ EC2 Deployment Failed",
      message: errorMessage,
      resourceType: "deployment",
      resourceId: deployment?._id?.toString(),
      metadata: { version },
    });

    emitDeploymentFailed({
      deploymentId: deployment?._id?.toString(),
      version,
      containerName,
      error: errorMessage,
      failedStage: "ec2-ssh-automated",
    });

    logger.error("❌ EC2 deployment failed", {
      deploymentId: deployment?._id?.toString(),
      error: errorMessage,
      duration,
    });

    return { success: false, error: errorMessage, logs };
  }
}

/**
 * Parse environment variables from comma-separated string
 * Format: "KEY1=value1,KEY2=value2"
 */
function parseEnvironmentVariables(envString) {
  const env = {};
  if (!envString) return env;

  const pairs = String(envString).split(",");
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.trim().split("=");
    const value = valueParts.join("="); // Handle values with = in them
    if (key && value) {
      env[key.trim()] = value.trim();
    }
  }

  return env;
}

export default {
  deployDockerImageToEc2,
};
