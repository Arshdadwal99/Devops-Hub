import crypto from "crypto";
import fetch from "node-fetch";
import jwt from "jsonwebtoken";

// Configuration
const BASE_URL = "http://localhost:5000";
const WEBHOOK_SECRET = "your-github-webhook-secret-key"; // From .env
const JWT_SECRET = "dev-secret-key-change-in-production"; // From .env

// Generate JWT token for authenticated requests
const token = jwt.sign({ userId: "test-user" }, JWT_SECRET, { expiresIn: "1h" });

console.log("🚀 GitHub Webhook System Test Suite\n");
console.log("=".repeat(70));

// Helper function to generate GitHub signature
function generateGitHubSignature(payload, secret) {
  return (
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex")
  );
}

// Test 1: Webhook with Push Event
async function testPushEvent() {
  console.log("\n1️⃣  TEST: GitHub Push Event Webhook");
  console.log("-".repeat(70));

  const payload = {
    repository: {
      name: "devops-dashboard",
      full_name: "dadwalarsh99/devops-dashboard",
      owner: { login: "dadwalarsh99" },
      html_url: "https://github.com/dadwalarsh99/devops-dashboard",
    },
    ref: "refs/heads/main",
    commits: [
      {
        id: "abc123def456",
        message: "Fix deployment issue in main branch",
        author: {
          name: "John Doe",
          email: "john@example.com",
          username: "johndoe",
        },
        timestamp: new Date().toISOString(),
      },
    ],
    pusher: {
      name: "johndoe",
      email: "john@example.com",
    },
    head_commit: {
      id: "abc123def456",
      message: "Fix deployment issue in main branch",
    },
  };

  const payloadString = JSON.stringify(payload);
  const signature = generateGitHubSignature(payloadString, WEBHOOK_SECRET);

  try {
    const response = await fetch(`${BASE_URL}/api/webhooks/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "push",
        "X-GitHub-Delivery": "12345-67890-push",
        "X-Hub-Signature-256": signature,
      },
      body: payloadString,
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));

    if (response.status === 200 && data.success) {
      console.log("✅ PASSED: Push event processed successfully");
      console.log(`   Build Number: ${data.buildNumber}`);
      console.log(`   Webhook ID: ${data.webhookId}`);
      return { passed: true, webhookId: data.webhookId };
    } else {
      console.log("❌ FAILED: Unexpected response");
      return { passed: false };
    }
  } catch (error) {
    console.error("❌ FAILED:", error.message);
    return { passed: false };
  }
}

// Test 2: Invalid Signature Test
async function testInvalidSignature() {
  console.log("\n2️⃣  TEST: Invalid GitHub Signature");
  console.log("-".repeat(70));

  const payload = {
    repository: {
      name: "test-repo",
      full_name: "test/test-repo",
      owner: { login: "test" },
      html_url: "https://github.com/test/test-repo",
    },
    ref: "refs/heads/main",
    commits: [
      {
        id: "xyz789",
        message: "Test commit",
        author: { name: "Test User" },
      },
    ],
  };

  const payloadString = JSON.stringify(payload);
  const invalidSignature = "sha256=invalidsignature123";

  try {
    const response = await fetch(`${BASE_URL}/api/webhooks/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "push",
        "X-GitHub-Delivery": "invalid-test",
        "X-Hub-Signature-256": invalidSignature,
      },
      body: payloadString,
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));

    if (response.status === 401 && !data.success) {
      console.log("✅ PASSED: Invalid signature correctly rejected");
      return { passed: true };
    } else {
      console.log("❌ FAILED: Invalid signature should be rejected");
      return { passed: false };
    }
  } catch (error) {
    console.error("❌ FAILED:", error.message);
    return { passed: false };
  }
}

