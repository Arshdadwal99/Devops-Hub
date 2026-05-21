import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
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

const execFileAsync = promisify(execFile);

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
  validateConfig() {
    const required = ["AWS_EC2_HOST", "AWS_EC2_KEY_PATH"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    return {
      host: process.env.AWS_EC2_HOST,
      user: process.env.AWS_EC2_USER || "ubuntu",
      keyPath: process.env.AWS_EC2_KEY_PATH,
      region: process.env.AWS_REGION || "us-east-1",
      port: process.env.AWS_EC2_PORT || 22,
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
      const errorLog = `[SSH Error] ${error.message}`;
      logs.push(errorLog);
      console.error(`❌ ${errorLog}`);
      return {
        success: false,
        error: error.message,
        logs,
      };
    }
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
      const errorLog = `[SCP Error] ${error.message}`;
      logs.push(errorLog);
      console.error(`❌ ${errorLog}`);
      return {
        success: false,
        error: error.message,
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
      containerName = "devops-app",
      containerPort = 3000,
      dockerImage,
      environment = "production",
      repository,
      commitSha,
      buildNumber,
    } = options;

    const startTime = Date.now();
    const logs = [];
    const config = this.validateConfig();

    try {
      // Create deployment record
      let deployment = await Deployment.create({
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
      const composeYaml = this.generateComposeYaml(containerName, containerPort, dockerImage);
      const composeResult = await this.executeSshCommand(
        `cat > ~/devops-app/docker-compose.yml << 'EOF'\n${composeYaml}\nEOF`,
        config,
        logs
      );

      if (!composeResult.success) {
        throw new Error("Failed to create docker-compose.yml");
      }

      // Step 3: Pull Docker image
      logs.push("📦 Step 3: Pulling Docker image...");
      let pullImageResult = await this.executeSshCommand(
        `docker pull ${dockerImage} || echo "Image pull failed, using local"`,
        config,
        logs
      );

      // Step 4: Stop old containers
      logs.push("🛑 Step 4: Stopping old containers...");
      const stopResult = await this.executeSshCommand(
        `cd ~/devops-app && docker compose down || true`,
        config,
        logs
      );

      // Step 5: Start new containers
      logs.push("▶️  Step 5: Starting new containers...");
      const upResult = await this.executeSshCommand(
        `cd ~/devops-app && docker compose up -d`,
        config,
        logs
      );

      if (!upResult.success) {
        throw new Error("Failed to start containers");
      }

      // Step 6: Wait for container to be ready
      logs.push("⏳ Step 6: Waiting for container to be ready...");
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Step 7: Get deployment IP
      logs.push("🌐 Step 7: Retrieving deployment information...");
      const ipResult = await this.executeSshCommand(
        `hostname -I | awk '{print $1}'`,
        config,
        logs
      );

      const deploymentIp = ipResult.output || config.host;

      // Step 8: Perform health check
      logs.push(`❤️  Step 8: Performing health checks on port ${containerPort}...`);
      const healthCheckResult = await this.performHealthCheck(
        containerName,
        containerPort,
        config,
        logs
      );

      if (!healthCheckResult.success) {
        logs.push("⚠️  Warning: Health check failed, but deployment may still be in progress");
      }

      // Step 9: Configure Nginx (if needed)
      logs.push("🔧 Step 9: Configuring Nginx...");
      const nginxResult = await this.configureNginx(
        containerName,
        containerPort,
        config,
        logs
      );

      // Mark deployment as successful
      deployment.status = "success";
      deployment.endTime = new Date();
      deployment.duration = Date.now() - startTime;
      deployment.containers[0].status = "running";
      deployment.logs = logs;
      await deployment.save();

      // Create alert
      await createAlert({
        type: "deployment",
        severity: "info",
        title: "Deployment Successful",
        message: `Application deployed to EC2 at ${deploymentIp}:${containerPort}`,
        deploymentId: deployment._id,
      });

      emitDeploymentSucceeded({
        deploymentId: deployment._id.toString(),
        containerName,
        deploymentUrl: `http://${deploymentIp}:${containerPort}`,
        deploymentIp,
      });

      this.deployments.delete(deploymentId);

      return {
        success: true,
        deploymentId: deployment._id.toString(),
        deploymentUrl: `http://${deploymentIp}:${containerPort}`,
        deploymentIp,
        containerName,
        duration: deployment.duration,
        logs,
      };
    } catch (error) {
      console.error("❌ Deployment failed:", error.message);

      deployment.status = "failed";
      deployment.endTime = new Date();
      deployment.duration = Date.now() - startTime;
      deployment.logs = logs;
      deployment.deploymentError = error.message;
      await deployment.save();

      await createAlert({
        type: "deployment",
        severity: "critical",
        title: "Deployment Failed",
        message: `EC2 deployment failed: ${error.message}`,
        deploymentId: deployment._id,
      });

      emitDeploymentFailed({
        deploymentId: deployment._id.toString(),
        error: error.message,
      });

      this.deployments.delete(deploymentId);

      return {
        success: false,
        deploymentId: deployment._id.toString(),
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
          if curl -f http://localhost:${containerPort} > /dev/null 2>&1; then
            echo "✅ Health check passed";
            exit 0;
          fi;
          echo "Attempt $i/30: Waiting for service on port ${containerPort}...";
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
      - "${containerPort}:${containerPort}"
    environment:
      NODE_ENV: production
      PORT: ${containerPort}
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${containerPort}"]
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
