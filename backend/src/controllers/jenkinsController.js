import * as jenkinsService from "../services/jenkinsService.js";

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
    const result = await jenkinsService.getPipelineStatus();

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
      const jenkinsResult = await jenkinsService.getBuildHistory(
        Math.min(parseInt(limit), 100),
        userId
      );

      if (!jenkinsResult.success) {
        return res.status(500).json({
          error: jenkinsResult.error,
        });
      }

      return res.json({
        source: "jenkins",
        builds: jenkinsResult.builds,
        count: jenkinsResult.count,
      });
    }

    // Get from MongoDB (default)
    const dbResult = await jenkinsService.getBuildHistoryFromDB(
      userId,
      parseInt(limit),
      parseInt(skip)
    );

    if (!dbResult.success) {
      return res.status(500).json({
        error: dbResult.error,
      });
    }

    res.json({
      source: "mongodb",
      builds: dbResult.builds,
      total: dbResult.total,
      limit: parseInt(limit),
      skip: parseInt(skip),
    });
  } catch (error) {
    next(error);
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

    const result = await jenkinsService.getBuildStatistics(
      userId,
      parseInt(days)
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
