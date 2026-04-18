export const seedData = {
  pipeline: {
    buildStatus: "success",
    deploymentStatus: "healthy",
    environment: "production",
    lastCommit: {
      hash: "4fd91b7",
      message: "Optimize release workflow for dashboard service",
      author: "Arsh Dadwal",
      timestamp: new Date("2026-04-16T09:15:00.000Z"),
    },
    progress: 92,
    workflow: "github-actions / docker-release",
  },
  metrics: {
    cpu: 46,
    memory: 63,
    activeContainers: 8,
    latency: 138,
    history: [
      { time: "09:00", cpu: 32, memory: 46, traffic: 120 },
      { time: "10:00", cpu: 38, memory: 51, traffic: 148 },
      { time: "11:00", cpu: 45, memory: 54, traffic: 162 },
      { time: "12:00", cpu: 52, memory: 58, traffic: 171 },
      { time: "13:00", cpu: 49, memory: 61, traffic: 189 },
      { time: "14:00", cpu: 57, memory: 64, traffic: 210 },
      { time: "15:00", cpu: 46, memory: 63, traffic: 198 }
    ],
  },
  logs: {
    deployment: [
      "[15:05:02] Pulling ghcr.io/team/devops-dashboard:1.4.2",
      "[15:05:18] Container api-green passed readiness check",
      "[15:05:40] Switching production traffic to api-green",
      "[15:06:02] Deployment completed in 60s"
    ],
    errorLogs: [
      "[14:22:11] Warning: worker queue latency exceeded 200ms",
      "[13:11:37] Retry succeeded after registry timeout",
      "[11:49:08] Alert: memory usage touched 70% on node-02"
    ],
  },
  alerts: [
    {
      severity: "critical",
      message: "Rollback recommended if latency stays above 180ms for 5 minutes.",
      createdAt: new Date("2026-04-16T09:30:00.000Z"),
    },
    {
      severity: "info",
      message: "Pipeline green for the last 6 deployments.",
      createdAt: new Date("2026-04-16T08:50:00.000Z"),
    }
  ],
  controlPanel: {
    currentVersion: "v1.4.2",
    previousVersion: "v1.4.1",
    lastDeploymentAt: new Date("2026-04-16T09:06:00.000Z"),
    nextRecommendation: "Scale worker replicas before tonight's traffic peak.",
  },
};
