import mongoose from "mongoose";

const awsInfrastructureSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    awsConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AWSConnection",
      required: true,
    },

    // EC2 Instance Information
    instanceId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    instanceType: {
      type: String,
      required: true,
      enum: ["t3.micro", "t3.small"],
    },
    operatingSystem: {
      type: String,
      required: true,
      enum: ["ubuntu", "amazon-linux"],
    },
    storageSize: {
      type: Number,
      required: true,
      default: 30,
      min: 20,
      max: 100,
    },

    // AWS Details
    region: {
      type: String,
      required: true,
      index: true,
    },
    securityGroupId: {
      type: String,
      required: true,
    },
    securityGroupName: String,
    vpcId: String,
    subnetId: String,

    // Network Information
    publicIp: String,
    publicDns: String,
    privateIp: String,
    elasticIp: String,
    elasticIpAllocationId: String,

    // Status Fields
    deploymentStatus: {
      type: String,
      enum: ["provisioning", "bootstrapping", "ready", "deployed", "updating", "error", "terminated"],
      default: "provisioning",
      index: true,
    },
    bootstrapStatus: {
      type: String,
      enum: ["pending", "in-progress", "success", "failed"],
      default: "pending",
    },
    ec2Status: {
      type: String,
      enum: ["pending", "running", "shutting-down", "terminated", "stopping", "stopped"],
      default: "pending",
    },

    // Bootstrap Information
    bootstrapLog: String,
    bootstrapStartTime: Date,
    bootstrapEndTime: Date,

    // Deployment Information
    deployment: {
      applicationName: String,
      applicationVersion: String,
      dockerImage: String,
      containerPorts: [Number],
      lastDeploymentTime: Date,
      lastDeploymentStatus: String,
    },

    // Monitoring & Metrics
    monitoring: {
      enabled: { type: Boolean, default: true },
      cpuUtilization: Number,
      memoryUtilization: Number,
      diskUtilization: Number,
      networkIn: Number,
      networkOut: Number,
      lastMetricsUpdate: Date,
    },

    // Tags and Metadata
    tags: {
      type: Map,
      of: String,
    },
    labels: [String],
    description: String,

    // Lifecycle
    createdBy: String,
    createdFromTemplate: String,
    autoShutdownEnabled: Boolean,
    autoShutdownTime: String, // HH:MM format
    terminationTime: Date,

    // Cost tracking
    estimatedMonthlyCost: Number,
    actualCost: Number,
    costLastUpdated: Date,

    // Backup and Snapshots
    snapshots: [
      {
        snapshotId: String,
        createTime: Date,
        size: Number,
        status: String,
      },
    ],

    // Related Deployments
    relatedDeployments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Deployment",
      },
    ],

    // SSH Key Information
    keyPairName: String,
    keyPairId: String,
    privateKey: String, // Stored private key material for SSH operations
    keyGeneratedAt: Date, // Timestamp when key was generated

    // Performance and Health
    health: {
      status: { type: String, enum: ["healthy", "degraded", "unhealthy"], default: "healthy" },
      lastCheckTime: Date,
      checks: [
        {
          name: String,
          status: String,
          lastUpdate: Date,
        },
      ],
    },

    // Jenkins Integration
    jenkinsAgentConfigured: Boolean,
    jenkinsAgentName: String,
    jenkinsIntegrationStatus: String,

    // Error tracking
    lastError: String,
    lastErrorAt: Date,
    errorHistory: [
      {
        error: String,
        timestamp: Date,
        resolution: String,
      },
    ],

    // Audit Trail
    auditLog: [
      {
        action: String,
        actor: String,
        timestamp: Date,
        details: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
awsInfrastructureSchema.index({ userId: 1, region: 1 });
awsInfrastructureSchema.index({ userId: 1, deploymentStatus: 1 });
awsInfrastructureSchema.index({ instanceId: 1 });
awsInfrastructureSchema.index({ createdAt: -1 });

// Methods
awsInfrastructureSchema.methods.updateDeploymentStatus = function (status, details = {}) {
  this.deploymentStatus = status;
  this.auditLog.push({
    action: "statusUpdate",
    actor: "system",
    timestamp: new Date(),
    details: `Status changed to ${status}: ${JSON.stringify(details)}`,
  });
};

awsInfrastructureSchema.methods.logError = function (error, resolution = null) {
  this.lastError = error;
  this.lastErrorAt = new Date();
  this.errorHistory.push({
    error,
    timestamp: new Date(),
    resolution,
  });
  if (this.errorHistory.length > 20) {
    this.errorHistory.shift(); // Keep only last 20 errors
  }
};

awsInfrastructureSchema.methods.isReady = function () {
  return (
    this.deploymentStatus === "ready" &&
    this.ec2Status === "running" &&
    this.bootstrapStatus === "success"
  );
};

awsInfrastructureSchema.methods.isHealthy = function () {
  return this.health?.status === "healthy" && this.isReady();
};

export const AWSInfrastructure = mongoose.model("AWSInfrastructure", awsInfrastructureSchema);
