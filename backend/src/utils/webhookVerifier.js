import crypto from "crypto";

const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

/**
 * Verify GitHub webhook signature
 */
export const verifyGitHubSignature = (payload, signature) => {
  if (!GITHUB_WEBHOOK_SECRET) {
    console.warn("GitHub webhook secret is not configured");
    return false;
  }

  if (!signature) {
    console.warn("⚠️  No GitHub signature provided");
    return false;
  }

  try {
    // GitHub sends signature as: sha256=hash
    const [algorithm, hash] = signature.split("=");

    if (algorithm !== "sha256") {
      console.warn(`⚠️  Invalid signature algorithm: ${algorithm}`);
      return false;
    }

    // Calculate HMAC
    const hmac = crypto
      .createHmac("sha256", GITHUB_WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");

    // Compare signatures using timing-safe comparison
    const isValid = crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hmac));

    if (isValid) {
      console.log("✅ GitHub webhook signature verified");
    } else {
      console.warn("⚠️  GitHub webhook signature invalid");
    }

    return isValid;
  } catch (error) {
    console.error("❌ Error verifying signature:", error.message);
    return false;
  }
};

/**
 * Extract data from GitHub push event
 */
export const extractGitHubPushData = (payload) => {
  try {
    const repository = payload.repository;
    const commits = payload.commits || [];
    const latestCommit = commits[commits.length - 1] || {};
    const pusher = payload.pusher || {};
    const ref = payload.ref || "";
    const branch = ref.replace("refs/heads/", "");

    return {
      event: "push",
      repository: {
        name: repository.name,
        owner: repository.owner.name || repository.owner.login,
        fullName: repository.full_name,
        url: repository.html_url,
        cloneUrl: repository.clone_url || `${repository.html_url}.git`,
      },
      commit: {
        sha: latestCommit.id || payload.head_commit?.id,
        message: latestCommit.message || payload.head_commit?.message,
        author: {
          name: latestCommit.author?.name || payload.head_commit?.author?.name,
          email: latestCommit.author?.email || payload.head_commit?.author?.email,
          username: latestCommit.author?.username,
        },
        timestamp: latestCommit.timestamp || payload.head_commit?.timestamp,
        url: latestCommit.url || payload.head_commit?.url,
      },
      branch,
      pusher: {
        name: pusher.name || payload.sender?.login,
        email: pusher.email,
      },
      commitCount: commits.length,
    };
  } catch (error) {
    console.error("❌ Error extracting GitHub data:", error.message);
    throw new Error("Failed to extract GitHub push data");
  }
};

/**
 * Extract data from GitHub pull request event
 */
export const extractGitHubPullRequestData = (payload) => {
  try {
    const pr = payload.pull_request;
    const repository = payload.repository;

    return {
      event: "pull_request",
      repository: {
        name: repository.name,
        owner: repository.owner.name || repository.owner.login,
        fullName: repository.full_name,
        url: repository.html_url,
        cloneUrl: repository.clone_url || `${repository.html_url}.git`,
      },
      commit: {
        sha: pr.head.sha,
        message: pr.title,
        author: {
          name: pr.user.name || pr.user.login,
          email: pr.user.email,
          username: pr.user.login,
        },
        timestamp: pr.created_at,
        url: pr.html_url,
      },
      branch: pr.head.ref,
      action: payload.action,
      prNumber: pr.number,
    };
  } catch (error) {
    console.error("❌ Error extracting GitHub PR data:", error.message);
    throw new Error("Failed to extract GitHub PR data");
  }
};

/**
 * Extract data from GitHub release event
 */
export const extractGitHubReleaseData = (payload) => {
  try {
    const release = payload.release;
    const repository = payload.repository;

    return {
      event: "release",
      repository: {
        name: repository.name,
        owner: repository.owner.name || repository.owner.login,
        fullName: repository.full_name,
        url: repository.html_url,
        cloneUrl: repository.clone_url || `${repository.html_url}.git`,
      },
      commit: {
        sha: release.target_commitish,
        message: release.name || release.tag_name,
        author: {
          name: release.author.name || release.author.login,
          username: release.author.login,
        },
        timestamp: release.published_at,
        url: release.html_url,
      },
      version: release.tag_name,
      action: payload.action,
    };
  } catch (error) {
    console.error("❌ Error extracting GitHub release data:", error.message);
    throw new Error("Failed to extract GitHub release data");
  }
};
