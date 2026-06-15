/**
 * Provisioning Job Queue Service
 * Manages async provisioning jobs with proper error handling and retry logic
 */

import { v4 as uuidv4 } from "uuid";
import { ProvisioningJob } from "../models/ProvisioningJob.js";
import { logger } from "../utils/logger.js";

class ProvisioningJobQueue {
  constructor() {
    this.jobs = new Map(); // In-memory job tracking for active jobs
    this.workers = new Map(); // Track active worker promises
    this.maxConcurrentJobs = 5;
    this.jobTimeout = 15 * 60 * 1000; // 15 minutes
    this.maxRetries = 3;
  }

  /**
   * Create a new provisioning job
   */
  async createJob(userId, awsConnectionId, config) {
    const jobId = uuidv4();

    const job = new ProvisioningJob({
      jobId,
      userId,
      awsConnectionId,
      config,
      status: "pending",
      startedAt: new Date(),
    });

    await job.save();

    logger.info("Provisioning job created", {
      jobId,
      userId,
      config: {
        region: config.region,
        instanceType: config.instanceType,
        os: config.os,
      },
    });

    // Store in memory for quick access
    this.jobs.set(jobId, {
      status: "pending",
      progress: 0,
      createdAt: Date.now(),
    });

    return {
      jobId,
      status: "pending",
      progress: 0,
      message: "Provisioning job queued successfully",
    };
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId) {
    const job = await ProvisioningJob.findOne({ jobId });

    if (!job) {
      throw new Error("Job not found");
    }

    return job.toResponse();
  }

  /**
   * Start provisioning job (called asynchronously)
   */
  async startJob(jobId, provisioner) {
    try {
      const job = await ProvisioningJob.findOne({ jobId });

      if (!job) {
        throw new Error("Job not found");
      }

      // Update job status
      job.status = "in_progress";
      job.startedAt = new Date();
      await job.save();

      this.jobs.set(jobId, {
        status: "in_progress",
        progress: 0,
        startedAt: Date.now(),
      });

      logger.info("Provisioning job started", { jobId });

      // Call the provisioner with job tracking callbacks
      const result = await provisioner(
        jobId,
        async (step, status, message, options = {}) => {
          await this.updateJobStep(jobId, step, status, message, options);
        },
        async (entry) => {
          await this.updateDebugLog(jobId, entry);
        }
      );

      // Mark job as completed
      job.markComplete(result);
      await job.save();

      logger.info("Provisioning job completed", {
        jobId,
        result: {
          instanceId: result.instanceId,
          publicIp: result.publicIp,
        },
      });

      this.jobs.set(jobId, {
        status: "completed",
        progress: 100,
        completedAt: Date.now(),
      });

      return result;
    } catch (error) {
      logger.error("Provisioning job failed", {
        jobId,
        error: error.message,
        stack: error.stack,
      });

      const job = await ProvisioningJob.findOne({ jobId });
      if (job) {
        job.markFailed({
          message: error.message,
          type: error.name,
          code: error.code,
          fullError: error.stack,
          awsErrorCode: error.__type || error.code,
          awsErrorMessage: error.message,
          executionStop: error.executionStop,
        });
        await job.save();
      }

      this.jobs.set(jobId, {
        status: "failed",
        progress: this.jobs.get(jobId)?.progress || 0,
        failedAt: Date.now(),
        error: error.message,
      });

      throw error;
    } finally {
      // Clean up
      this.workers.delete(jobId);
    }
  }

  /**
   * Update job step progress
   */
  async updateJobStep(jobId, step, status, message, options = {}) {
    const job = await ProvisioningJob.findOne({ jobId });

    if (!job) {
      logger.warn("Job not found for update", { jobId });
      return;
    }

    job.updateStep(step, status, message, options);

    // Update progress
    if (options.progress !== undefined) {
      job.progress = options.progress;
    }

    if (options.awsOperation) {
      job.awsOperation = options.awsOperation;
      job.currentOperation = options.currentOperation || options.awsOperation;
    }

    if (options.currentOperation) {
      job.currentOperation = options.currentOperation;
    }

    // Update step status in memory
    this.jobs.set(jobId, {
      status: "in_progress",
      progress: job.progress,
      currentStep: step,
      lastUpdate: Date.now(),
    });

    await job.save();

    logger.info("Provisioning step updated", {
      jobId,
      step,
      status,
      progress: job.progress,
      message,
    });
  }

  /**
   * Append detailed debug log information without changing the visible step.
   */
  async updateDebugLog(jobId, entry = {}) {
    const job = await ProvisioningJob.findOne({ jobId });

    if (!job) {
      logger.warn("Job not found for debug log update", { jobId });
      return;
    }

    if (entry.awsOperation) {
      job.awsOperation = entry.awsOperation;
      job.currentOperation = entry.currentOperation || entry.awsOperation;
    }

    if (entry.currentOperation) {
      job.currentOperation = entry.currentOperation;
    }

    job.debugLogs.push({
      level: entry.level || "info",
      message: entry.message,
      awsOperation: entry.awsOperation,
      details: entry.details || {},
      timestamp: new Date(),
    });

    await job.save();
  }

  /**
   * Get provisioning debug state.
   */
  async getJobDebug(jobId) {
    const job = await ProvisioningJob.findOne({ jobId });

    if (!job) {
      throw new Error("Job not found");
    }

    return {
      currentStep: job.currentStep,
      lastSuccessfulStep: job.lastSuccessfulStep,
      awsOperation: job.awsOperation,
      currentOperation: job.currentOperation || job.awsOperation,
      stoppedAtStep: job.status === "failed" ? job.currentStep : undefined,
      logs: job.debugLogs,
      error: job.error,
    };
  }

  /**
   * Cancel job
   */
  async cancelJob(jobId) {
    const job = await ProvisioningJob.findOne({ jobId });

    if (!job) {
      throw new Error("Job not found");
    }

    if (job.status === "completed" || job.status === "failed") {
      throw new Error(`Cannot cancel a ${job.status} job`);
    }

    job.status = "cancelled";
    job.completedAt = new Date();
    await job.save();

    logger.info("Provisioning job cancelled", { jobId });

    this.jobs.delete(jobId);
    this.workers.delete(jobId);

    return {
      jobId,
      status: "cancelled",
      message: "Job cancelled successfully",
    };
  }

  /**
   * Get active jobs count
   */
  getActiveJobsCount() {
    let count = 0;
    for (const [_, job] of this.jobs) {
      if (job.status === "in_progress" || job.status === "pending") {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if can accept new job
   */
  canAcceptNewJob() {
    return this.getActiveJobsCount() < this.maxConcurrentJobs;
  }

  /**
   * Get queue stats
   */
  async getQueueStats() {
    const jobCounts = await ProvisioningJob.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const stats = {
      total: 0,
      pending: 0,
      in_progress: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      activeWorkers: this.workers.size,
    };

    for (const { _id, count } of jobCounts) {
      stats[_id] = count;
      stats.total += count;
    }

    return stats;
  }

  /**
   * Cleanup old jobs (optional maintenance)
   */
  async cleanupOldJobs(daysOld = 7) {
    const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

    const result = await ProvisioningJob.deleteMany({
      $and: [
        {
          $or: [
            { status: "completed" },
            { status: "failed" },
            { status: "cancelled" },
          ],
        },
        { completedAt: { $lt: cutoffDate } },
      ],
    });

    logger.info("Cleaned up old provisioning jobs", {
      deletedCount: result.deletedCount,
      cutoffDate,
    });

    return result;
  }
}

export const provisioningJobQueue = new ProvisioningJobQueue();
