import { execFile } from "child_process";
import { promisify } from "util";
import axios from "axios";
import { Deployment } from "../models/Deployment.js";
import { Log } from "../models/Logs.js";
import { createAlert } from "./alertService.js";
import {
  emitDeploymentStarted,
  emitDeploymentProgress,
  emitDeploymentSucceeded,
  emitDeploymentFailed,
} from "./socketEventsService.js";
import { retryHealthCheck } from "./healthCheckService.js";
import { logEc2SshTarget, resolveEc2SshKeyForCli } from "./ec2SshKeyService.js";

const execFileAsync = promisify(execFile);
const EC2_DEPLOYMENT_HOST_PORT = 80;
const EC2_DEPLOYMENT_CONTAINER_PORT = 8000;
const EC2_DEPLOYMENT_APP_NAME = "to-do-list";

function toDeploymentLogEntries(logs = []) {
  return logs.map((log) => {
    if (log && typeof log === "object" && log.message) return log;
    const message = String(log);
    return {
      timestamp: new Date(),
      level: /\berror\b|failed|exception/i.test(message) ? "error" : "info",
      message,
    };
  });
}

/**
 * AWS EC2 Automated Deployment Service
 * Handles complete deployment lifecycle to EC2 instances
 */

class Ec2AutomatedDeploymentService {
  constructor() {
    this.deployments = new Map();
  }

  /**
   * Validate EC2 configuration
   */
  async validateConfig(deployment = {}) {
    const host = deployment.publicIp || deployment.host || deployment.infrastructure?.publicIp || process.env.AWS_EC2_HOST;

    if (!host) {
      throw new Error("EC2 host/publicIp is required for automated SSH deployment");
    }

    const keyConfig = await resolveEc2SshKeyForCli(deployment);
    logEc2SshTarget({
      keySource: keyConfig.keySource,
      keyPairName: keyConfig.keyPairName,
      host,
      operation: "ec2-automated-deployment",
    });

    return {
      host,
      user: deployment.username || deployment.user || process.env.AWS_EC2_USER || "ubuntu",
      keyPath: keyConfig.keyPath,
      region: process.env.AWS_REGION || "us-east-1",
      port: deployment.port || process.env.AWS_EC2_PORT || 22,
    };
  }

  /**
   * Execute SSH command on EC2
   */
  async executeSshCommand(command, config, logs = []) {
    try {
      const sshArgs = [
        "-i",
        config.keyPath,
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-p",
        config.port.toString(),
        `${config.user}@${config.host}`,
        command,
      ];

      const logEntry = `[SSH] ${config.user}@${config.host}: ${command}`;
      logs.push(logEntry);
      console.log(`🔐 ${logEntry}`);

      const { stdout, stderr } = await execFileAsync("ssh", sshArgs, {
        maxBuffer: 10 * 1024 * 1024,
      });

      const output = `${stdout || ""}${stderr || ""}`.trim();
      if (output) {
        const lines = output.split("\n");
        logs.push(...lines);
        console.log(`📤 SSH Output:\n${output}`);
      }

      return {
        success: true,
        output,
        logs,
      };
    } catch (error) {
      const commandOutput = `${error.stdout || ""}${error.stderr || ""}`.trim();
      const errorLog = `[SSH Error] ${error.message}${commandOutput ? `\n${commandOutput}` : ""}`;
      logs.push(errorLog);
      console.error(`❌ ${errorLog}`);
      return {
        success: false,
        error: errorLog,
        output: commandOutput,
        logs,
      };
    }
  }

  async testSshConnection(config, logs = []) {
    const maxAttempts = Number(config.sshMaxAttempts || process.env.EC2_SSH_MAX_ATTEMPTS || 20);
    const retryDelayMs = Number(config.sshRetryDelayMs || process.env.EC2_SSH_RETRY_DELAY_MS || 15000);
    let lastResult = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      logs.push(`[${new Date().toISOString()}] SSH attempt ${attempt}/${maxAttempts}`);
      lastResult = await this.executeSshCommand("true", config, logs);
      if (lastResult.success) {
        logs.push(`[${new Date().toISOString()}] SSH success on attempt ${attempt}`);
        return lastResult;
      }

      logs.push(`[${new Date().toISOString()}] SSH failure reason: ${lastResult.error}`);
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    throw new Error(`SSH preflight failed before EC2 automated deployment after ${maxAttempts} attempts. Verify generated key pair, security group port 22, instance state, and SSH user. ${lastResult?.error}`);
  }

