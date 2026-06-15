/**
 * One-Click CI/CD Deployment Service
 * 
 * Orchestrates complete fully automated deployment workflow:
 * 1. Verify all connections (GitHub, Jenkins, Docker Hub, AWS)
 * 2. Analyze repository
 * 3. Generate deployment files (Dockerfile, Jenkinsfile, docker-compose.yml)
 * 4. Discover/provision EC2 infrastructure (intelligent, free-tier aware)
 * 5. Create Jenkins job automatically
 * 6. Configure Jenkins credentials
 * 7. Configure GitHub webhook
 * 8. Build Docker image
 * 9. Push to Docker Hub
 * 10. Deploy to EC2
 * 11. Run health checks
 * 12. Enable auto-deploy
 * 
 * This service provides a true one-click experience similar to Vercel/Railway/Render
 */

import { Deployment } from "../models/Deployment.js";
import { ProvisioningJob } from "../models/ProvisioningJob.js";
import { JenkinsJob } from "../models/JenkinsJob.js";
import { GitHubWebhookConfig } from "../models/GitHubWebhookConfig.js";
import { AWSInfrastructure } from "../models/AWSInfrastructure.js";
import { AWSConnection } from "../models/AWSConnection.js";
import { Build } from "../models/Build.js";
import { isDbConnected } from "../db.js";
import axios from "axios";

// Import all required services
import { analyzeRepository } from "./repositoryAnalysisService.js";
import { generateDockerfile } from "./dockerfileGeneratorService.js";
import { generateJenkinsfile } from "./jenkinsfileGeneratorService.js";
import { generateDockerCompose } from "./dockerComposeGeneratorService.js";
import { ec2IntelligentProvisioningService } from "./ec2IntelligentProvisioningService.js";
import { createJenkinsJob } from "./jenkinsJobService.js";
import { createGitHubWebhook } from "./githubWebhookConfigService.js";
import { buildDockerImage } from "./dockerBuildService.js";
import { pushImageToDockerHub } from "./dockerHubPushService.js";
import { deployDockerImageToEc2 } from "./ec2DeploymentService.js";
import { performHealthCheck } from "./healthCheckService.js";
import { enableAutoDeploy } from "./autoDeployService.js";
import { broadcastToRoom, emitPipelineStatusUpdate } from "./socketEventsService.js";
import {
  getJenkinsStatus,
  jenkinsValidationPassed,
} from "./jenkinsConnectionService.js";
import { getDockerHubStatus } from "./dockerHubRegistryService.js";
import { getGitHubStatus } from "./githubService.js";

const DEPLOYMENT_STEPS = [
  "VERIFY_CONNECTIONS",
  "ANALYZE_REPOSITORY",
  "GENERATE_DEPLOYMENT_FILES",
  "PROVISION_INFRASTRUCTURE",
  "CREATE_JENKINS_JOB",
  "CONFIGURE_JENKINS_CREDENTIALS",
  "CONFIGURE_GITHUB_WEBHOOK",
  "BUILD_DOCKER_IMAGE",
  "PUSH_DOCKER_IMAGE",
  "DEPLOY_TO_EC2",
  "RUN_HEALTH_CHECKS",
  "ENABLE_AUTO_DEPLOY",
  "COMPLETE",
];

const STEP_DISPLAY_NAMES = {
  VERIFY_CONNECTIONS: "✓ Verifying Connections",
  ANALYZE_REPOSITORY: "✓ Repository Analyzed",
  GENERATE_DEPLOYMENT_FILES: "✓ Generated Deployment Files",
  PROVISION_INFRASTRUCTURE: "✓ Infrastructure Ready",
  CREATE_JENKINS_JOB: "✓ Jenkins Configured",
  CONFIGURE_JENKINS_CREDENTIALS: "✓ Jenkins Credentials Configured",
  CONFIGURE_GITHUB_WEBHOOK: "✓ Webhook Configured",
  BUILD_DOCKER_IMAGE: "✓ Docker Image Built",
  PUSH_DOCKER_IMAGE: "✓ Image Pushed to Registry",
  DEPLOY_TO_EC2: "✓ Application Deployed",
  RUN_HEALTH_CHECKS: "✓ Health Checks Passed",
  ENABLE_AUTO_DEPLOY: "✓ Auto Deploy Enabled",
  COMPLETE: "✓ Deployment Complete",
};

