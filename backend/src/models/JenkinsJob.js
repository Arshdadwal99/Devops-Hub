import mongoose from "mongoose";

const jenkinsJobSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    jobId: {
      type: String,
      required: true,
      index: true,
    },
    jobName: {
      type: String,
      required: true,
    },
    jobUrl: String,
    status: {
      type: String,
      enum: ["active", "deleted", "failed"],
      default: "active",
    },
    repository: {
      owner: String,
      name: String,
      url: String,
      branch: {
        type: String,
        default: "main",
      },
      jenkinsfilePath: {
        type: String,
        default: "Jenkinsfile",
      },
    },
    jenkins: {
      url: String,
      username: String,
    },
    configXml: String,
    autoDeployEnabled: {
      type: Boolean,
      default: false,
    },
    autoDeployUpdatedAt: Date,
    createdInJenkinsAt: Date,
    deletedFromJenkinsAt: Date,
    lastRecreatedAt: Date,
  },
  { timestamps: true }
);

jenkinsJobSchema.index(
  {
    userId: 1,
    "jenkins.url": 1,
    "repository.url": 1,
    "repository.branch": 1,
    "repository.jenkinsfilePath": 1,
  },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  }
);

export const JenkinsJob = mongoose.model("JenkinsJob", jenkinsJobSchema);
