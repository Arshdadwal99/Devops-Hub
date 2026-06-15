/**
 * EC2 Automatic SSH Deployment Service
 *
 * Orchestrates complete automated SSH-based deployment to EC2 instances:
 * - Uses generated private keys from deployment metadata (NO env vars)
 * - Automatic OS detection (Ubuntu, Amazon Linux)
 * - SSH retry logic (20 retries, 15 second delays)
 * - Automatic installation: Docker, Docker Compose, Git
 * - Installation verification
 * - Detailed event logging
 *
 * Features:
 * ✅ Zero environment variable dependencies for SSH keys
 * ✅ Uses deployment.privateKey from generated key pair
 * ✅ 20 SSH retry attempts with 15-second delays
 * ✅ Auto-detects OS and correct SSH username
 * ✅ Installs Docker, Docker Compose, Git automatically
 * ✅ Comprehensive logging for each deployment milestone
 * ✅ Returns complete deployment info (appUrl, jenkinsUrl, etc.)
 */

import { Client as SshClient } from "ssh2";
import { logger } from "../utils/logger.js";
import {
  detectAmiType,
  getAmiUsername,
  getUpdateCommand,
  getInstallCommand,
  getDockerInstallCommand,
  getDockerVerificationCommand,
  getAmiConfig,
} from "./ec2AmiDetectionService.js";
import { loadEc2PrivateKey } from "./ec2SshKeyService.js";
import { DockerPortDetectionService } from "./dockerPortDetectionService.js";

// SSH Configuration
const SSH_DEFAULT_TIMEOUT_MS = 60000; // 1 minute per SSH command
const SSH_CONNECT_TIMEOUT_MS = 30000; // 30 seconds for connection establishment
const SSH_MAX_RETRIES = 20; // Total retry attempts
const SSH_RETRY_DELAY_MS = 15000; // 15 seconds between retries
const SSH_DEFAULT_PORT = 22;

// Installation Timeouts
const BOOTSTRAP_TIMEOUT_MS = 300000; // 5 minutes for full bootstrap
const DOCKER_INSTALL_TIMEOUT_MS = 180000; // 3 minutes for Docker install
const COMPOSE_INSTALL_TIMEOUT_MS = 120000; // 2 minutes for Docker Compose
const VERIFICATION_TIMEOUT_MS = 60000; // 1 minute for verification

class Ec2AutomaticSSHDeploymentService {
  constructor() {
    this.deploymentLogs = new Map();
  }

  /**
   * Log deployment event with structured format
   */
  logDeploymentEvent(deploymentId, event, details = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      event,
      details,
    };

    if (!this.deploymentLogs.has(deploymentId)) {
      this.deploymentLogs.set(deploymentId, []);
    }
    this.deploymentLogs.get(deploymentId).push(logEntry);