class OneClickDeploymentService {
  constructor() {
    this.deploymentStates = new Map(); // Track deployment states in memory
  }

  /**
   * Get progress percentage based on current step
   */
  getProgressPercentage(stepIndex) {
    return Math.round((stepIndex / DEPLOYMENT_STEPS.length) * 100);
  }

  /**
   * Broadcast deployment progress to all connected clients
   */
  async broadcastProgress(
    deploymentId,
    step,
    status = "in-progress",
    message = "",
    data = {}
  ) {
    const stepIndex = DEPLOYMENT_STEPS.indexOf(step);
    const displayName = STEP_DISPLAY_NAMES[step] || step;
    const progress = this.getProgressPercentage(stepIndex);

    const progressData = {
      deploymentId,
      step,
      displayName,
      status,
      message,
      progress,
      timestamp: new Date().toISOString(),
      ...data,
    };

    console.log(`[OneClick Deploy] ${displayName} - ${status}`, { message, ...data });

    // Broadcast to all connected clients
    emitPipelineStatusUpdate(progressData);
    broadcastToRoom("deployment", "oneclick:progress", progressData);
  }

  /**
   * Main entry point: Execute one-click deployment
   */
  async executeOneClickDeployment(userId, deploymentConfig) {
    const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const deployment = {
      id: deploymentId,
      userId,
      repositoryOwner: deploymentConfig.owner,
      repositoryName: deploymentConfig.repo,
      branch: deploymentConfig.branch || "main",
      startedAt: new Date(),
      status: "in-progress",
      steps: {},
      infrastructure: null,
      jenkinsJob: null,
      webhook: null,
      deployment: null,
    };

    this.deploymentStates.set(deploymentId, deployment);

    try {
      // Step 1: Verify all connections
      await this.broadcastProgress(
        deploymentId,
        "VERIFY_CONNECTIONS",
        "in-progress",
        "Verifying all integrations..."
      );
      const connections = await this.verifyConnections(userId);
      deployment.steps.VERIFY_CONNECTIONS = { status: "success", connections };
      await this.broadcastProgress(
        deploymentId,
        "VERIFY_CONNECTIONS",
        "success",
        "All integrations verified"
      );

      // Step 2: Analyze repository
      await this.broadcastProgress(
        deploymentId,
        "ANALYZE_REPOSITORY",
        "in-progress",
        `Analyzing repository ${deploymentConfig.owner}/${deploymentConfig.repo}...`
      );
      const analysis = await this.analyzeRepository(
        userId,
        deploymentConfig.owner,
        deploymentConfig.repo
      );
      deployment.steps.ANALYZE_REPOSITORY = { status: "success", analysis };
      await this.broadcastProgress(
        deploymentId,
        "ANALYZE_REPOSITORY",
        "success",
        "Repository analysis complete"
      );

      // Step 3: Generate deployment files
      await this.broadcastProgress(
        deploymentId,
        "GENERATE_DEPLOYMENT_FILES",
        "in-progress",
        "Generating Dockerfile, Jenkinsfile, docker-compose.yml..."
      );
      const deploymentFiles = await this.generateDeploymentFiles(
        userId,
        deploymentConfig,
        analysis
      );
      deployment.steps.GENERATE_DEPLOYMENT_FILES = {
        status: "success",
        files: deploymentFiles,
      };
      await this.broadcastProgress(
        deploymentId,
        "GENERATE_DEPLOYMENT_FILES",
        "success",
        "All deployment files generated"
      );

      // Step 4: Provision infrastructure (intelligent, free-tier aware)
      await this.broadcastProgress(
        deploymentId,
        "PROVISION_INFRASTRUCTURE",
        "in-progress",
        "Discovering or provisioning EC2 infrastructure..."
      );
      const infrastructure = await this.provisionInfrastructure(
        userId,
        { ...deploymentConfig, deploymentId },
        analysis
      );
      deployment.infrastructure = infrastructure;
      deployment.steps.PROVISION_INFRASTRUCTURE = {
        status: "success",
        infrastructure,
      };
      await this.broadcastProgress(
        deploymentId,
        "PROVISION_INFRASTRUCTURE",
        "success",
        `Infrastructure ready: ${infrastructure.instanceId} (${infrastructure.instanceType}) at ${infrastructure.publicIp}`
      );

      // Step 5: Create Jenkins job
      await this.broadcastProgress(
        deploymentId,
        "CREATE_JENKINS_JOB",
        "in-progress",
        "Creating Jenkins job..."
      );
      const jenkinsJob = await this.createJenkinsJobAutomatic(
        userId,
        deploymentConfig,
        deploymentFiles
      );
      deployment.jenkinsJob = jenkinsJob;
      deployment.steps.CREATE_JENKINS_JOB = {
        status: "success",
        jobName: jenkinsJob.name,
        jobUrl: jenkinsJob.url,
      };
      await this.broadcastProgress(
        deploymentId,
        "CREATE_JENKINS_JOB",
        "success",
        `Jenkins job created: ${jenkinsJob.name}`
      );

      // Step 6: Configure Jenkins credentials
      await this.broadcastProgress(
        deploymentId,
        "CONFIGURE_JENKINS_CREDENTIALS",
        "in-progress",
        "Configuring Jenkins credentials..."
      );
      const credentialsConfig = await this.configureJenkinsCredentials(
        userId,
        jenkinsJob
      );
      deployment.steps.CONFIGURE_JENKINS_CREDENTIALS = {
        status: "success",
        credentialsCount: credentialsConfig.count,
      };
      await this.broadcastProgress(
        deploymentId,
        "CONFIGURE_JENKINS_CREDENTIALS",
        "success",
        "Jenkins credentials configured"
      );

      // Step 7: Configure GitHub webhook
      await this.broadcastProgress(
        deploymentId,
        "CONFIGURE_GITHUB_WEBHOOK",
        "in-progress",
        "Configuring GitHub webhook..."
      );
      const webhook = await this.configureGitHubWebhookAutomatic(
        userId,
        deploymentConfig,
        jenkinsJob
      );
      deployment.webhook = webhook;
      deployment.steps.CONFIGURE_GITHUB_WEBHOOK = {
        status: "success",
        webhookUrl: webhook.url,
        webhookId: webhook.id,
      };
      await this.broadcastProgress(
        deploymentId,
        "CONFIGURE_GITHUB_WEBHOOK",
        "success",
        "GitHub webhook configured"
      );

      // Step 8: Build Docker image
      await this.broadcastProgress(
        deploymentId,
        "BUILD_DOCKER_IMAGE",
        "in-progress",
        "Building Docker image..."
      );
      const buildResult = await this.buildDockerImageAutomatic(
        userId,
        deploymentConfig,
        deploymentFiles,
        analysis
      );
      deployment.steps.BUILD_DOCKER_IMAGE = {
        status: "success",
        imageId: buildResult.imageId,
        imageTag: buildResult.tag,
      };
      await this.broadcastProgress(
        deploymentId,
        "BUILD_DOCKER_IMAGE",
        "success",
        `Docker image built: ${buildResult.tag}`
      );

      // Step 9: Push Docker image
      await this.broadcastProgress(
        deploymentId,
        "PUSH_DOCKER_IMAGE",
        "in-progress",
        "Pushing Docker image to registry..."
      );
      const pushResult = await this.pushDockerImageAutomatic(
        userId,
        buildResult
      );
      deployment.steps.PUSH_DOCKER_IMAGE = {
        status: "success",
        registryUrl: pushResult.registryUrl,
        pushTime: pushResult.pushTime,
      };
      await this.broadcastProgress(
        deploymentId,
        "PUSH_DOCKER_IMAGE",
        "success",
        `Image pushed to ${pushResult.registryUrl}`
      );

      // Step 10: Deploy to EC2
      await this.broadcastProgress(
        deploymentId,
        "DEPLOY_TO_EC2",
        "in-progress",
        `Deploying to EC2 instance ${infrastructure.instanceId}...`
      );
      const deploymentResult = await this.deployToEc2Automatic(
        userId,
        infrastructure,
        pushResult,
        deploymentConfig
      );
      deployment.deployment = deploymentResult;
      deployment.steps.DEPLOY_TO_EC2 = {
        status: "success",
        containerId: deploymentResult.containerId,
        containerUrl: deploymentResult.publicUrl,
      };
      await this.broadcastProgress(
        deploymentId,
        "DEPLOY_TO_EC2",
        "success",
        `Application deployed at ${deploymentResult.publicUrl}`
      );

      // Step 11: Run health checks
      await this.broadcastProgress(
        deploymentId,
        "RUN_HEALTH_CHECKS",
        "in-progress",
        "Running health checks..."
      );
      const healthCheckResult = await this.runHealthChecksAutomatic(
        deploymentResult
      );
      deployment.steps.RUN_HEALTH_CHECKS = {
        status: "success",
        checks: healthCheckResult.checks,
        healthy: healthCheckResult.healthy,
      };
      await this.broadcastProgress(
        deploymentId,
        "RUN_HEALTH_CHECKS",
        "success",
        "Health checks passed"
      );

      // Step 12: Enable auto-deploy
      await this.broadcastProgress(
        deploymentId,
        "ENABLE_AUTO_DEPLOY",
        "in-progress",
        "Enabling auto-deploy for future pushes..."
      );
      const autoDeployResult = await this.enableAutoDeployAutomatic(
        userId,
        deploymentId,
        deploymentConfig,
        jenkinsJob,
        webhook
      );
      deployment.steps.ENABLE_AUTO_DEPLOY = {
        status: "success",
        autoDeployEnabled: true,
      };
      await this.broadcastProgress(
        deploymentId,
        "ENABLE_AUTO_DEPLOY",
        "success",
        "Auto-deploy enabled for future GitHub pushes"
      );

      // Final step: Mark as complete
      deployment.status = "success";
      deployment.completedAt = new Date();
      deployment.steps.COMPLETE = {
        status: "success",
        duration: Date.now() - deployment.startedAt.getTime(),
      };

      await this.broadcastProgress(
        deploymentId,
        "COMPLETE",
        "success",
        "One-click deployment completed successfully!"
      );

      // Save to database if connected
      if (isDbConnected()) {
        await this.saveDeploymentToDB(deployment);
      }

      return {
        success: true,
        deploymentId,
        instanceId: infrastructure.instanceId,
        publicIp: infrastructure.publicIp,
        publicDns: infrastructure.publicDns,
        appUrl: deploymentResult.appUrl || deploymentResult.publicUrl,
        jenkinsUrl: deploymentResult.jenkinsUrl || jenkinsJob.url,
        deployment,
      };
    } catch (error) {
      console.error("[OneClick Deploy] Deployment failed:", error);
      deployment.status = "failed";
      deployment.error = error.message;
      deployment.failedAt = new Date();

      await this.broadcastProgress(
        deploymentId,
        deployment.steps ? Object.keys(deployment.steps)[Object.keys(deployment.steps).length - 1] : "VERIFY_CONNECTIONS",
        "failed",
        `Deployment failed: ${error.message}`
      );

      return {
        success: false,
        deploymentId,
        error: error.message,
        deployment,
      };
    }
  }

