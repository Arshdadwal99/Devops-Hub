import dotenv from "dotenv";

dotenv.config();

export const config = {
  // Server
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Database
  mongoUri:
    process.env.MONGODB_URI ||
    process.env.MONGO_URI ||
    "mongodb://localhost:27017/devops-dashboard",

  // CORS
  clientOrigin: process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(",").map(o => o.trim())
    : [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        "http://localhost:3001",
      ],

  // JWT
  jwtSecret: process.env.JWT_SECRET || "your-secret-key-change-in-production",

  // Firebase
  firebaseAdminKey: process.env.FIREBASE_ADMIN_KEY || null,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || null,

  // Jenkins
  jenkinsUrl: process.env.JENKINS_URL || "http://localhost:8080",
  jenkinsUsername: process.env.JENKINS_USER || process.env.JENKINS_USERNAME || "admin",
  jenkinsToken: process.env.JENKINS_TOKEN || "",
  jenkinsJobName: process.env.JENKINS_JOB_NAME || "devops-hub-deploy",

  // Docker
  dockerHost: process.env.DOCKER_HOST || "unix:///var/run/docker.sock",
  dockerVersion: process.env.DOCKER_VERSION || "1.24",

  // GitHub Webhook
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
  githubToken: process.env.GITHUB_TOKEN || "",

  // AWS
  awsRegion: process.env.AWS_REGION || "us-east-1",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  awsEc2InstanceId: process.env.AWS_EC2_INSTANCE_ID || "",
  awsEc2Host: process.env.AWS_EC2_HOST || "",
  awsEc2User: process.env.AWS_EC2_USER || "ubuntu",
  awsEc2KeyPath: process.env.AWS_EC2_KEY_PATH || "",

  // OpenAI (for AI log analysis)
  openaiApiKey: process.env.OPENAI_API_KEY || "",

  // Alert thresholds
  alertThresholds: {
    cpuHigh: parseInt(process.env.ALERT_CPU_HIGH) || 85,
    memoryHigh: parseInt(process.env.ALERT_MEMORY_HIGH) || 85,
    diskHigh: parseInt(process.env.ALERT_DISK_HIGH) || 90,
    latencyHigh: parseInt(process.env.ALERT_LATENCY_HIGH) || 500, // ms
  },

  // Features
  enableAiAnalysis: process.env.ENABLE_AI_ANALYSIS !== "false",
  enableWebhooks: process.env.ENABLE_WEBHOOKS !== "false",
  enableMetricsCollection: process.env.ENABLE_METRICS_COLLECTION !== "false",
};
