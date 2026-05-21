import jwt from "jsonwebtoken";
import fetch from "node-fetch";

const BASE_URL = "http://localhost:5000/api/jenkins";
const JWT_SECRET = "dev-secret-key-change-in-production";

// Generate a test JWT token
const token = jwt.sign({ userId: "test-user" }, JWT_SECRET, { expiresIn: "1h" });

console.log("🔐 Generated Test Token:", token);
console.log("\n" + "=".repeat(60) + "\n");

// Test 1: Get Build Stages (no auth needed)
console.log("1️⃣  TESTING: Get Build Stages for Build #14");
console.log("-".repeat(60));
try {
  const response = await fetch(`${BASE_URL}/builds/14/stages`);
  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));
} catch (error) {
  console.error("❌ Error:", error.message);
}

console.log("\n" + "=".repeat(60) + "\n");

// Test 1.5: Get Build Status (no auth needed)
console.log("1.5️⃣  TESTING: Get Build Status for Build #14");
console.log("-".repeat(60));
try {
  const response = await fetch(`${BASE_URL}/builds/14/status`);
  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));
} catch (error) {
  console.error("❌ Error:", error.message);
}

console.log("\n" + "=".repeat(60) + "\n");

// Test 2: Get Build Logs (requires auth)
console.log("2️⃣  TESTING: Get Build Logs for Build #14");
console.log("-".repeat(60));
try {
  const response = await fetch(`${BASE_URL}/builds/14/logs`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await response.json();
  console.log("Status:", response.status);
  if (response.status === 200) {
    const logContent = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    console.log("Response:", logContent.substring(0, 500) + (logContent.length > 500 ? "..." : ""));
  } else {
    console.log("Response:", JSON.stringify(data, null, 2));
  }
} catch (error) {
  console.error("❌ Error:", error.message);
}

console.log("\n" + "=".repeat(60) + "\n");

// Test 3: Trigger a New Build (requires auth)
console.log("3️⃣  TESTING: Trigger New Build");
console.log("-".repeat(60));
try {
  const buildPayload = {
    repository: { name: "devops-dashboard" },
    commit: {
      sha: "test-commit-123",
      message: "Test build from API",
      author: { name: "API Tester" },
    },
    branch: "main",
    environment: "development",
  };

  const response = await fetch(`${BASE_URL}/trigger`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(buildPayload),
  });

  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Response:", JSON.stringify(data, null, 2));
} catch (error) {
  console.error("❌ Error:", error.message);
}

console.log("\n" + "=".repeat(60) + "\n");