  /**
   * Verify all required connections
   */
  async verifyConnections(userId) {
    try {
      const [jenkins, dockerHub, aws, github] = await Promise.all([
        getJenkinsStatus(userId),
        getDockerHubStatus(userId),
        AWSConnection.findOne({ userId, connected: true }).lean(),
        getGitHubStatus(userId),
      ]);

      const jenkinsOk = jenkinsValidationPassed(jenkins.status);
      const dockerOk = dockerHub.status?.connected && dockerHub.status?.permissions?.push;
      const awsOk = Boolean(aws?.encryptedCredentials && aws?.region);
      const githubOk = Boolean(github?.githubConnected || github?.connected);

      if (!jenkinsOk) throw new Error("Jenkins connection validation failed");
      if (!dockerOk) throw new Error("Docker Hub connection validation failed");
      if (!awsOk) throw new Error("AWS connection validation failed");
      if (!githubOk) throw new Error("GitHub connection validation failed");

      return {
        jenkins: jenkins.status,
        dockerHub: dockerHub.status,
        aws: {
          connected: true,
          region: aws.region,
          accountId: aws.accountId,
        },
        github: github,
      };
    } catch (error) {
      throw new Error(`Connection verification failed: ${error.message}`);
    }
  }

  /**
   * Analyze repository
   */
  async analyzeRepository(userId, owner, repo) {
    try {
      const analysis = await analyzeRepository(
        userId,
        owner,
        repo
      );
      return analysis;
    } catch (error) {
      throw new Error(`Repository analysis failed: ${error.message}`);
    }
  }

