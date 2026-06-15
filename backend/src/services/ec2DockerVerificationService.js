/**
 * EC2 Docker Verification Service
 * Handles SSH-based Docker installation verification with retry logic
 * Features:
 * - SSH connection retry logic with configurable timeouts
 * - Auto-detection of Linux AMI type
 * - Automatic username detection
 * - Docker version verification
 * - Docker Compose verification
 * - Detailed error reporting
 */

import { Client as SshClient } from "ssh2";
import { logger } from "../utils/logger.js";
import {
  detectAmiType,
  getAmiUsername,
  getDockerVerificationCommand,
  getDockerInstallationCheckCommand,
} from "./ec2AmiDetectionService.js";

const DEFAULT_SSH_TIMEOUT_MS = 60000; // 1 minute
const DEFAULT_CONNECT_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_RETRY_ATTEMPTS = 20;
const DEFAULT_RETRY_DELAY_MS = 15000; // 15 seconds between retries
const DEFAULT_SSH_PORT = 22;

class Ec2DockerVerificationService {
  constructor() {
    this.verifications = new Map();
  }

  /**
   * Execute SSH command with timeout
   */
  async executeSshCommand({ host, username, privateKey, command, timeoutMs = DEFAULT_SSH_TIMEOUT_MS }) {
    return new Promise((resolve, reject) => {
      const conn = new SshClient();
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        conn.end();
        reject(
          new Error(
            `SSH command timed out after ${timeoutMs}ms on ${username}@${host}. Command: ${command}`
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
                new Error(
                  `SSH exec failed on ${username}@${host}: ${error.message}`
                )
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
                    command,
                  });
                } else {
                  reject(
                    new Error(
                      `SSH command failed with exit code ${code} on ${username}@${host}: ${stderr || stdout || command}`
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
          if (!timedOut) {
            reject(
              new Error(
                `SSH connection failed for ${username}@${host}: ${error.message}`
              )
            );
          }
        })
        .connect({
          host,
          username,
          privateKey,
          readyTimeout: DEFAULT_CONNECT_TIMEOUT_MS,
          algorithms: {
            serverHostKey: [
              "ssh-rsa",
              "ssh-dss",
              "ssh-ed25519",
              "ecdsa-sha2-nistp256",
            ],
          },
        });
    });
  }

  /**
   * Test SSH connectivity with retries
   */
  async testSshConnectivity(
    { host, username, privateKey, port = DEFAULT_SSH_PORT },
    {
      maxAttempts = DEFAULT_RETRY_ATTEMPTS,
      retryDelayMs = DEFAULT_RETRY_DELAY_MS,
      connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS,
    } = {}
  ) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info("SSH attempt", {
          host,
          username,
          port,
          attempt,
          maxAttempts,
        });

        const result = await this.executeSshCommand({
          host,
          username,
          privateKey,
          command: "echo 'SSH connection successful'",
          timeoutMs: connectTimeoutMs,
        });

        logger.info("SSH success", {
          host,
          username,
          attempt,
        });

