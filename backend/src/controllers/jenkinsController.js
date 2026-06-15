import * as jenkinsService from "../services/jenkinsService.js";
import * as deploymentTrackingService from "../services/deploymentTrackingService.js";
import {
  connectJenkins,
  disconnectJenkins,
  getJenkinsStatus,
  testSavedJenkinsConnection,
  validateJenkinsConnection,
} from "../services/jenkinsConnectionService.js";
import {
  generateJenkinsPipeline,
  previewJenkinsPipeline,
} from "../services/jenkinsPipelineGeneratorService.js";
import {
  createJenkinsJob,
  deleteJenkinsJob,
  getJenkinsJob,
  listJenkinsJobs,
  recreateJenkinsJob,
} from "../services/jenkinsJobService.js";

function getUserId(req) {
  return req.user?.userId || req.user?.uid || req.user?.id || "system";
}

/**
 * Helper function to add timeout to async operations
 */
function withTimeout(promise, timeoutMs, operationName = "Operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

export const connectJenkinsHandler = async (req, res) => {
  try {
    const result = await connectJenkins(getUserId(req), {
      url: req.body?.url,
      username: req.body?.username,
      apiToken: req.body?.apiToken,
    });

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("[Jenkins] Connect failed:", error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getJenkinsStatusHandler = async (req, res) => {
  try {
    const result = await getJenkinsStatus(getUserId(req));
    res.json(result);
  } catch (error) {
    console.error("[Jenkins] Status failed:", error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const disconnectJenkinsHandler = async (req, res) => {
  try {
    const result = await disconnectJenkins(getUserId(req));
    res.json(result);
  } catch (error) {
    console.error("[Jenkins] Disconnect failed:", error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const testJenkinsHandler = async (req, res) => {
  try {
    const hasInlineCredentials = req.body?.url || req.body?.username || req.body?.apiToken;
    const result = hasInlineCredentials
      ? await validateJenkinsConnection({
          url: req.body?.url,
          username: req.body?.username,
          apiToken: req.body?.apiToken,
        })
      : await testSavedJenkinsConnection(getUserId(req));

    res.status(result.success ? 200 : 400).json(result);
  } catch (error) {
    console.error("[Jenkins] Test failed:", error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

function validateRepositoryInput(req, res) {
  console.log('\n=== JENKINS CONTROLLER INPUT VALIDATION ===');
  console.log('[JENKINS_INPUT] Raw request body:', {
    owner: req.body?.owner,
    repo: req.body?.repo,
    branch: req.body?.branch,
    hasJenkinsfile: !!req.body?.jenkinsfile,
  });

  const { owner, repo } = req.body;

  if (!owner || typeof owner !== "string") {
    console.error('[JENKINS_INPUT] ❌ Validation failed: owner is required');
    res.status(400).json({ success: false, message: "owner is required" });
    return false;
  }

  if (!repo || typeof repo !== "string") {
    console.error('[JENKINS_INPUT] ❌ Validation failed: repo is required');
    res.status(400).json({ success: false, message: "repo is required" });
    return false;
  }

  const trimmedOwner = String(owner).trim();
  const trimmedRepo = String(repo).trim();

  console.log('[JENKINS_INPUT] ✅ Validation passed:', {
    owner: trimmedOwner,
    repo: trimmedRepo,
    branch: req.body?.branch || "main",
  });

  return true;
}

export const previewJenkinsPipelineHandler = async (req, res) => {
  try {
    if (!validateRepositoryInput(req, res)) return;

    const result = await previewJenkinsPipeline(getUserId(req), {
      owner: req.body.owner.trim(),
      repo: req.body.repo.trim(),
      branch: req.body.branch || "main",
      dockerHubCredentialsId: req.body.dockerHubCredentialsId,
      ec2SshCredentialsId: req.body.ec2SshCredentialsId,
    });

    res.json(result);
  } catch (error) {
    console.error("[Jenkins] Pipeline preview failed:", error.message);
    res.status(400).json({
      success: false,
      message: error.response?.data?.message || error.message,
    });
  }
};

export const generateJenkinsPipelineHandler = async (req, res) => {
  try {
    if (!validateRepositoryInput(req, res)) return;

    const owner = req.body.owner.trim();
    const repo = req.body.repo.trim();
    const branch = req.body.branch || "main";
    const repositoryUrl = req.body.repositoryUrl;

    console.log('\n========================================');
    console.log('=== GENERATE PIPELINE HANDLER START ===');
    console.log('========================================');
    console.log('[JENKINS_HANDLER] Calling generateJenkinsPipeline with:', {
      owner,
      repo,
      branch,
      repositoryUrl,
      hasJenkinsfile: !!req.body.jenkinsfile,
    });

    const result = await generateJenkinsPipeline(getUserId(req), {
      owner,
      repo,
      branch,
      repositoryUrl,
      jenkinsfile: req.body.jenkinsfile,
      dockerHubCredentialsId: req.body.dockerHubCredentialsId,
      ec2SshCredentialsId: req.body.ec2SshCredentialsId,
    });

    console.log('[JENKINS_HANDLER] ✅ Pipeline generation successful');
    res.json(result);
  } catch (error) {
    console.error("\n=== JENKINS HANDLER ERROR ===");
    console.error('[Jenkins] Pipeline generation failed:', {
      message: error.message,
      status: error.response?.status,
      responseData: error.response?.data,
      details: error.details,
    });

    // Return detailed error to frontend
    const errorResponse = {
      success: false,
      message: error.message,
      error: {
        type: error.response?.status === 404 ? 'GITHUB_NOT_FOUND' : 'PIPELINE_GENERATION_FAILED',
        statusCode: error.response?.status,
        details: error.details || {
          owner: req.body?.owner,
          repo: req.body?.repo,
          branch: req.body?.branch,
          repositoryUrl: req.body?.repositoryUrl,
        },
        githubResponse: error.response?.data,
      },
    };

    res.status(error.response?.status || 400).json(errorResponse);
  }
};

export const createJenkinsJobHandler = async (req, res) => {
  try {
    const result = await createJenkinsJob(getUserId(req), {
      jobName: req.body?.jobName,
      owner: req.body?.owner,
      repo: req.body?.repo,
      repositoryUrl: req.body?.repositoryUrl,
      branch: req.body?.branch || "main",
      jenkinsfilePath: req.body?.jenkinsfilePath || "Jenkinsfile",
    });

    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) {
    console.error("[Jenkins] Job creation failed:", error.message);
    res.status(400).json({
      success: false,
      message: error.response?.data?.message || error.message,
      jenkins: error.jenkins,
    });
  }
};

export const listJenkinsJobsHandler = async (req, res) => {
  try {
    const result = await listJenkinsJobs(getUserId(req));
    res.json(result);
  } catch (error) {
    console.error("[Jenkins] Job list failed:", error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const getJenkinsJobHandler = async (req, res) => {
  try {
    const result = await getJenkinsJob(getUserId(req), req.params.id);
    res.json(result);
  } catch (error) {
    console.error("[Jenkins] Job detail failed:", error.message);
    res.status(404).json({ success: false, message: error.message });
  }
};

export const deleteJenkinsJobHandler = async (req, res) => {
  try {
    const result = await deleteJenkinsJob(getUserId(req), req.params.id);
    res.json(result);
  } catch (error) {
    console.error("[Jenkins] Job deletion failed:", error.message);
    res.status(400).json({
      success: false,
      message: error.response?.data?.message || error.message,
    });
  }
};

export const recreateJenkinsJobHandler = async (req, res) => {
  try {
    const result = await recreateJenkinsJob(getUserId(req), req.params.id);
    res.status(201).json(result);
  } catch (error) {
    console.error("[Jenkins] Job recreate failed:", error.message);
    res.status(400).json({
      success: false,
      message: error.response?.data?.message || error.message,
    });
  }
};

/**
 * Trigger a new Jenkins build
 */
export const triggerBuild = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { repository, commit, branch, environment, cause } = req.body;

    if (!repository || !commit || !branch) {
      return res.status(400).json({
        error: "Missing required fields: repository, commit, branch",
      });
    }

    const webhookData = {
      repository,
      commit,
      branch,
      environment: environment || "development",
      cause: cause || "API",
    };

    const result = await jenkinsService.triggerJenkinsPipeline(webhookData, userId);

    if (!result.success) {
      return res.status(400).json({
        error: result.error,
      });
    }

    res.json({
      message: "Build triggered successfully",
      buildNumber: result.buildNumber,
      buildUrl: result.buildUrl,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current pipeline status
 */
export const getPipelineStatus = async (req, res, next) => {
  try {
    // Reduced timeout to 10 seconds to prevent frontend timeouts
    const result = await withTimeout(
      jenkinsService.getPipelineStatus(),
      10000,
      "Pipeline status fetch"
    );

    if (!result.success && !result.cached) {
      return res.status(200).json({
        success: false,
        status: "UNAVAILABLE",
        error: result.error,
        progress: 0,
      });
    }

    res.json(result);
  } catch (error) {
    console.error("❌ [Controller] Pipeline status error:", error.message);
    
    // Always return a response, never timeout
    res.status(200).json({
      success: false,
      status: "UNAVAILABLE",
      error: "Jenkins is temporarily unavailable",
      progress: 0,
      message: "The backend is unable to reach Jenkins. Using cached data if available."
    });
  }
};

/**
 * Get build status by build number
 */
export const getBuildStatus = async (req, res, next) => {
  try {
    const { buildNumber } = req.params;

    const result = await jenkinsService.getJenkinsBuildStatus(parseInt(buildNumber));

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get build details and sync with MongoDB
 */
export const getBuildDetails = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { buildNumber } = req.params;

    // Get from MongoDB if available
    const dbResult = await jenkinsService.getBuildDetailsFromDB(
      userId,
      parseInt(buildNumber)
    );

    if (dbResult.success) {
      return res.json(dbResult.build);
    }

    // Fetch and store from Jenkins
    const result = await jenkinsService.fetchAndStoreBuildDetails(
      parseInt(buildNumber),
      userId
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
      });
    }

    res.json(result.build);
  } catch (error) {
    next(error);
  }
};

/**
 * Get build console logs
 */
export const getBuildLogs = async (req, res, next) => {
  try {
    const { buildNumber } = req.params;
    const { start = 0 } = req.query;

    const result = await jenkinsService.getJenkinsBuildLogs(
      parseInt(buildNumber),
      parseInt(start)
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
      });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get build pipeline stages with progress
 */
export const getBuildStages = async (req, res, next) => {
  try {
    const { buildNumber } = req.params;

    const result = await jenkinsService.getJenkinsPipelineStages(
      parseInt(buildNumber)
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
      });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Abort a running build
 */
export const abortBuild = async (req, res, next) => {
  try {
    const { buildNumber } = req.params;

    const result = await jenkinsService.abortJenkinsBuild(parseInt(buildNumber));

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
      });
    }

    res.json({
      message: "Build aborted successfully",
      buildNumber: result.buildNumber,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get build history from Jenkins and sync with MongoDB
 */
export const getHistory = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { limit = 20, skip = 0, source = "db" } = req.query;

    // Fetch from Jenkins and sync
    if (source === "jenkins") {
      // Add timeout to Jenkins call
      const jenkinsResult = await withTimeout(
        jenkinsService.getBuildHistory(Math.min(parseInt(limit), 100), userId),
        8000,
        "Build history fetch"
      );

      if (!jenkinsResult.success) {
        // Return from DB as fallback instead of error
        const dbResult = await jenkinsService.getBuildHistoryFromDB(
          userId,
          parseInt(limit),
          parseInt(skip)
        );
        
        return res.json({
          source: "mongodb",
          builds: dbResult.builds,
          total: dbResult.total,
          limit: parseInt(limit),
          skip: parseInt(skip),
          warning: "Using cached MongoDB data - Jenkins unavailable",
        });
      }

      return res.json({
        source: "jenkins",
        builds: jenkinsResult.builds,
        count: jenkinsResult.count,
      });
    }

    // Get from MongoDB (default)
    const dbResult = await withTimeout(
      jenkinsService.getBuildHistoryFromDB(userId, parseInt(limit), parseInt(skip)),
      8000,
      "Database history fetch"
    );

    if (!dbResult.success) {
      return res.json({
        success: true,
        source: "mongodb",
        builds: [],
        total: 0,
        limit: parseInt(limit),
        skip: parseInt(skip),
        message: "No builds found",
      });
    }

    res.json({
      source: "mongodb",
      builds: dbResult.builds || [],
      total: dbResult.total || 0,
      limit: parseInt(limit),
      skip: parseInt(skip),
      success: true,
    });
  } catch (error) {
    console.error("❌ [Controller] Build history error:", error.message);
    
    // Even on error, return empty successful response
    res.json({
      success: true,
      source: "mongodb",
      builds: [],
      total: 0,
      limit: 20,
      skip: 0,
      message: "Unable to fetch build history",
    });
  }
};

/**
 * Get last successful build
 */
export const getLastSuccessful = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";

    const result = await jenkinsService.getLastSuccessfulBuild(userId);

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
      });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get builds by status
 */
export const getByStatus = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { status } = req.params;
    const { limit = 20 } = req.query;

    const result = await jenkinsService.getBuildsByStatus(
      userId,
      status.toUpperCase(),
      parseInt(limit)
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
      });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get builds by branch
 */
export const getByBranch = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { branch } = req.params;
    const { limit = 20 } = req.query;

    const result = await jenkinsService.getBuildsByBranch(
      userId,
      branch,
      parseInt(limit)
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
      });
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Get build statistics
 */
export const getStatistics = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { days = 30 } = req.query;

    const result = await withTimeout(
      jenkinsService.getBuildStatistics(userId, parseInt(days)),
      5000,
      "Build statistics fetch"
    );

    if (!result.success) {
      // Return empty stats on error instead of 500
      return res.json({
        stats: {
          totalBuilds: 0,
          successCount: 0,
          failureCount: 0,
          successRate: 0,
          avgDuration: 0,
          totalDuration: 0,
          buildsPerDay: [],
        },
      });
    }

    res.json(result);
  } catch (error) {
    console.error("❌ [Controller] Statistics error:", error.message);
    
    // Always return success response with empty data
    res.json({
      stats: {
        totalBuilds: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        avgDuration: 0,
        totalDuration: 0,
        buildsPerDay: [],
      },
    });
  }
};

/**
 * Sync Jenkins builds with MongoDB
 */
export const syncBuilds = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { limit = 50 } = req.body;

    const result = await jenkinsService.getBuildHistory(
      Math.min(parseInt(limit), 100),
      userId
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
      });
    }

    res.json({
      message: "Builds synced successfully",
      synced: result.count,
      builds: result.builds,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get deployment analytics and statistics
 */
export const getDeploymentAnalytics = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { days = 30 } = req.query;

    const result = await deploymentTrackingService.getDeploymentAnalytics(
      userId,
      parseInt(days)
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        jenkinsAvailable: false,
      });
    }

    res.json(result.analytics);
  } catch (error) {
    next(error);
  }
};

/**
 * Get deployment status by build number
 */
export const getDeploymentStatus = async (req, res, next) => {
  try {
    const { buildNumber } = req.params;

    const result = await deploymentTrackingService.getDeploymentStatus(
      parseInt(buildNumber)
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        jenkinsAvailable: result.jenkinsAvailable,
      });
    }

    res.json(result.status);
  } catch (error) {
    next(error);
  }
};

/**
 * Get recent deployments
 */
export const getRecentDeployments = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { limit = 20 } = req.query;

    const result = await deploymentTrackingService.getRecentDeployments(
      userId,
      parseInt(limit)
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        jenkinsAvailable: result.jenkinsAvailable,
      });
    }

    res.json({
      deployments: result.deployments,
      count: result.count,
      jenkinsAvailable: result.jenkinsAvailable,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get running deployments
 */
export const getRunningDeployments = async (req, res, next) => {
  try {
    const result = await deploymentTrackingService.getRunningDeployments();

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        jenkinsAvailable: result.jenkinsAvailable,
        runningDeployments: [],
      });
    }

    res.json({
      runningDeployments: result.runningDeployments,
      count: result.count,
      jenkinsAvailable: result.jenkinsAvailable,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Sync all Jenkins builds to database
 */
export const syncAllBuilds = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid || "system";
    const { limit = 50 } = req.body;

    const result = await deploymentTrackingService.syncJenkinsBuilds(
      userId,
      parseInt(limit)
    );

    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        jenkinsAvailable: result.jenkinsAvailable,
      });
    }

    res.json({
      message: "Builds synced successfully",
      syncedCount: result.syncedCount,
      totalBuilds: result.totalBuilds,
      syncedBuilds: result.syncedBuilds,
      jenkinsAvailable: result.jenkinsAvailable,
    });
  } catch (error) {
    next(error);
  }
};