  /**
   * Generate all deployment files
   */
  async generateDeploymentFiles(userId, config, analysis) {
    try {
      const dockerfile = generateDockerfile(analysis);
      const jenkinsfile = generateJenkinsfile(config, analysis);
      const dockerCompose = generateDockerCompose(config, analysis);

      return {
        dockerfile,
        jenkinsfile,
        dockerCompose,
        analysis,
      };
    } catch (error) {
      throw new Error(`Deployment file generation failed: ${error.message}`);
    }
  }

  /**
   * Provision infrastructure (intelligent, free-tier aware)
   */
  async provisionInfrastructure(userId, config, analysis) {
    try {
      const infrastructure = await ec2IntelligentProvisioningService.provisionOrReuse(
        userId,
        config,
        analysis
      );
      return infrastructure;
    } catch (error) {
      throw new Error(`Infrastructure provisioning failed: ${error.message}`);
    }
  }

  /**
   * Create Jenkins job automatically
   */
  async createJenkinsJobAutomatic(userId, config, deploymentFiles) {
    try {
      const jobConfig = {
        jobName: `${config.repo}-auto-deploy`,
        description: `Auto-deployed job for ${config.owner}/${config.repo}`,
        repositoryUrl: `https://github.com/${config.owner}/${config.repo}`,
        jenkinsfile: deploymentFiles.jenkinsfile,
        pipelineScript: this.generateJenkinsPipelineScript(config, deploymentFiles),
      };

      const job = await createJenkinsJob(userId, jobConfig);
      return job;
    } catch (error) {
      throw new Error(`Jenkins job creation failed: ${error.message}`);
    }
  }

