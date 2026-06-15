import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../data-local");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Simple file-based database for local development
export const localDB = {
  users: [],
  dashboards: [],
  logs: [],
  cicdPipelines: [],
  jenkinsJobs: [],
  githubWebhookConfigs: [],

  saveData() {
    fs.writeFileSync(
      path.join(dataDir, "db.json"),
      JSON.stringify(
        {
          users: this.users,
          dashboards: this.dashboards,
          logs: this.logs,
          cicdPipelines: this.cicdPipelines,
          jenkinsJobs: this.jenkinsJobs,
          githubWebhookConfigs: this.githubWebhookConfigs,
        },
        null,
        2
      )
    );
  },

  loadData() {
    const dbPath = path.join(dataDir, "db.json");
    if (fs.existsSync(dbPath)) {
      const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
      this.users = data.users || [];
      this.dashboards = data.dashboards || [];
      this.logs = data.logs || [];
      this.cicdPipelines = data.cicdPipelines || [];
      this.jenkinsJobs = data.jenkinsJobs || [];
      this.githubWebhookConfigs = data.githubWebhookConfigs || [];
    }
  },

  createUser(userData) {
    const id = Date.now().toString();
    const user = { _id: id, ...userData, createdAt: new Date() };
    this.users.push(user);
    this.saveData();
    return user;
  },

  findUserByEmail(email) {
    return this.users.find((u) => u.email === email);
  },

  findUserById(id) {
    return this.users.find((u) => u._id === id);
  },

  updateUserById(id, updates) {
    const user = this.findUserById(id);
    if (!user) return null;

    Object.entries(updates).forEach(([key, value]) => {
      if (key.includes(".")) {
        const parts = key.split(".");
        let target = user;
        parts.slice(0, -1).forEach((part) => {
          target[part] = target[part] || {};
          target = target[part];
        });
        target[parts[parts.length - 1]] = value;
      } else {
        user[key] = value;
      }
    });

    user.updatedAt = new Date();
    this.saveData();
    return user;
  },

  findOrCreateDashboard(userId) {
    let dashboard = this.dashboards.find((d) => d.userId === userId);
    if (!dashboard) {
      dashboard = { _id: Date.now().toString(), userId, data: {} };
      this.dashboards.push(dashboard);
      this.saveData();
    }
    return dashboard;
  },

  updateDashboard(userId, data) {
    const dashboard = this.dashboards.find((d) => d.userId === userId);
    if (dashboard) {
      dashboard.data = { ...dashboard.data, ...data };
      this.saveData();
      return dashboard;
    }
    return null;
  },

  createCicdPipeline(pipelineData) {
    const pipeline = {
      _id: Date.now().toString(),
      ...pipelineData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.cicdPipelines.push(pipeline);
    this.saveData();
    return pipeline;
  },

  findCicdPipelines(userId) {
    return this.cicdPipelines
      .filter((pipeline) => pipeline.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  createJenkinsJob(jobData) {
    const job = {
      _id: Date.now().toString(),
      ...jobData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jenkinsJobs.push(job);
    this.saveData();
    return job;
  },

  findJenkinsJobs(userId) {
    return this.jenkinsJobs
      .filter((job) => job.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  findJenkinsJobById(userId, id) {
    return this.jenkinsJobs.find((job) => job.userId === userId && (job._id === id || job.jobId === id));
  },

  findActiveJenkinsJob(userId, { jenkinsUrl, repositoryUrl, branch, jenkinsfilePath }) {
    return this.jenkinsJobs.find((job) =>
      job.userId === userId &&
      job.status === "active" &&
      job.jenkins?.url === jenkinsUrl &&
      job.repository?.url === repositoryUrl &&
      job.repository?.branch === branch &&
      job.repository?.jenkinsfilePath === jenkinsfilePath
    );
  },

  updateJenkinsJob(userId, id, updates) {
    const job = this.findJenkinsJobById(userId, id);
    if (!job) return null;

    Object.assign(job, updates, { updatedAt: new Date() });
    this.saveData();
    return job;
  },

  createGitHubWebhookConfig(configData) {
    const config = {
      _id: Date.now().toString(),
      ...configData,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.githubWebhookConfigs.push(config);
    this.saveData();
    return config;
  },

  findGitHubWebhookConfigs(userId) {
    return this.githubWebhookConfigs
      .filter((config) => config.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  findActiveGitHubWebhookConfig(userId, { fullName, webhookUrl }) {
    return this.githubWebhookConfigs.find((config) =>
      config.userId === userId &&
      config.status === "active" &&
      config.repository?.fullName === fullName &&
      config.webhookUrl === webhookUrl
    );
  },

  findGitHubWebhookConfig(userId, { owner, repo, hookId }) {
    return this.githubWebhookConfigs.find((config) =>
      config.userId === userId &&
      (hookId ? Number(config.hookId) === Number(hookId) : true) &&
      (owner && repo ? config.repository?.fullName === `${owner}/${repo}` : true)
    );
  },

  updateGitHubWebhookConfig(userId, id, updates) {
    const config = this.githubWebhookConfigs.find((item) =>
      item.userId === userId && (item._id === id || Number(item.hookId) === Number(id))
    );
    if (!config) return null;

    Object.assign(config, updates, { updatedAt: new Date() });
    this.saveData();
    return config;
  },
};

// Load data on startup
localDB.loadData();