// Test 3: Get Webhook History
async function testGetWebhookHistory() {
  console.log("\n3️⃣  TEST: Get Webhook History (Protected)");
  console.log("-".repeat(70));

  try {
    const response = await fetch(`${BASE_URL}/api/webhooks/history?limit=10`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log(`Total webhooks: ${data.total}`);
    console.log(`Returned: ${data.webhooks?.length || 0}`);

    if (response.status === 200 && data.webhooks) {
      console.log("✅ PASSED: Webhook history retrieved");
      console.log(`   Recent webhooks:`);
      data.webhooks.slice(0, 3).forEach((wh) => {
        console.log(`   - ${wh.event} from ${wh.repository.name} (${wh.status})`);
      });
      return { passed: true };
    } else {
      console.log("❌ FAILED: Could not retrieve webhook history");
      return { passed: false };
    }
  } catch (error) {
    console.error("❌ FAILED:", error.message);
    return { passed: false };
  }
}

// Test 4: Pull Request Event
async function testPullRequestEvent() {
  console.log("\n4️⃣  TEST: GitHub Pull Request Event");
  console.log("-".repeat(70));

  const payload = {
    action: "opened",
    pull_request: {
      number: 42,
      title: "Add webhook support",
      head: {
        ref: "feature/webhooks",
        sha: "pr123sha456",
      },
      user: {
        login: "jane_dev",
        name: "Jane Developer",
      },
      created_at: new Date().toISOString(),
      html_url: "https://github.com/test/repo/pull/42",
    },
    repository: {
      name: "devops-dashboard",
      full_name: "test/devops-dashboard",
      owner: { login: "test" },
      html_url: "https://github.com/test/devops-dashboard",
    },
  };

  const payloadString = JSON.stringify(payload);
  const signature = generateGitHubSignature(payloadString, WEBHOOK_SECRET);

  try {
    const response = await fetch(`${BASE_URL}/api/webhooks/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "pull_request",
        "X-GitHub-Delivery": "12345-67890-pr",
        "X-Hub-Signature-256": signature,
      },
      body: payloadString,
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));

    if (response.status === 200 && data.success) {
      console.log("✅ PASSED: Pull request event processed");
      return { passed: true };
    } else {
      console.log("❌ FAILED: PR event not processed correctly");
      return { passed: false };
    }
  } catch (error) {
    console.error("❌ FAILED:", error.message);
    return { passed: false };
  }
}

// Test 5: Release Event
async function testReleaseEvent() {
  console.log("\n5️⃣  TEST: GitHub Release Event");
  console.log("-".repeat(70));

  const payload = {
    action: "published",
    release: {
      tag_name: "v1.0.0",
      name: "Version 1.0.0",
      target_commitish: "rel123commit",
      author: { login: "release_bot" },
      published_at: new Date().toISOString(),
      html_url: "https://github.com/test/repo/releases/tag/v1.0.0",
    },
    repository: {
      name: "devops-dashboard",
      full_name: "test/devops-dashboard",
      owner: { login: "test" },
      html_url: "https://github.com/test/devops-dashboard",
    },
  };

  const payloadString = JSON.stringify(payload);
  const signature = generateGitHubSignature(payloadString, WEBHOOK_SECRET);

  try {
    const response = await fetch(`${BASE_URL}/api/webhooks/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GitHub-Event": "release",
        "X-GitHub-Delivery": "12345-67890-release",
        "X-Hub-Signature-256": signature,
      },
      body: payloadString,
    });

    const data = await response.json();
    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));

    if (response.status === 200 && data.success) {
      console.log("✅ PASSED: Release event processed");
      return { passed: true };
    } else {
      console.log("❌ FAILED: Release event not processed");
      return { passed: false };
    }
  } catch (error) {
    console.error("❌ FAILED:", error.message);
    return { passed: false };
  }
}

// Test 6: Webhook Health Check
async function testWebhookHealth() {
  console.log("\n6️⃣  TEST: Webhook Health Check");
  console.log("-".repeat(70));

  try {
    const response = await fetch(`${BASE_URL}/api/webhooks/health`);
    const data = await response.json();

    console.log(`Status: ${response.status}`);
    console.log("Response:", JSON.stringify(data, null, 2));

    if (response.status === 200 && data.status === "ok") {
      console.log("✅ PASSED: Webhook service is healthy");
      return { passed: true };
    } else {
      console.log("❌ FAILED: Webhook health check failed");
      return { passed: false };
    }
  } catch (error) {
    console.error("❌ FAILED:", error.message);
    return { passed: false };
  }
}

// Run all tests
async function runAllTests() {
  console.log("\nStarting webhook tests...");
  console.log("Note: Ensure backend is running on http://localhost:5000\n");

  const results = [
    await testWebhookHealth(),
    await testPushEvent(),
    await testInvalidSignature(),
    await testPullRequestEvent(),
    await testReleaseEvent(),
    await testGetWebhookHistory(),
  ];

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(70));

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log(`✅ Passed: ${passed}/${total}`);
  console.log(`❌ Failed: ${total - passed}/${total}`);

  if (passed === total) {
    console.log("\n🎉 All tests passed!");
  } else {
    console.log("\n⚠️  Some tests failed. Check logs above.");
  }

  console.log("\n" + "=".repeat(70));
}

// Run tests
runAllTests().catch(console.error);