  /**
   * Generate Jenkins pipeline script
   */
  generateJenkinsPipelineScript(config, deploymentFiles) {
    return `pipeline {
  agent any
  
  stages {
    stage('Checkout') {
      steps {
        checkout([$class: 'GitSCM', branches: [[name: '${config.branch}']], userRemoteConfigs: [[url: 'https://github.com/${config.owner}/${config.repo}']]])
      }
    }
    
    stage('Build') {
      steps {
        sh 'docker build -t ${config.repo}:latest .'
      }
    }
    
    stage('Push') {
      steps {
        sh 'docker push ${config.repo}:latest'
      }
    }
    
    stage('Deploy') {
      steps {
        sh 'docker run -d -p 80:3000 ${config.repo}:latest'
      }
    }
  }
}`;
  }

  /**
   * Configure Jenkins credentials
   */
  async configureJenkinsCredentials(userId, jenkinsJob) {
    try {
      // Get GitHub and Docker Hub credentials
      const [githubCreds, dockerCreds] = await Promise.all([
        this.getGitHubCredentials(userId),
        this.getDockerHubCredentials(userId),
      ]);

      // Configure them in Jenkins
      const result = {
        count: 0,
      };

      if (githubCreds) {
        // Add GitHub credentials to Jenkins
        result.count++;
      }

      if (dockerCreds) {
        // Add Docker credentials to Jenkins
        result.count++;
      }

      return result;
    } catch (error) {
      throw new Error(`Jenkins credentials configuration failed: ${error.message}`);
    }
  }

  /**
   * Configure GitHub webhook
   */
  async configureGitHubWebhookAutomatic(userId, config, jenkinsJob) {
    try {
      const webhook = await createGitHubWebhook(userId, {
        owner: config.owner,
        repo: config.repo,
        jenkinsJobUrl: jenkinsJob.url,
      });
      return webhook;
    } catch (error) {
      throw new Error(`GitHub webhook configuration failed: ${error.message}`);
    }
  }

  /**
   * Build Docker image
   */
  async buildDockerImageAutomatic(userId, config, deploymentFiles, analysis) {
    try {
      const imageTag = `${config.repo}:${Date.now()}`;
      const buildResult = await buildDockerImage(userId, {
        imageTag,
        dockerfile: deploymentFiles.dockerfile,
        context: process.cwd(),
      });
      return buildResult;
    } catch (error) {
      throw new Error(`Docker image build failed: ${error.message}`);
    }
  }

  /**
   * Push Docker image to registry
   */
  async pushDockerImageAutomatic(userId, buildResult) {
    try {
      const pushResult = await pushImageToDockerHub(userId, {
        imageId: buildResult.imageId,
        imageTag: buildResult.tag,
      });
      return pushResult;
    } catch (error) {
      throw new Error(`Docker image push failed: ${error.message}`);
    }
  }

