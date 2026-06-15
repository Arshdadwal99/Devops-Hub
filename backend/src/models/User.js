import mongoose from "mongoose";
import bcryptjs from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      default: null,
    },
    googleId: {
      type: String,
      default: null,
    },
    firebaseUid: {
      type: String,
      default: null,
    },
    profilePicture: {
      type: String,
      default: null,
    },
    authProvider: {
      type: String,
      enum: ["local", "google", "firebase"],
      required: true,
    },
    // GitHub Integration Fields (Separate from authentication)
    githubConnected: {
      type: Boolean,
      default: false,
    },
    githubUsername: {
      type: String,
      default: null,
    },
    githubAvatar: {
      type: String,
      default: null,
    },
    githubAccessToken: {
      type: String,
      default: null,
      select: false, // Don't include by default in queries
    },
    githubConnectedAt: {
      type: Date,
      default: null,
    },
    dockerHub: {
      connected: {
        type: Boolean,
        default: false,
      },
      username: {
        type: String,
        default: null,
      },
      encryptedAccessToken: {
        type: String,
        default: null,
        select: false,
      },
      tokenIv: {
        type: String,
        default: null,
        select: false,
      },
      tokenAuthTag: {
        type: String,
        default: null,
        select: false,
      },
      connectedAt: {
        type: Date,
        default: null,
      },
      lastValidatedAt: {
        type: Date,
        default: null,
      },
      permissions: {
        login: { type: Boolean, default: false },
        push: { type: Boolean, default: false },
      },
    },
    ec2: {
      connected: {
        type: Boolean,
        default: false,
      },
      host: {
        type: String,
        default: null,
      },
      username: {
        type: String,
        default: null,
      },
      encryptedPrivateKey: {
        type: String,
        default: null,
        select: false,
      },
      keyIv: {
        type: String,
        default: null,
        select: false,
      },
      keyAuthTag: {
        type: String,
        default: null,
        select: false,
      },
      connectedAt: {
        type: Date,
        default: null,
      },
      lastValidatedAt: {
        type: Date,
        default: null,
      },
      serverInfo: {
        os: String,
        cpu: String,
        ram: String,
        dockerVersion: String,
        diskUsage: String,
        memoryAvailableMb: Number,
        diskAvailableGb: Number,
      },
      validation: {
        ssh: { type: Boolean, default: false },
        dockerInstalled: { type: Boolean, default: false },
        dockerRunning: { type: Boolean, default: false },
        diskSpace: { type: Boolean, default: false },
        memory: { type: Boolean, default: false },
        portAvailable: { type: Boolean, default: false },
      },
      validationErrors: [String],
    },
    jenkins: {
      connected: {
        type: Boolean,
        default: false,
      },
      url: {
        type: String,
        default: null,
      },
      username: {
        type: String,
        default: null,
      },
      encryptedApiToken: {
        type: String,
        default: null,
        select: false,
      },
      tokenIv: {
        type: String,
        default: null,
        select: false,
      },
      tokenAuthTag: {
        type: String,
        default: null,
        select: false,
      },
      connectedAt: {
        type: Date,
        default: null,
      },
      lastValidatedAt: {
        type: Date,
        default: null,
      },
      version: {
        type: String,
        default: null,
      },
      connectedUser: {
        type: String,
        default: null,
      },
      permissions: {
        reachable: { type: Boolean, default: false },
        authenticated: { type: Boolean, default: false },
        read: { type: Boolean, default: false },
        jobRead: { type: Boolean, default: false },
        nodeRead: { type: Boolean, default: false },
      },
      jobs: [
        {
          name: String,
          url: String,
          color: String,
        },
      ],
      nodes: [
        {
          name: String,
          displayName: String,
          offline: Boolean,
          executors: Number,
        },
      ],
      validationErrors: [String],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }
  try {
    const salt = await bcryptjs.genSalt(10);
    this.password = await bcryptjs.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (passwordAttempt) {
  try {
    return await bcryptjs.compare(passwordAttempt, this.password);
  } catch (error) {
    throw error;
  }
};

// Remove password from JSON response
userSchema.methods.toJSON = function () {
  const { password, ...user } = this.toObject();
  return user;
};

export const User = mongoose.model("User", userSchema);
