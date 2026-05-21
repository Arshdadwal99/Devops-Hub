import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { Webhook } from "../models/Webhook.js";
import { Deployment } from "../models/Deployment.js";
import { createAlert } from "./alertService.js";
import {
  emitDeploymentStarted,
  emitDeploymentProgress,
  emitDeploymentSucceeded,
  emitDeploymentFailed,
} from "./socketEventsService.js";
import { detectTechStack } from "./techStackDetectorService.js";
import { generateDockerfile, generateDockerignore } from "./dockerfileGeneratorService.js";
import { generateDockerCompose, writeDockerCompose } from "./dockerComposeGeneratorService.js";
import { generateJenkinsfile, writeJenkinsfile } from "./jenkinsfileGeneratorService.js";
import ec2Service from "./ec2AutomatedDeploymentService.js";

const execAsync = promisify(exec);

/**
 * Automated DevOps Deployment Orchestration Service
 * Orchestrates complete workflow from GitHub to EC2 deployment
 */

const WORKSPACE_ROOT = path.resolve(process.cwd(), "deployment-workspace");

class DeploymentOrchestrationService {
  /**
   * Complete automated deployment workflow
   */
  async executeFullAutomatedDeployment(webhookData) {
    const startTime = Date.now();
    const logs = [];
    const deploymentId = `deploy-${Date.now()}`;

    try {
      // Step 1: Clone repository
      logs.push("📥 Step 1: Cloning repository from GitHub...");
      const cloneResult = await this.cloneRepository(webhookData.repository.clone_url);
      if (!cloneResult.success) {
        throw new Error(`Failed to clone repository: ${cloneResult.error}`);
      }
      logs.push(...cloneResult.logs);
      const repoPath = cloneResult.repoPath;

      // Step 2: Detect tech stack
      logs.push("🔍 Step 2: Detecting project technology stack...");
      const detection = await detectTechStack(repoPath);
      if (!detection.success) {
        throw new Error(`Failed to detect tech stack: ${detection.error}`);
      }
      logs.push(`✅ Detected: ${detection.detection.primaryStack}`);
      logs.push(`   Technologies: ${detection.detection.technologies.join(", ")}`);
      logs.push(`   Port: ${detection.detection.ports[0]}`);

      // Step 3: Generate Dockerfile
      logs.push("🐳 Step 3: Generating optimized Dockerfile...");
      const dockerResult = await generateDockerfile(
        detection.detection,
        repoPath,
        detection.detection.ports[0]
      );
      if (!dockerResult.success) {
        throw new Error(`Failed to generate Dockerfile: ${dockerResult.error}`);
      }
      logs.push("✅ Dockerfile generated successfully");

      // Step 4: Generate .dockerignore
      logs.push("📄 Step 4: Generating .dockerignore...");
      await generateDockerignore(repoPath);
      logs.push("✅ .dockerignore generated");

      // Step 5: Generate docker-compose.yml
      logs.push("📋 Step 5: Generating docker-compose.yml...");
      const containerName = this.generateContainerName(webhookData.repository.name);
      const composeResult = await generateDockerCompose(
        detection.detection,
        containerName,
        detection.detection.ports[0]
      );
      if (!composeResult.success) {
        throw new Error(`Failed to generate docker-compose: ${composeResult.error}`);
      }
      await writeDockerCompose(repoPath, composeResult.yaml);
      logs.push("✅ docker-compose.yml generated");

      // Step 6: Generate Jenkinsfile
      logs.push("🔨 Step 6: Generating Jenkinsfile for CI/CD...");
      const jenkinsResult = await generateJenkinsfile(
        detection.detection,
        containerName,
        detection.detection.ports[0],
        webhookData.repository.name
      );
      if (!jenkinsResult.success) {
        throw new Error(`Failed to generate Jenkinsfile: ${jenkinsResult.error}`);
      }
      await writeJenkinsfile(repoPath, jenkinsResult.jenkinsfile);
      logs.push("✅ Jenkinsfile generated");

      // Step 7: Build Docker image
      logs.push("🔨 Step 7: Building Docker image...");
      const imageTag = `${containerName}:${webhookData.ref.split("/").pop()}-${Date.now()}`;
      const buildResult = await this.buildDockerImage(repoPath, imageTag);
      if (!buildResult.success) {
        throw new Error(`Failed to build Docker image: ${buildResult.error}`);
      }
      logs.push(`✅ Docker image built: ${imageTag}`);

      // Step 8: Push Docker image to registry (if configured)
      if (process.env.DOCKER_REGISTRY_URL && process.env.DOCKER_REGISTRY_PASSWORD) {
        logs.push("📤 Step 8: Pushing Docker image to registry...");
        const pushResult = await this.pushDockerImage(imageTag);
        if (pushResult.success) {
          logs.push("✅ Docker image pushed to registry");
        } else {
          logs.push(`⚠️  Warning: Could not push image: ${pushResult.error}`);
        }
      }

      // Step 9: Deploy to AWS EC2
      logs.push("🚀 Step 9: Deploying to AWS EC2...");
      const deployResult = await ec2Service.deployToEc2({
        deploymentId,
        containerName,
        containerPort: detection.detection.ports[0],
        dockerImage: imageTag,
        environment: "production",
        repository: webhookData.repository.clone_url,
        commitSha: webhookData.after,
        buildNumber: webhookData.repository.id,
      });

      if (!deployResult.success) {
        throw new Error(`EC2 deployment failed: ${deployResult.error}`);
      }

      logs.push(...deployResult.logs);
      logs.push(`✅ Deployment successful!`);

      // Step 10: Update webhook with deployment info
      logs.push("✅ Step 10: Recording deployment metadata...");
      await Webhook.findByIdAndUpdate(webhookData._id, {
        deploymentStatus: "success",
        deploymentUrl: deployResult.deploymentUrl,
        deploymentIp: deployResult.deploymentIp,
        deploymentTime: Date.now() - startTime,
      });

      // Create success alert
      await createAlert({
        type: "deployment",
        severity: "info",
        title: "Automated Deployment Successful",
        message: `${webhookData.repository.name} deployed to ${deployResult.deploymentUrl}`,
      });

      emitDeploymentSucceeded({
        deploymentId,
        containerName,
        deploymentUrl: deployResult.deploymentUrl,
        deploymentIp: deployResult.deploymentIp,
      });

      const totalDuration = Date.now() - startTime;
      return {
        success: true,
        deploymentId,
        deploymentUrl: deployResult.deploymentUrl,
        deploymentIp: deployResult.deploymentIp,
        containerName,
        techStack: detection.detection.primaryStack,
        duration: totalDuration,
        logs,
      };
    } catch (error) {
      console.error("❌ Automated deployment failed:", error.message);
      logs.push(`❌ Error: ${error.message}`);

      await createAlert({
        type: "deployment",
        severity: "critical",
        title: "Automated Deployment Failed",
        message: `Deployment failed: ${error.message}`,
      });

      emitDeploymentFailed({
        deploymentId,
        error: error.message,
      });

      const totalDuration = Date.now() - startTime;
      return {
        success: false,
        deploymentId,
        error: error.message,
        duration: totalDuration,
        logs,
      };
    } finally {
      // Cleanup
      try {
        await this.cleanupWorkspace();
      } catch (error) {
        console.warn("⚠️  Warning during cleanup:", error.message);
      }
    }
  }