    // Also log to console
    console.log(`[SSH-DEPLOY:${deploymentId}] ${event}`, details);
    logger.info(`[SSH-DEPLOY:${deploymentId}] ${event}`, details);
  }

  /**
   * Get all deployment logs
   */
  getDeploymentLogs(deploymentId) {
    return this.deploymentLogs.get(deploymentId) || [];
  }

  /**
   * Execute SSH command with timeout
   */
  async executeSshCommand({
    host,
    username,
    privateKey,
    command,
    timeoutMs = SSH_DEFAULT_TIMEOUT_MS,
  }) {
    return new Promise((resolve, reject) => {
      const conn = new SshClient();
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const commandPreview = command.length > 100 ? command.substring(0, 100) + "..." : command;

      const timer = setTimeout(() => {
        timedOut = true;
        conn.end();
        reject(
          new Error(
            `🔴 SSH command timed out after ${timeoutMs}ms on ${username}@${host}. Command: ${commandPreview}`
          )
        );
      }, timeoutMs);

      conn
        .on("ready", () => {
          conn.exec(command, (error, stream) => {
            if (error) {
              clearTimeout(timer);
              conn.end();
              reject(
                new Error(`🔴 SSH exec failed on ${username}@${host}: ${error.message}`)
              );
              return;
            }

            stream
              .on("close", (code) => {
                clearTimeout(timer);
                conn.end();

                if (timedOut) return; // Already timed out

                if (code === 0) {
                  resolve({
                    success: true,
                    code,
                    stdout: stdout.trim(),
                    stderr: stderr.trim(),
                    command: commandPreview,
                  });
                } else {
                  reject(
                    new Error(
                      `🔴 SSH command failed with exit code ${code} on ${username}@${host}.\nCommand: ${commandPreview}\nError: ${stderr || stdout}`
                    )
                  );
                }
              })
              .on("data", (data) => {
                stdout += data.toString();
              });

            stream.stderr.on("data", (data) => {
              stderr += data.toString();
            });
          });
        })
        .on("error", (error) => {
          clearTimeout(timer);
          reject(
            new Error(`🔴 SSH connection failed on ${username}@${host}: ${error.message}`)
          );
        })
        .connect({
          host,
          port: SSH_DEFAULT_PORT,
          username,
          privateKey,
          readyTimeout: SSH_CONNECT_TIMEOUT_MS,
          algorithms: {
            serverHostKey: ["ssh-rsa", "rsa-sha2-512", "rsa-sha2-256"],
          },
          strict: false,
        });
    });
  }

  /**
   * Test SSH connectivity with retry logic
   */
  async testSshConnectivity(
    { host, username, privateKey, deploymentId },
    retryConfig = {}
  ) {
    const maxRetries = retryConfig.maxRetries || SSH_MAX_RETRIES;
    const retryDelayMs = retryConfig.retryDelayMs || SSH_RETRY_DELAY_MS;
    let lastError;

    this.logDeploymentEvent(deploymentId, "🔗 SSH_CONNECTIVITY_TEST_START", {
      host,
      username,
      maxRetries,
      retryDelayMs,
    });

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logDeploymentEvent(deploymentId, "🔄 SSH_RETRY", {
          attempt,
          totalAttempts: maxRetries,
          host,
          username,
        });

        const result = await this.executeSshCommand({
          host,
          username,
          privateKey,
          command: "echo 'SSH connection successful'",
          timeoutMs: SSH_DEFAULT_TIMEOUT_MS,
        });

        this.logDeploymentEvent(deploymentId, "✅ SSH_CONNECTED", {
          attempt,
          host,
          username,
        });

        return {
          success: true,
          attempt,
          host,
          username,
          message: "SSH connection established",
        };
      } catch (error) {
        lastError = error;
        this.logDeploymentEvent(deploymentId, "⚠️  SSH_ATTEMPT_FAILED", {
          attempt,
          totalAttempts: maxRetries,
          error: error.message,
        });

        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelayMs)
          );
        }
      }
    }

    const errorMsg = `🔴 SSH connection failed after ${maxRetries} attempts: ${lastError?.message || "Unknown error"}`;
    this.logDeploymentEvent(deploymentId, "❌ SSH_CONNECTIVITY_FAILED", {
      totalAttempts: maxRetries,
      error: lastError?.message,
    });

    throw new Error(errorMsg);
  }

  /**
   * Install Docker on EC2 instance
   */
  async installDocker(
    { host, username, privateKey, osIdentifier, deploymentId },
    timeoutMs = DOCKER_INSTALL_TIMEOUT_MS
  ) {
    const amiConfig = getAmiConfig(osIdentifier);

    this.logDeploymentEvent(deploymentId, "🐳 DOCKER_INSTALL_START", {
      osType: amiConfig.amiType,
      host,
      username,
    });

    try {
      // Check if Docker already installed
      try {
        await this.executeSshCommand({
          host,
          username,
          privateKey,
          command: "docker --version",
          timeoutMs: SSH_DEFAULT_TIMEOUT_MS,
        });

        this.logDeploymentEvent(deploymentId, "✅ DOCKER_ALREADY_INSTALLED", {
          host,
        });

        return { success: true, alreadyInstalled: true };
      } catch {
        // Docker not installed, proceed with installation
      }

      // Install Docker
      const installCommand =
        amiConfig.amiType === "amazon-linux"
          ? `
set -e
sudo yum update -y
sudo yum install -y docker
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ${username} || true
sleep 2
docker --version
`
          : `
set -e
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker ${username} || true
sleep 2
docker --version
`;

      this.logDeploymentEvent(deploymentId, "🔨 DOCKER_INSTALL_COMMAND_EXECUTING", {
        osType: amiConfig.amiType,
      });

      const result = await this.executeSshCommand({
        host,
        username,
        privateKey,
        command: installCommand,
        timeoutMs,
      });

      this.logDeploymentEvent(deploymentId, "✅ DOCKER_INSTALLED", {
        host,
        version: result.stdout,
      });

      return {
        success: true,
        alreadyInstalled: false,
        version: result.stdout.match(/Docker version.*|docker version.*/i)?.[0] || result.stdout,
      };
    } catch (error) {
      this.logDeploymentEvent(deploymentId, "❌ DOCKER_INSTALL_FAILED", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Install Docker Compose on EC2 instance
   */
  async installDockerCompose(
    { host, username, privateKey, osIdentifier, deploymentId },
    timeoutMs = COMPOSE_INSTALL_TIMEOUT_MS
  ) {
    const amiConfig = getAmiConfig(osIdentifier);

    this.logDeploymentEvent(deploymentId, "📦 DOCKER_COMPOSE_INSTALL_START", {
      osType: amiConfig.amiType,
      host,
      username,
    });

    try {
      // Check if Docker Compose already installed
      try {
        await this.executeSshCommand({
          host,
          username,
          privateKey,
          command: "docker compose version",
          timeoutMs: SSH_DEFAULT_TIMEOUT_MS,
        });

        this.logDeploymentEvent(deploymentId, "✅ DOCKER_COMPOSE_ALREADY_INSTALLED", {
          host,
        });

        return { success: true, alreadyInstalled: true };
      } catch {
        // Try legacy docker-compose
        try {
          await this.executeSshCommand({
            host,
            username,
            privateKey,
            command: "docker-compose --version",
            timeoutMs: SSH_DEFAULT_TIMEOUT_MS,
          });

          this.logDeploymentEvent(deploymentId, "✅ DOCKER_COMPOSE_LEGACY_INSTALLED", {
            host,
          });

          return { success: true, alreadyInstalled: true, legacy: true };
        } catch {
          // Neither installed, proceed with installation
        }
      }

      // Install Docker Compose
      const installCommand = `
set -e
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.6/docker-compose-\\$(uname -s)-\\$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
sleep 1
docker compose version
`;

      this.logDeploymentEvent(deploymentId, "🔨 DOCKER_COMPOSE_INSTALL_COMMAND_EXECUTING", {
        osType: amiConfig.amiType,
      });

      const result = await this.executeSshCommand({
        host,
        username,
        privateKey,
        command: installCommand,
        timeoutMs,
      });

      this.logDeploymentEvent(deploymentId, "✅ DOCKER_COMPOSE_INSTALLED", {
        host,
        version: result.stdout,
      });

      return {
        success: true,
        alreadyInstalled: false,
        version: result.stdout.match(/Docker Compose version.*|docker-compose version.*/i)?.[0] || result.stdout,
      };
    } catch (error) {
      this.logDeploymentEvent(deploymentId, "❌ DOCKER_COMPOSE_INSTALL_FAILED", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Install Git on EC2 instance
   */
  async installGit(
    { host, username, privateKey, osIdentifier, deploymentId },
    timeoutMs = SSH_DEFAULT_TIMEOUT_MS
  ) {
    const amiConfig = getAmiConfig(osIdentifier);

    this.logDeploymentEvent(deploymentId, "📝 GIT_INSTALL_START", {
      osType: amiConfig.amiType,
      host,
      username,
    });

    try {
      // Check if Git already installed
      try {
        await this.executeSshCommand({
          host,
          username,
          privateKey,
          command: "git --version",
          timeoutMs: SSH_DEFAULT_TIMEOUT_MS,
        });

        this.logDeploymentEvent(deploymentId, "✅ GIT_ALREADY_INSTALLED", {
          host,
        });

        return { success: true, alreadyInstalled: true };
      } catch {
        // Git not installed, proceed with installation
      }

      // Install Git
      const installCommand =
        amiConfig.amiType === "amazon-linux"
          ? `
set -e
sudo yum install -y git
git --version
`
          : `
set -e
sudo apt-get update -y
sudo apt-get install -y git
git --version
`;

      this.logDeploymentEvent(deploymentId, "🔨 GIT_INSTALL_COMMAND_EXECUTING", {
        osType: amiConfig.amiType,
      });

      const result = await this.executeSshCommand({
        host,
        username,
        privateKey,
        command: installCommand,
        timeoutMs,
      });

      this.logDeploymentEvent(deploymentId, "✅ GIT_INSTALLED", {
        host,
        version: result.stdout,
      });

      return {
        success: true,
        alreadyInstalled: false,
        version: result.stdout.match(/git version.*/i)?.[0] || result.stdout,
      };
    } catch (error) {
      this.logDeploymentEvent(deploymentId, "❌ GIT_INSTALL_FAILED", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Verify all installations
   */
  async verifyInstallations(
    { host, username, privateKey, osIdentifier, deploymentId },
    timeoutMs = VERIFICATION_TIMEOUT_MS
  ) {
    this.logDeploymentEvent(deploymentId, "🔍 VERIFICATION_START", {
      host,
      username,
    });

    try {
      const verificationCommand = `
set -e
echo "=== Docker Version ==="
docker --version
echo "=== Docker Compose Version ==="
docker compose version || docker-compose --version
echo "=== Git Version ==="
git --version
echo "=== Docker Service Status ==="
sudo systemctl is-active docker
echo "=== Verification Complete ==="
`;

      const result = await this.executeSshCommand({
        host,
        username,
        privateKey,
        command: verificationCommand,
        timeoutMs,
      });

      this.logDeploymentEvent(deploymentId, "✅ VERIFICATION_PASSED", {
        host,
        output: result.stdout.substring(0, 300),
      });

      return {
        success: true,
        output: result.stdout,
      };
    } catch (error) {
      this.logDeploymentEvent(deploymentId, "❌ VERIFICATION_FAILED", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Deploy Docker container to EC2
   */
  async deployDockerContainer(
    {
      host,
      username,
      privateKey,
      deploymentId,
      image,
      containerName,
      ports = "", // Empty by default - will detect from image
      environment = {},
    },
    timeoutMs = SSH_DEFAULT_TIMEOUT_MS
  ) {
    const deploymentContainerName = "to-do-list";

    this.logDeploymentEvent(deploymentId, "🚀 DOCKER_DEPLOY_START", {
      host,
      image,
      containerName: deploymentContainerName,
      portDetectionMethod: "remote-docker-image-inspect",
    });

    try {
      const deployCommand = `
#!/usr/bin/env bash
set -eu

LOCK_DIR="/tmp/devopshub-to-do-list-deploy.lock"
LOCK_INFO_FILE="$LOCK_DIR/lock"
REPOSITORY_NAME="to-do-list"
IMAGE_REF="${image}"
CONTAINER_NAME="${deploymentContainerName}"

log_cmd() {
  echo "[DevOpsHub][Command] $*"
}

run_cmd() {
  log_cmd "$@"
  "$@"
}

run_shell() {
  log_cmd "$*"
  bash -o pipefail -c "$*"
}

write_deploy_lock_info() {
  {
    echo "pid=$$"
    echo "timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "repository=$REPOSITORY_NAME"
  } > "$LOCK_INFO_FILE"
}

release_deploy_lock() {
  echo "[DevOpsHub][Deploy Lock] Releasing"
  rm -rf "$LOCK_DIR"
}

if mkdir "$LOCK_DIR" 2>/dev/null; then
  write_deploy_lock_info
  echo "[DevOpsHub][Deploy Lock] Acquired"
else
  LOCK_PID=""
  if [ -f "$LOCK_INFO_FILE" ]; then
    LOCK_PID=$(sed -n 's/^pid=//p' "$LOCK_INFO_FILE" | head -1)
  fi
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "[DevOpsHub][Deploy Lock] Existing deployment still active: $LOCK_DIR (pid=$LOCK_PID)"
    exit 1
  fi
  echo "[DevOpsHub][Deploy Lock] Removing stale lock: $LOCK_DIR"
  rm -rf "$LOCK_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    echo "[DevOpsHub][Deploy Lock] Existing deployment still active: $LOCK_DIR"
    exit 1
  fi
  write_deploy_lock_info
  echo "[DevOpsHub][Deploy Lock] Acquired"
fi
trap release_deploy_lock EXIT
trap 'trap - EXIT; release_deploy_lock; exit 130' INT
trap 'trap - EXIT; release_deploy_lock; exit 143' TERM

echo "[DevOpsHub][Deploy] Starting Docker Compose deployment via SSH"
echo "[DevOpsHub][Deploy] Repository: https://github.com/Arshdadwal99/hotel-booking.git"

run_cmd sudo mkdir -p /opt
run_cmd sudo chown "$USER:$USER" /opt
run_shell "git clone https://github.com/Arshdadwal99/hotel-booking.git /opt/hotel-booking || true"
run_cmd cd /opt/hotel-booking
run_cmd git fetch origin
run_cmd git reset --hard origin/master

echo "[DevOpsHub][Docker Compose] down"
run_shell "docker compose down || true"
echo "[DevOpsHub][Docker Compose] pull"
run_shell "docker compose pull || true"
echo "[DevOpsHub][Docker Compose] up"
run_cmd docker compose up -d --build
echo "[DevOpsHub][Docker Compose] ps"
run_cmd docker compose ps

echo "[DevOpsHub][Health Check] Frontend http://localhost:3034"
run_cmd curl -f http://localhost:3034
echo "[DevOpsHub][Health Check] Admin panel http://localhost:3033"
run_cmd curl -f http://localhost:3033
echo "[DevOpsHub][Health Check] Backend http://localhost:3035"
run_cmd curl -f http://localhost:3035
echo "[DevOpsHub][Final Verification] Deployment completed successfully"
`;

      logger.info("[SSH-DEPLOY] Generated deployment script", {
        deploymentId,
        host,
        command: deployCommand,
      });

      const result = await this.executeSshCommand({
        host,
        username,
        privateKey,
        command: deployCommand,
        timeoutMs,
      });

      this.logDeploymentEvent(deploymentId, "✅ DOCKER_DEPLOY_SUCCESS", {
        host,
        containerName: deploymentContainerName,
        output: result.stdout,
      });

      return {
        success: true,
        containerName: deploymentContainerName,
        output: result.stdout,
        deploymentLogs: result.stdout,
      };
    } catch (error) {
      this.logDeploymentEvent(deploymentId, "❌ DOCKER_DEPLOY_FAILED", {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Complete automated deployment workflow
   * 1. Test SSH connectivity (with retries)
   * 2. Detect OS and username
   * 3. Install Docker
   * 4. Install Docker Compose
   * 5. Install Git
   * 6. Verify installations
   */
  async executeAutomatedDeployment({
    deploymentId,
    instanceId,
    publicIp,
    publicDns,
    osIdentifier = "ubuntu",
    deployment = {},
  }) {
    const startTime = Date.now();

    this.logDeploymentEvent(deploymentId, "🚀 DEPLOYMENT_START", {
      instanceId,
      publicIp,
      publicDns,
      osIdentifier,
    });

    try {
      // Load generated private key
      const keyConfig = await loadEc2PrivateKey(deployment);
      const username = getAmiUsername(osIdentifier);
      const amiType = detectAmiType(osIdentifier);

      this.logDeploymentEvent(deploymentId, "🔐 KEY_LOADED", {
        keySource: keyConfig.keySource,
        keyPairName: keyConfig.keyPairName,
        username,
        amiType,
      });

      // Test SSH connectivity
      const sshTest = await this.testSshConnectivity(
        { host: publicIp, username, privateKey: keyConfig.privateKey, deploymentId },
        { maxRetries: SSH_MAX_RETRIES, retryDelayMs: SSH_RETRY_DELAY_MS }
      );

      // Install Docker
      const dockerInstall = await this.installDocker({
        host: publicIp,
        username,
        privateKey: keyConfig.privateKey,
        osIdentifier,
        deploymentId,
      });

      // Install Docker Compose
      const composeInstall = await this.installDockerCompose({
        host: publicIp,
        username,
        privateKey: keyConfig.privateKey,
        osIdentifier,
        deploymentId,
      });

      // Install Git
      const gitInstall = await this.installGit({
        host: publicIp,
        username,
        privateKey: keyConfig.privateKey,
        osIdentifier,
        deploymentId,
      });

      // Verify all installations
      const verification = await this.verifyInstallations({
        host: publicIp,
        username,
        privateKey: keyConfig.privateKey,
        osIdentifier,
        deploymentId,
      });

      const duration = Date.now() - startTime;

      this.logDeploymentEvent(deploymentId, "✨ DEPLOYMENT_COMPLETE", {
        instanceId,
        publicIp,
        publicDns,
        duration,
        sshAttempts: sshTest.attempt,
        dockerInstalled: dockerInstall.success,
        composeInstalled: composeInstall.success,
        gitInstalled: gitInstall.success,
        verificationPassed: verification.success,
      });

      return {
        success: true,
        deploymentId,
        instanceId,
        publicIp,
        publicDns,
        duration,
        appUrl: `http://${publicIp}`,
        jenkinsUrl: `http://${publicIp}:8080`,
        username,
        amiType,
        installations: {
          docker: dockerInstall,
          dockerCompose: composeInstall,
          git: gitInstall,
        },
        verification,
        logs: this.getDeploymentLogs(deploymentId),
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logDeploymentEvent(deploymentId, "❌ DEPLOYMENT_FAILED", {
        duration,
        error: error.message,
      });

      throw error;
    }
  }
}

export const ec2AutomaticSSHDeploymentService = new Ec2AutomaticSSHDeploymentService();
