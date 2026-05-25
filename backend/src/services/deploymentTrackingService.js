import axios from "axios";
import { Deployment } from "../models/Deployment.js";
import { BuildHistory } from "../models/BuildHistory.js";
import { createAlert } from "./alertService.js";
import { isJenkinsAvailable, makeJenkinsRequestWithRetry } from "./jenkinsService.js";

const JENKINS_URL = process.env.JENKINS_URL || "http://localhost:8080";
const JENKINS_USERNAME = process.env.JENKINS_USER || process.env.JENKINS_USERNAME || "admin";
const JENKINS_TOKEN = process.env.JENKINS_TOKEN || "";

/**
 * Get Jenkins API client with proper authentication
 */
function getJenkinsClient() {
  const auth = Buffer.from(`${JENKINS_USERNAME}:${JENKINS_TOKEN}`).toString("base64");
  
  return axios.create({
    baseURL: JENKINS_URL,
    headers: {
      Authorization: `Basic ${auth}`,
      "User-Agent": "DevOps-Dashboard",
    },
    timeout: 10000,
  });
}

/**
 * Track deployment from Jenkins build
 */
export const trackDeploymentFromBuild = async (buildNumber, userId = "system") => {
  try {
    if (!(await isJenkinsAvailable())) {
      console.warn("⚠️  [Deployment Tracking] Jenkins unavailable - cannot track deployment");
      return {
        success: false,
        error: "Jenkins server unavailable",
        jenkinsAvailable: false,
      };
    }

    console.log(`📊 [Deployment Tracking] Tracking build #${buildNumber}...`);

    const client = getJenkinsClient();
    const buildUrl = `/job/${encodeURIComponent(process.env.JENKINS_JOB_NAME || "devops-hub-deploy")}/${buildNumber}/api/json`;

    // Fetch build details from Jenkins
    const buildData = await makeJenkinsRequestWithRetry(
      () => client.get(buildUrl),
      `Fetch build #${buildNumber} details`
    );

    const build = buildData.data;

    // Prepare deployment data
    const deploymentData = {
      userId,
      buildNumber,
      jobName: build.fullDisplayName || build.displayName,
      buildUrl: build.url,
      status: build.result === "SUCCESS" ? "success" : build.result === "FAILURE" ? "failed" : "running",
      result: build.result || "UNKNOWN",
      duration: build.duration || 0,
      startTime: new Date(build.startTime),
      endTime: build.endTime ? new Date(build.endTime) : null,
      timestamp: new Date(),
      environment: "production",
      branch: extractBranchFromBuild(build),
      commit: extractCommitFromBuild(build),
      jenkinsAvailable: true,
    };

    // Try to get more details from Jenkins
    try {
      const consolePath = `/job/${encodeURIComponent(process.env.JENKINS_JOB_NAME || "devops-hub-deploy")}/${buildNumber}/consoleText`;
      const consoleData = await makeJenkinsRequestWithRetry(
        () => client.get(consolePath, { responseType: "text", maxContentLength: 1024 * 1024 }),
        `Fetch console output for build #${buildNumber}`
      );
      deploymentData.logs = consoleData.data;
    } catch (error) {
      console.warn(`⚠️  [Deployment Tracking] Could not fetch console logs:`, error.message);
      deploymentData.logs = "Console logs unavailable";
    }

    // Save to database
    const deployment = new Deployment(deploymentData);
    await deployment.save();

    console.log(`✅ [Deployment Tracking] Deployment #${buildNumber} tracked successfully`);

    // Create alert if deployment failed
    if (deploymentData.status === "failed") {
      await createAlert({
        type: "deployment_failed",
        severity: "high",
        title: `Deployment Build #${buildNumber} Failed`,
        description: `Jenkins build ${buildNumber} failed. Duration: ${(deploymentData.duration / 1000).toFixed(2)}s`,
        relatedResource: { type: "build", id: buildNumber },
        userId,
      });
    }

    return {
      success: true,
      deployment: deploymentData,
      jenkinsAvailable: true,
    };
  } catch (error) {
    console.error("❌ [Deployment Tracking] Error tracking deployment:", error.message);
    
    // Create alert for tracking failure
    await createAlert({
      type: "deployment_tracking_failed",
      severity: "medium",
      title: "Deployment Tracking Failed",
      description: error.message,
      userId,
    });

    return {
      success: false,
      error: error.message,
      jenkinsAvailable: await isJenkinsAvailable(),
    };
  }
};

/**
 * Get deployment analytics
 */