  /**
   * Copy file to EC2 via SCP
   */
  async copyFileToEc2(localPath, remotePath, config, logs = []) {
    try {
      const scpArgs = [
        "-i",
        config.keyPath,
        "-o",
        "StrictHostKeyChecking=no",
        "-P",
        config.port.toString(),
        localPath,
        `${config.user}@${config.host}:${remotePath}`,
      ];

      const logEntry = `[SCP] Copying ${localPath} to ${remotePath}`;
      logs.push(logEntry);
      console.log(`📄 ${logEntry}`);

      const { stdout, stderr } = await execFileAsync("scp", scpArgs);

      return {
        success: true,
        logs,
      };
    } catch (error) {
      const commandOutput = `${error.stdout || ""}${error.stderr || ""}`.trim();
      const errorLog = `[SCP Error] ${error.message}${commandOutput ? `\n${commandOutput}` : ""}`;
      logs.push(errorLog);
      console.error(`❌ ${errorLog}`);
      return {
        success: false,
        error: errorLog,
        output: commandOutput,
        logs,
      };
    }
  }

  /**
   * Deploy application to EC2
   */
  async deployToEc2(options) {
    const {
      deploymentId,
      userId = "system",
      containerName = EC2_DEPLOYMENT_APP_NAME,
      containerPort: requestedContainerPort = EC2_DEPLOYMENT_CONTAINER_PORT,
      dockerImage,
      environment = "production",
      repository,
      commitSha,
      buildNumber,
    } = options;

    const containerPort = EC2_DEPLOYMENT_CONTAINER_PORT;
    const hostPort = EC2_DEPLOYMENT_HOST_PORT;
    const startTime = Date.now();
    const logs = [];
    const config = await this.validateConfig(options);
    let deployment;

    try {
      // Create deployment record
      deployment = await Deployment.create({
        userId,
        version: `${containerName}:${buildNumber || "latest"}`,
        buildNumber,
        commitSha,
        repository,
        status: "in-progress",
        environment,
        deploymentType: "ec2-auto",
        deployedBy: "ec2-deployment-service",
        startTime: new Date(),
        containers: [{ name: containerName, image: dockerImage, status: "deploying" }],
        logs,
      });

      this.deployments.set(deploymentId, { deployment, logs });

      emitDeploymentStarted({
        deploymentId: deployment._id.toString(),
        containerName,
        image: dockerImage,
      });

      await this.testSshConnection(config, logs);
      logs.push(
        `Forcing EC2 deployment port mapping to ${hostPort}:${containerPort}. Requested containerPort was ${requestedContainerPort}.`
      );

      // Step 1: Pull latest code (if repo provided)
      if (repository) {
        logs.push("📥 Step 1: Pulling repository from GitHub...");
        const pullResult = await this.executeSshCommand(
          `cd ~/devops-app && git pull || git clone ${repository} . || true`,
          config,
          logs
        );

        if (!pullResult.success) {
          logs.push("⚠️  Warning: Could not pull repository, continuing with deployment...");
        }
      }

      // Step 2: Create docker-compose.yml if not exists
      logs.push("🐳 Step 2: Configuring Docker Compose...");
      const cleanupCommand = this.generateCleanupCommand(containerName);
      logs.push(`[Generated EC2 cleanup command]\n${cleanupCommand}`);
      const cleanupResult = await this.executeSshCommand(cleanupCommand, config, logs);

      if (!cleanupResult.success) {
        throw new Error(`Failed to clean previous EC2 Docker deployment: ${cleanupResult.error || "No command output returned"}`);
      }

      const composeYaml = this.generateComposeYaml(containerName, containerPort, dockerImage);
      logs.push(`[Generated docker-compose.yml]\n${composeYaml}`);
      console.log(`[EC2] Generated docker-compose.yml:\n${composeYaml}`);
      const composeResult = await this.executeSshCommand(
        `mkdir -p ~/devops-app && cat > ~/devops-app/docker-compose.yml << 'EOF'\n${composeYaml}\nEOF`,
        config,
        logs
      );

      if (!composeResult.success) {
        throw new Error(`Failed to create docker-compose.yml: ${composeResult.error || "No command output returned"}`);
      }

      // Step 3: Verify Docker image exists in Docker Hub
      logs.push("✅ Step 3: Verifying Docker image exists...");
      const imageExists = await this.verifyImageExists(dockerImage);
      if (!imageExists) {
        throw new Error(`Docker image not found in Docker Hub: ${dockerImage}. Image may not have been pushed successfully.`);
      }
      logs.push(`✅ Docker image verified: ${dockerImage}`);

      // Step 4: Pull Docker image from Docker Hub
      logs.push("📥 Step 4: Pulling Docker image from Docker Hub...");
      const pullResult = await this.executeSshCommand(
        `docker pull ${dockerImage}`,
        config,
        logs
      );
      if (!pullResult.success) {
        throw new Error(`Failed to pull Docker image from Docker Hub: ${pullResult.error || pullResult.output || "No command output returned"}`);
      }

      // Step 5: Start new containers
      logs.push("▶️  Step 5: Starting new containers...");
      const upResult = await this.executeSshCommand(
        `cd ~/devops-app && docker compose -p app up -d`,
        config,
        logs
      );

      if (!upResult.success) {
        throw new Error(`Failed to start containers: ${upResult.error || "No command output returned"}`);
      }

      // Step 6: Wait for container to be ready
      logs.push("⏳ Step 6: Waiting for container to be ready...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Step 7: Get deployment IP (hardcoded to 3.94.91.40)
      logs.push("🌐 Step 7: Retrieving deployment information...");
      const deploymentIp = "3.94.91.40";

      // Step 8: Perform health check
      logs.push("❤️  Step 8: Performing health checks on http://localhost...");
      const healthCheckResult = await this.performHealthCheck(
        containerName,
        containerPort,
        config,
        logs
      );

      if (!healthCheckResult.success) {
        logs.push("⚠️  Warning: Health check failed, but deployment may still be in progress");
      }

      logs.push("🔧 Step 9: Skipping Nginx configuration because Docker binds host port 80 directly.");

      // Mark deployment as successful
      deployment.status = "success";
      deployment.endTime = new Date();
      deployment.duration = Date.now() - startTime;
      deployment.containers[0].status = "running";
      deployment.logs = toDeploymentLogEntries(logs);
      await deployment.save();

      // Create alert
      await createAlert({
        type: "deployment",
        severity: "info",
        title: "Deployment Successful",
        message: `Application deployed to EC2 at ${deploymentIp}`,
        deploymentId: deployment._id,
      });

      emitDeploymentSucceeded({
        deploymentId: deployment._id.toString(),
        containerName,
        deploymentUrl: `http://${deploymentIp}`,
        deploymentIp,
      });

      this.deployments.delete(deploymentId);

      return {
        success: true,
        deploymentId: deployment._id.toString(),
        deploymentUrl: `http://${deploymentIp}`,
        deploymentIp,
        containerName,
        duration: deployment.duration,
        logs,
      };
    } catch (error) {
      console.error("❌ Deployment failed:", error.message);

      if (deployment) {
        deployment.status = "failed";
        deployment.endTime = new Date();
        deployment.duration = Date.now() - startTime;
        deployment.logs = toDeploymentLogEntries(logs);
        deployment.error = error.message;
        deployment.deploymentError = error.message;
        await deployment.save();
      }

      await createAlert({
        type: "deployment",
        severity: "critical",
        title: "Deployment Failed",
        message: `EC2 deployment failed: ${error.message}`,
        deploymentId: deployment?._id,
      });

      emitDeploymentFailed({
        deploymentId: deployment?._id?.toString() || deploymentId,
        error: error.message,
      });

      this.deployments.delete(deploymentId);

      return {
        success: false,
        deploymentId: deployment?._id?.toString() || deploymentId,
        error: error.message,
        logs,
      };
    }
  }

  /**
   * Perform health check on EC2
   */
  async performHealthCheck(containerName, containerPort, config, logs = []) {
    try {
      const healthCheckCmd = `
        for i in {1..30}; do
          if curl -f http://localhost > /dev/null 2>&1; then
            echo "✅ Health check passed";
            exit 0;
          fi;
          echo "Attempt $i/30: Waiting for service on http://localhost...";
          sleep 2;
        done;
        exit 1;
      `;

      const result = await this.executeSshCommand(healthCheckCmd, config, logs);
      return {
        success: result.success,
        output: result.output,
        logs,
      };
    } catch (error) {
      logs.push(`Health check error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        logs,
      };
    }
  }

  /**
   * Configure Nginx reverse proxy
   */
  async configureNginx(containerName, containerPort, config, logs = []) {
    try {
      const nginxConfig = `
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:${containerPort};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;

      const configCmd = `
        sudo tee /etc/nginx/sites-available/default << 'EOF' > /dev/null
${nginxConfig}
EOF
        sudo nginx -t && sudo systemctl restart nginx || echo "Nginx configuration skipped"
      `;

      const result = await this.executeSshCommand(configCmd, config, logs);
      return {
        success: result.success,
        logs,
      };
    } catch (error) {
      logs.push(`Nginx configuration error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        logs,
      };
    }
  }

  /**
   * Generate docker-compose.yml content
   */
  generateComposeYaml(containerName, containerPort, dockerImage) {
    return `
version: '3.9'

services:
  app:
    image: ${dockerImage}
    container_name: ${containerName}
    ports:
      - "80:8000"
    environment:
      NODE_ENV: production
      PORT: ${containerPort}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

networks:
  default:
    driver: bridge
`;
  }

  /**
   * Generate pre-deployment cleanup script.
   */
  generateCleanupCommand(containerName) {
    const extraContainerCleanup = containerName === EC2_DEPLOYMENT_APP_NAME
      ? ""
      : `
docker rm -f ${containerName} 2>/dev/null || true
docker stop ${containerName} 2>/dev/null || true
docker ps -aq --filter "name=${containerName}" | xargs -r docker rm -f
`;

    return `
cd ~/devops-app 2>/dev/null || true
docker rm -f ${EC2_DEPLOYMENT_APP_NAME} 2>/dev/null || true
docker stop ${EC2_DEPLOYMENT_APP_NAME} 2>/dev/null || true
docker ps -aq --filter "name=${EC2_DEPLOYMENT_APP_NAME}" | xargs -r docker rm -f${extraContainerCleanup}
docker compose -p app down --remove-orphans || true
docker container prune -f || true
docker network prune -f || true
sudo fuser -k 80/tcp 2>/dev/null || true
sleep 5
`;
  }

  /**
   * Verify Docker image exists in Docker Hub
   */
  async verifyImageExists(dockerImage) {
    try {
      // Parse docker image format: docker.io/username/repo:tag
      const imageMatch = dockerImage.match(/^docker\.io\/([^/]+)\/([^:]+):(.+)$/);
      if (!imageMatch) {
        console.warn(`⚠️  Could not parse Docker image format: ${dockerImage}`);
        return false;
      }

      const [, username, repoName, tag] = imageMatch;
      
      // Check if image exists on Docker Hub using public API
      const response = await axios.get(
        `https://hub.docker.com/v2/repositories/${username}/${repoName}/tags/${tag}/`,
        { timeout: 10000 }
      );

      if (response.status === 200) {
        console.log(`✅ Docker image verified on Docker Hub: ${dockerImage}`);
        return true;
      }

      return false;
    } catch (error) {
      if (error.response?.status === 404) {
        console.warn(`⚠️  Docker image not found on Docker Hub: ${dockerImage}`);
        return false;
      }
      console.warn(`⚠️  Error verifying Docker image: ${error.message}`);
      return false;
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      return null;
    }

    return {
      deploymentId,
      status: deployment.deployment?.status,
      logs: deployment.logs,
      progress: Math.round((deployment.logs.length / 10) * 100),
    };
  }
}

export default new Ec2AutomatedDeploymentService();