        return {
          success: true,
          connected: true,
          attempt,
          output: result.stdout,
        };
      } catch (error) {
        lastError = error;
        logger.warn("SSH failure reason", {
          host,
          username,
          port,
          attempt,
          maxAttempts,
          error: error.message,
        });

        if (attempt < maxAttempts) {
          logger.info(`Retrying SSH connection in ${retryDelayMs}ms...`, {
            attempt,
            nextAttempt: attempt + 1,
            maxAttempts,
          });
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    return {
      success: false,
      connected: false,
      attempts: maxAttempts,
      lastError: lastError?.message,
      hint: `Failed to connect to ${username}@${host}:${port} after ${maxAttempts} attempts. Verify the generated key pair, security group port 22 ingress rule, SSH user, and instance state.`,
    };
  }

  /**
   * Verify Docker is installed and running
   */
  async verifyDockerInstallation(
    { host, username, privateKey, operatingSystem },
    {
      maxAttempts = DEFAULT_RETRY_ATTEMPTS,
      retryDelayMs = DEFAULT_RETRY_DELAY_MS,
      commandTimeoutMs = DEFAULT_SSH_TIMEOUT_MS,
    } = {}
  ) {
    const detectedUsername = username || getAmiUsername(operatingSystem);
    const amiType = detectAmiType(operatingSystem);

    logger.info("Verifying Docker installation", {
      host,
      username: detectedUsername,
      operatingSystem,
      amiType,
      maxAttempts,
    });

    // First, test connectivity
    const connectivityResult = await this.testSshConnectivity(
      {
        host,
        username: detectedUsername,
        privateKey,
      },
      { maxAttempts, retryDelayMs, connectTimeoutMs: commandTimeoutMs }
    );

    if (!connectivityResult.success) {
      return {
        success: false,
        verified: false,
        host,
        username: detectedUsername,
        operatingSystem,
        amiType,
        connectivity: connectivityResult,
        error: `SSH connection failed: ${connectivityResult.hint}`,
      };
    }

    // Verify Docker installation
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info("Checking Docker installation on EC2", {
          host,
          username: detectedUsername,
          attempt,
          maxAttempts,
        });

        const result = await this.executeSshCommand({
          host,
          username: detectedUsername,
          privateKey,
          command: getDockerVerificationCommand(operatingSystem),
          timeoutMs: commandTimeoutMs,
        });

        logger.info("Docker installation verified", {
          host,
          username: detectedUsername,
          attempt,
          output: result.stdout,
        });

        return {
          success: true,
          verified: true,
          host,
          username: detectedUsername,
          operatingSystem,
          amiType,
          dockerVersion: this.extractDockerVersion(result.stdout),
          dockerComposeVersion: this.extractDockerComposeVersion(result.stdout),
          output: result.stdout,
          attempt,
        };
      } catch (error) {
        lastError = error;
        logger.warn("Docker verification attempt failed", {
          host,
          username: detectedUsername,
          attempt,
          maxAttempts,
          error: error.message,
        });

        if (attempt < maxAttempts) {
          logger.info(
            `Docker verification retry in ${retryDelayMs}ms... (attempt ${attempt}/${maxAttempts})`,
            { host, username: detectedUsername }
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    return {
      success: false,
      verified: false,
      host,
      username: detectedUsername,
      operatingSystem,
      amiType,
      attempts: maxAttempts,
      lastError: lastError?.message,
      error: `Docker not found on ${host} after ${maxAttempts} attempts. Ensure bootstrap script completed. Last error: ${lastError?.message}`,
      hint: "Check EC2 bootstrap script execution: ssh -i key.pem ubuntu@HOST 'tail -50 /var/log/devops-hub-bootstrap.log'",
    };
  }

  /**
   * Extract Docker version from output
   */
  extractDockerVersion(output = "") {
    const match = String(output).match(/Docker version ([\d.]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract Docker Compose version from output
   */
  extractDockerComposeVersion(output = "") {
    const match = String(output).match(
      /(?:Docker Compose|docker-compose) version ([\d.]+)/
    );
    return match ? match[1] : null;
  }

  /**
   * Get bootstrap status via SSH
   */
  async getBootstrapStatus(
    { host, username, privateKey, operatingSystem },
    { commandTimeoutMs = DEFAULT_SSH_TIMEOUT_MS } = {}
  ) {
    const detectedUsername = username || getAmiUsername(operatingSystem);

    try {
      const result = await this.executeSshCommand({
        host,
        username: detectedUsername,
        privateKey,
        command: "tail -20 /var/log/devops-hub-bootstrap.log 2>/dev/null || echo 'No bootstrap log found'",
        timeoutMs: commandTimeoutMs,
      });

      return {
        success: true,
        bootstrapLogAvailable: !result.stdout.includes("No bootstrap log found"),
        logTail: result.stdout,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get detailed SSH configuration for debugging
   */
  getSshConfigDebugInfo(
    { host, username, operatingSystem, keySource, keyPairName },
    connectionErrors = []
  ) {
    return {
      sshTarget: {
        host,
        username: username || getAmiUsername(operatingSystem),
        operatingSystem,
        detectedAmiType: detectAmiType(operatingSystem),
        keySource,
        keyPairName,
      },
      troubleshooting: {
        checkSshKey: `aws ec2 describe-key-pairs --key-names ${keyPairName} --region us-east-1`,
        checkSecurityGroup:
          "aws ec2 describe-security-groups --query 'SecurityGroups[*].[GroupId,IpPermissions]'",
        testSshManually: `ssh -i /path/to/key.pem ${username}@${host}`,
        checkBootstrapLog: `ssh -i /path/to/key.pem ${username}@${host} 'tail -100 /var/log/devops-hub-bootstrap.log'`,
        checkDockerStatus: `ssh -i /path/to/key.pem ${username}@${host} 'sudo systemctl status docker'`,
      },
      errors: connectionErrors,
    };
  }
}

export const ec2DockerVerificationService = new Ec2DockerVerificationService();

export default ec2DockerVerificationService;
