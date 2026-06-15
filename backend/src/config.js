import dotenv from "dotenv";

dotenv.config();

// Validate MongoDB URI
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!mongoUri) {
  console.warn("⚠️  [Config] MONGO_URI environment variable not set");
  console.warn("   Set MONGO_URI for MongoDB Atlas in production:");
  console.warn("   mongodb+srv://username:password@cluster.mongodb.net/dbname");
}

// Validate Jenkins configuration
const jenkinsUrl = process.env.JENKINS_URL || "http://localhost:8080";
const jenkinsToken = process.env.JENKINS_TOKEN;
const jenkinsUser = process.env.JENKINS_USER || process.env.JENKINS_USERNAME || "admin";

if (!jenkinsToken) {
  console.warn("⚠️  [Config] JENKINS_TOKEN environment variable not set");
  console.warn("   Set JENKINS_TOKEN for Jenkins authentication");
  console.warn("   Generate token at: http://jenkins.example.com/user/<username>/configure");
}

export const config = {
  // Server
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",

  // Database
  mongoUri: mongoUri || "mongodb://localhost:27017/devops-dashboard",
  
  // MongoDB connection retry settings
  mongoMaxRetries: 5,
  mongoRetryDelay: 3000, // 3 seconds

  // CORS
  clientOrigin: process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(",").map(o => o.trim())
    : [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5000",
      ],

  // JWT
  jwtSecret: process.env.JWT_SECRET || "your-secret-key-change-in-production",

  // Firebase
  firebaseAdminKey: process.env.FIREBASE_ADMIN_KEY || null,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID || null,

  // Jenkins - Enhanced configuration with validation
  jenkinsUrl: jenkinsUrl,
  jenkinsUsername: jenkinsUser,
  jenkinsToken: jenkinsToken || "",
  jenkinsJobName: process.env.JENKINS_JOB_NAME || "devops-hub-deploy",
  jenkinsAutoCreateJob: process.env.JENKINS_AUTO_CREATE_JOB !== "false",
  
  // Jenkins retry configuration
  jenkinsRetryMaxAttempts: 3,
  jenkinsRetryDelays: [1000, 3000, 5000],
  jenkinsTimeout: 10000,
  jenkinsCheckInterval: 30000,

  // Docker
  dockerHost: process.env.DOCKER_HOST || "unix:///var/run/docker.sock",
  dockerVersion: process.env.DOCKER_VERSION || "1.24",

  // Registry credential encryption
  registryEncryptionKey: process.env.REGISTRY_ENCRYPTION_KEY || process.env.JWT_SECRET || "your-secret-key-change-in-production",

  // GitHub Webhook & OAuth
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
  githubToken: process.env.GITHUB_TOKEN || "",
  githubClientId: process.env.GITHUB_CLIENT_ID || "",
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  backendUrl: process.env.BACKEND_URL || "http://localhost:5000",

  // Validate GitHub OAuth configuration
  ...(process.env.NODE_ENV === "production" && {
    githubOAuthConfigured: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
  }),

  // AWS
  awsRegion: process.env.AWS_REGION || "us-east-1",
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  awsEc2InstanceId: process.env.AWS_EC2_INSTANCE_ID || "",
  awsEc2Host: process.env.AWS_EC2_HOST || "",
  awsEc2User: process.env.AWS_EC2_USER || "ubuntu",
  awsEc2KeyName: process.env.AWS_EC2_KEY_NAME || "",
  awsEc2Port: process.env.AWS_EC2_PORT || 22,

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
  enableJenkinsMonitoring: process.env.ENABLE_JENKINS_MONITORING !== "false",
  enableDeploymentTracking: process.env.ENABLE_DEPLOYMENT_TRACKING !== "false",
};