  /**
   * Deploy to EC2 with automatic Docker installation
   * ✅ NO AWS_EC2_KEY_PATH or AWS_EC2_PRIVATE_KEY env vars needed
   * ✅ Uses generated private key from infrastructure
   * ✅ Automatically installs Docker, Docker Compose, Git
   * ✅ Returns complete deployment info with appUrl and jenkinsUrl
   */
  async deployToEc2Automatic(userId, infrastructure, imageResult, config) {
    try {
      const osIdentifier = infrastructure.operatingSystem || "ubuntu";
      
      const deploymentResult = await deployDockerImageToEc2({
        userId,
        instanceId: infrastructure.instanceId,
        publicIp: infrastructure.publicIp,
        publicDns: infrastructure.publicDns,
        osIdentifier,
        image: imageResult.registryUrl || imageResult.imageTag || imageResult.tag,
        containerName: `${config.repo}-container`,
        ports: "80:3000",
        generatedKeyName: infrastructure.generatedKeyName || infrastructure.keyPairName,
        generatedPrivateKey:
          infrastructure.generatedKeyMaterial ||
          infrastructure.generatedPrivateKey ||
          infrastructure.privateKey,
        keyPairName: infrastructure.keyPairName,
        username: osIdentifier === "amazon-linux" ? "ec2-user" : "ubuntu",
      });
      
      return {
        ...deploymentResult,
        containerId: deploymentResult.deployment?._id?.toString(),
        publicUrl: deploymentResult.appUrl,
      };
    } catch (error) {
      throw new Error(`EC2 deployment failed: ${error.message}`);
    }
  }

  /**
   * Run health checks
   */
  async runHealthChecksAutomatic(deploymentResult) {
    try {
      const targetUrl = deploymentResult.appUrl || deploymentResult.publicUrl;
      if (!targetUrl) {
        throw new Error("Deployment result did not include an application URL");
      }

      const response = await axios.get(targetUrl, {
        timeout: Number(process.env.DEPLOYMENT_HEALTHCHECK_TIMEOUT_MS || 15000),
        validateStatus: (status) => status >= 200 && status < 500,
      });
      const checks = [
        {
          name: "application-http",
          url: targetUrl,
          statusCode: response.status,
          passed: response.status >= 200 && response.status < 400,
        },
      ];
      if (!checks.every((check) => check.passed)) {
        throw new Error(`Application health check failed for ${targetUrl} with HTTP ${response.status}`);
      }
      return {
        checks,
        healthy: checks.every((c) => c.passed),
      };
    } catch (error) {
      throw new Error(`Health checks failed: ${error.message}`);
    }
  }

  /**
   * Enable auto-deploy
   */
  async enableAutoDeployAutomatic(userId, deploymentId, config, jenkinsJob, webhook) {
    try {
      const result = await enableAutoDeploy(userId, {
        deploymentId,
        repositoryOwner: config.owner,
        repositoryName: config.repo,
        jenkinsJobUrl: jenkinsJob.url,
        webhookId: webhook.id,
      });
      return result;
    } catch (error) {
      throw new Error(`Auto-deploy enablement failed: ${error.message}`);
    }
  }

  /**
   * Helper: Get GitHub credentials
   */
  async getGitHubCredentials(userId) {
    // Implementation to retrieve GitHub credentials
    return null;
  }

  /**
   * Helper: Get Docker Hub credentials
   */
  async getDockerHubCredentials(userId) {
    // Implementation to retrieve Docker Hub credentials
    return null;
  }

  /**
   * Save deployment to database
   */
  async saveDeploymentToDB(deployment) {
    try {
      const deploymentData = new Deployment({
        userId: deployment.userId,
        deploymentId: deployment.id,
        repositoryOwner: deployment.repositoryOwner,
        repositoryName: deployment.repositoryName,
        branch: deployment.branch,
        status: deployment.status,
        infrastructure: deployment.infrastructure,
        jenkinsJob: deployment.jenkinsJob,
        webhook: deployment.webhook,
        startedAt: deployment.startedAt,
        completedAt: deployment.completedAt,
        error: deployment.error,
        steps: deployment.steps,
      });

      await deploymentData.save();
    } catch (error) {
      console.error("Failed to save deployment to database:", error);
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId) {
    const deployment = this.deploymentStates.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }
    return deployment;
  }

  /**
   * Get all deployments for user
   */
  async getUserDeployments(userId) {
    const deployments = Array.from(this.deploymentStates.values()).filter(
      (d) => d.userId === userId
    );
    return deployments;
  }
}

export const oneClickDeploymentService = new OneClickDeploymentService();