export const getDeploymentAnalytics = async (userId, days = 30) => {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const deployments = await Deployment.find({
      userId,
      createdAt: { $gte: startDate },
    });

    const analytics = {
      period: `${days} days`,
      totalDeployments: deployments.length,
      successfulDeployments: deployments.filter(d => d.status === "success").length,
      failedDeployments: deployments.filter(d => d.status === "failed").length,
      runningDeployments: deployments.filter(d => d.status === "running").length,
      successRate: deployments.length > 0 
        ? Math.round((deployments.filter(d => d.status === "success").length / deployments.length) * 100)
        : 0,
      averageDuration: deployments.length > 0
        ? Math.round(deployments.reduce((sum, d) => sum + (d.duration || 0), 0) / deployments.length)
        : 0,
      byStatus: {
        success: deployments.filter(d => d.status === "success").length,
        failed: deployments.filter(d => d.status === "failed").length,
        running: deployments.filter(d => d.status === "running").length,
      },
      byEnvironment: {},
      recentFailures: deployments
        .filter(d => d.status === "failed")
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5)
        .map(d => ({
          buildNumber: d.buildNumber,
          jobName: d.jobName,
          timestamp: d.timestamp,
          duration: d.duration,
        })),
    };

    // Count by environment
    deployments.forEach(d => {
      const env = d.environment || "unknown";
      analytics.byEnvironment[env] = (analytics.byEnvironment[env] || 0) + 1;
    });

    console.log(`📊 [Deployment Analytics] Generated analytics for ${days} days`);

    return {
      success: true,
      analytics,
    };
  } catch (error) {
    console.error("❌ [Deployment Analytics] Error generating analytics:", error.message);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get deployment status with real-time Jenkins data
 */
export const getDeploymentStatus = async (buildNumber) => {
  try {
    if (!(await isJenkinsAvailable())) {
      console.warn("⚠️  [Deployment Status] Jenkins unavailable");
      
      // Try to get from database
      const deployment = await Deployment.findOne({ buildNumber });
      if (deployment) {
        return {
          success: true,
          status: "last_known",
          deployment,
          jenkinsAvailable: false,
        };
      }

      return {
        success: false,
        error: "Jenkins unavailable and no cached data",
        jenkinsAvailable: false,
      };
    }

    const client = getJenkinsClient();
    const buildUrl = `/job/${encodeURIComponent(process.env.JENKINS_JOB_NAME || "devops-hub-deploy")}/${buildNumber}/api/json`;

    const buildData = await makeJenkinsRequestWithRetry(
      () => client.get(buildUrl),
      `Get status of build #${buildNumber}`
    );

    const build = buildData.data;

    const status = {
      buildNumber,
      displayName: build.displayName,
      status: build.result ? "COMPLETED" : "RUNNING",
      result: build.result || "IN_PROGRESS",
      progress: build.inProgress ? calculateProgress(build) : 100,
      duration: build.duration,
      estimatedDuration: build.estimatedDuration,
      timestamp: new Date(build.startTime),
      jenkinsAvailable: true,
    };

    // Try to get pipeline stages
    try {
      const stagesData = await makeJenkinsRequestWithRetry(
        () => client.get(`${buildUrl}/wfapi/describe`),
        `Get stages for build #${buildNumber}`
      );

      status.stages = stagesData.data.stages?.map(stage => ({
        name: stage.name,
        status: stage.status,
        startTime: stage.startTimeMillis ? new Date(stage.startTimeMillis) : null,
        endTime: stage.endTimeMillis ? new Date(stage.endTimeMillis) : null,
        duration: stage.durationMillis || 0,
      })) || [];
    } catch (error) {
      console.warn(`⚠️  [Deployment Status] Could not fetch stages for build #${buildNumber}:`, error.message);
      status.stages = [];
    }

    return {
      success: true,
      status,
      jenkinsAvailable: true,
    };
  } catch (error) {
    console.error("❌ [Deployment Status] Error getting status:", error.message);
    return {
      success: false,
      error: error.message,
      jenkinsAvailable: await isJenkinsAvailable(),
    };
  }
};

/**
 * Get recent deployments with Jenkins data
 */
export const getRecentDeployments = async (userId, limit = 20) => {
  try {
    const deployments = await Deployment.find({ userId })
      .sort({ timestamp: -1 })
      .limit(limit);

    return {
      success: true,
      deployments,
      count: deployments.length,
      jenkinsAvailable: await isJenkinsAvailable(),
    };
  } catch (error) {
    console.error("❌ [Recent Deployments] Error fetching:", error.message);
    return {
      success: false,
      error: error.message,
      jenkinsAvailable: await isJenkinsAvailable(),
    };
  }
};

/**
 * Sync Jenkins builds to deployment database
 */
export const syncJenkinsBuilds = async (userId = "system", limit = 50) => {
  try {
    if (!(await isJenkinsAvailable())) {
      console.warn("⚠️  [Sync Builds] Jenkins unavailable - cannot sync");
      return {
        success: false,
        error: "Jenkins server unavailable",
        jenkinsAvailable: false,
      };
    }

    console.log(`🔄 [Sync Builds] Syncing last ${limit} Jenkins builds...`);

    const client = getJenkinsClient();
    const jobName = process.env.JENKINS_JOB_NAME || "devops-hub-deploy";

    // Get job info
    const jobData = await makeJenkinsRequestWithRetry(
      () => client.get(`/job/${encodeURIComponent(jobName)}/api/json`),
      `Fetch job info for ${jobName}`
    );

    const job = jobData.data;
    const builds = job.builds || [];

    let syncedCount = 0;
    const syncedBuilds = [];

    // Sync last N builds
    for (const buildRef of builds.slice(0, limit)) {
      try {
        const result = await trackDeploymentFromBuild(buildRef.number, userId);
        if (result.success) {
          syncedCount++;
          syncedBuilds.push({
            buildNumber: buildRef.number,
            status: "synced",
          });
        }
      } catch (error) {
        console.warn(`⚠️  [Sync Builds] Failed to sync build ${buildRef.number}:`, error.message);
      }
    }

    console.log(`✅ [Sync Builds] Synced ${syncedCount} builds`);

    return {
      success: true,
      syncedCount,
      totalBuilds: builds.length,
      syncedBuilds,
      jenkinsAvailable: true,
    };
  } catch (error) {
    console.error("❌ [Sync Builds] Error syncing:", error.message);
    return {
      success: false,
      error: error.message,
      jenkinsAvailable: await isJenkinsAvailable(),
    };
  }
};

/**
 * Get running deployments
 */
export const getRunningDeployments = async () => {
  try {
    if (!(await isJenkinsAvailable())) {
      return {
        success: false,
        error: "Jenkins unavailable",
        runningDeployments: [],
        jenkinsAvailable: false,
      };
    }

    const client = getJenkinsClient();
    const jobName = process.env.JENKINS_JOB_NAME || "devops-hub-deploy";

    const jobData = await makeJenkinsRequestWithRetry(
      () => client.get(`/job/${encodeURIComponent(jobName)}/api/json`),
      `Fetch running builds for ${jobName}`
    );

    const job = jobData.data;

    // Find builds that are currently running
    const runningBuilds = [];
    for (const build of job.builds || []) {
      try {
        const buildData = await makeJenkinsRequestWithRetry(
          () => client.get(`${build.url}api/json`),
          `Check if build ${build.number} is running`
        );

        if (buildData.data.inProgress) {
          runningBuilds.push({
            buildNumber: build.number,
            displayName: buildData.data.displayName,
            startTime: new Date(buildData.data.startTime),
            duration: buildData.data.duration || 0,
            estimatedDuration: buildData.data.estimatedDuration || 0,
            progress: calculateProgress(buildData.data),
          });
        }
      } catch (error) {
        console.warn(`⚠️  [Running Deployments] Could not check build ${build.number}:`, error.message);
      }
    }

    return {
      success: true,
      runningDeployments: runningBuilds,
      count: runningBuilds.length,
      jenkinsAvailable: true,
    };
  } catch (error) {
    console.error("❌ [Running Deployments] Error fetching:", error.message);
    return {
      success: false,
      error: error.message,
      jenkinsAvailable: await isJenkinsAvailable(),
    };
  }
};

/**
 * Helper: Extract branch from Jenkins build
 */
function extractBranchFromBuild(build) {
  try {
    // Check various fields where branch might be stored
    if (build.actions) {
      for (const action of build.actions) {
        if (action._class === "hudson.plugins.git.util.BuildData") {
          return action.lastBuiltRevision?.branch?.[0]?.name || "unknown";
        }
      }
    }
    return "unknown";
  } catch (error) {
    return "unknown";
  }
}

/**
 * Helper: Extract commit from Jenkins build
 */
function extractCommitFromBuild(build) {
  try {
    // Check various fields where commit might be stored
    if (build.actions) {
      for (const action of build.actions) {
        if (action._class === "hudson.plugins.git.util.BuildData") {
          return action.lastBuiltRevision?.SHA1 || action.lastBuiltRevision?.name || "unknown";
        }
      }
    }
    return "unknown";
  } catch (error) {
    return "unknown";
  }
}

/**
 * Helper: Calculate build progress percentage
 */
function calculateProgress(build) {
  try {
    if (!build.inProgress) return 100;
    if (!build.startTime || !build.estimatedDuration) return 50;

    const elapsed = Date.now() - build.startTime;
    const progress = Math.min(Math.round((elapsed / build.estimatedDuration) * 100), 99);
    return progress;
  } catch (error) {
    return 50;
  }
}