  /**
   * Clone repository to local workspace
   */
  async cloneRepository(repoUrl) {
    try {
      const repoName = repoUrl.split("/").pop().replace(".git", "");
      const repoPath = path.join(WORKSPACE_ROOT, repoName);

      // Create workspace if not exists
      await fs.mkdir(WORKSPACE_ROOT, { recursive: true });

      // Remove existing directory if exists
      try {
        await fs.rm(repoPath, { recursive: true, force: true });
      } catch (e) {
        // Directory doesn't exist
      }

      // Clone repository
      const { stdout, stderr } = await execAsync(`git clone ${repoUrl} ${repoPath}`, {
        timeout: 60000,
      });

      console.log(`✅ Repository cloned: ${repoPath}`);

      return {
        success: true,
        repoPath,
        logs: [`Successfully cloned: ${repoUrl}`, stdout],
      };
    } catch (error) {
      console.error("❌ Clone error:", error.message);
      return {
        success: false,
        error: error.message,
        logs: [`Failed to clone: ${error.message}`],
      };
    }
  }

  /**
   * Build Docker image
   */
  async buildDockerImage(repoPath, imageTag) {
    try {
      console.log(`🔨 Building image: ${imageTag}`);

      const { stdout, stderr } = await execAsync(
        `cd ${repoPath} && docker build -t ${imageTag} -f Dockerfile .`,
        { timeout: 300000 } // 5 minutes
      );

      console.log(`✅ Docker image built: ${imageTag}`);

      return {
        success: true,
        imageTag,
        logs: [stdout, stderr].filter(Boolean),
      };
    } catch (error) {
      console.error("❌ Docker build error:", error.message);
      return {
        success: false,
        error: error.message,
        logs: [error.message],
      };
    }
  }

  /**
   * Push Docker image to registry
   */
  async pushDockerImage(imageTag) {
    try {
      const registryUrl = process.env.DOCKER_REGISTRY_URL;
      const username = process.env.DOCKER_REGISTRY_USERNAME;
      const password = process.env.DOCKER_REGISTRY_PASSWORD;

      // Login to registry
      await execAsync(`echo ${password} | docker login -u ${username} --password-stdin ${registryUrl}`);

      // Tag image
      const registryTag = `${registryUrl}/${imageTag}`;
      await execAsync(`docker tag ${imageTag} ${registryTag}`);

      // Push image
      const { stdout, stderr } = await execAsync(`docker push ${registryTag}`, {
        timeout: 300000,
      });

      console.log(`✅ Image pushed: ${registryTag}`);

      return {
        success: true,
        registryTag,
        logs: [stdout, stderr].filter(Boolean),
      };
    } catch (error) {
      console.error("❌ Docker push error:", error.message);
      return {
        success: false,
        error: error.message,
        logs: [error.message],
      };
    }
  }

  /**
   * Generate container name from repository name
   */
  generateContainerName(repoName) {
    return repoName
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 30);
  }

  /**
   * Cleanup workspace
   */
  async cleanupWorkspace() {
    try {
      if (process.env.CLEANUP_WORKSPACE !== "false") {
        await fs.rm(WORKSPACE_ROOT, { recursive: true, force: true });
        console.log("✅ Workspace cleaned up");
      }
    } catch (error) {
      console.warn("⚠️  Cleanup warning:", error.message);
    }
  }
}

export default new DeploymentOrchestrationService();
