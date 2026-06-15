import axios from "axios";
import { signOut } from "firebase/auth";
import { auth } from "./firebaseConfig";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const API_TIMEOUT = 10000; // 10 second timeout
const API_TARGET = API_BASE.startsWith("http") ? API_BASE : `${window.location.origin}${API_BASE}`;

// Create axios instance with default config
export const axiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: API_TIMEOUT,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - add auth token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("authToken");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    console.log(`[API] ${config.method?.toUpperCase() || "GET"} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const isExpiredFirebaseSession = error.response?.status === 401
      && error.response?.data?.message === "Session expired. Please sign in again.";

    if (isExpiredFirebaseSession) {
      signOut(auth).catch((signOutError) => {
        console.warn("Firebase sign-out after expired session failed:", signOutError.message);
      });
      localStorage.removeItem("firebaseToken");
      localStorage.removeItem("token");
      localStorage.removeItem("authToken");
      sessionStorage.setItem("authError", "Your Google session expired. Please sign in again.");
      window.location.href = "/login";
    }

    if (error.response?.status === 401) {
      // Clear auth token if unauthorized
      localStorage.removeItem("authToken");
      if (!isExpiredFirebaseSession) {
        window.location.href = "/login";
      }
    }

    // Format error message
    const errorMessage = error.response?.data?.error ||
                         error.response?.data?.message || 
                         error.message || 
                         "An error occurred";

    // Log error for debugging
    console.error("[API Error]", {
      status: error.response?.status,
      message: errorMessage,
      url: error.config?.url,
      data: error.response?.data,
    });

    // Create custom error
    const customError = new Error(
      error.code === "ECONNABORTED"
        ? `Request timeout: Server took too long to respond at ${API_TARGET}.`
        : error.code === "ERR_NETWORK"
        ? `Cannot connect to server at ${API_TARGET}. Make sure:\n1. Backend is running: npm run dev:backend\n2. The Vite dev server was restarted after env changes\n3. No firewall is blocking the connection`
        : errorMessage
    );
    customError.status = error.response?.status;
    customError.data = error.response?.data;

    return Promise.reject(customError);
  }
);

// Generic request function for backward compatibility
export const api = async (path, options = {}) => {
  const config = {
    method: options.method || "GET",
    url: path,
    ...options,
  };
  if (options.body) {
    config.data = JSON.parse(options.body);
    delete config.body;
  }
  const response = await axiosInstance(config);
  return response.data;
};

// Auth endpoints
export function signup(email, password, name) {
  return api("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export function login(email, password) {
  return api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function googleAuth(idToken) {
  return api("/auth/google", {
    method: "POST",
    body: JSON.stringify({ idToken }),
  });
}

export function firebaseAuth(firebaseToken, name = null) {
  return api("/auth/firebase", {
    method: "POST",
    body: JSON.stringify({ firebaseToken, name }),
  });
}

export function getCurrentUser() {
  return api("/auth/me");
}

export function logout() {
  localStorage.removeItem("authToken");
}

// Dashboard endpoints
export function getDashboard() {
  return api("/dashboard");
}

export async function deployGitHubRepository(payload) {
  const response = await axiosInstance.post("/deployments/from-github", payload, {
    timeout: 10 * 60 * 1000,
  });
  return response.data;
}

export async function prepareDeploymentWorkspace(payload) {
  const response = await axiosInstance.post("/deployments/prepare", payload, {
    timeout: 2 * 60 * 1000,
  });
  return response.data;
}

export function getDeploymentWorkflow(deploymentId) {
  return api(`/deployments/builds/workflow/${deploymentId}`);
}

export function updateDeploymentSetup(deploymentId, payload) {
  return api(`/deployments/setup/${deploymentId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function recalculateWorkflowState(deploymentId) {
  return api("/workflow/recalculate", {
    method: "POST",
    body: JSON.stringify({ deploymentId }),
  });
}

export function getAutoDeployStatus(params = {}) {
  const query = new URLSearchParams(params).toString();
  return api(`/deployments/auto-deploy/status${query ? `?${query}` : ""}`);
}

export function enableAutoDeploy(payload = {}) {
  return api("/deployments/auto-deploy/enable", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function disableAutoDeploy(payload = {}) {
  return api("/deployments/auto-deploy/disable", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getAutoDeployLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  return api(`/deployments/auto-deploy/logs${query ? `?${query}` : ""}`);
}

export function rollbackRelease() {
  return api("/deployments/rollback", { method: "POST" });
}

export function restartServices() {
  return api("/deployments/restart", { method: "POST" });
}

// Metrics endpoint
export function getMetrics() {
  return api("/metrics");
}

export function getDockerContainers() {
  return api("/docker/containers");
}

export function getDockerStatus() {
  return api("/docker/status");
}

// Alerts endpoint
export function getAlerts() {
  return api("/alerts");
}

export function resolveAlert(alertId, action = "dismissed") {
  return api(`/alerts/${alertId}/resolve`, {
    method: "PUT",
    body: JSON.stringify({ action }),
  });
}

export function deleteAlert(alertId) {
  return api(`/alerts/${alertId}`, { method: "DELETE" });
}

// Logs endpoint
export function getLogs() {
  return api("/logs");
}

// Pipeline endpoint
export function getPipeline() {
  return api("/pipeline");
}

// Log analysis endpoint
export function analyzeLogs(logs, pipelineId = "default") {
  return api("/analyze", {
    method: "POST",
    body: JSON.stringify({ logs, pipelineId }),
  });
}

// GitHub Integration endpoints
export function getGitHubConnectUrl() {
  return api("/github/connect");
}

export function handleGitHubCallback(code) {
  return api(`/github/callback?code=${code}`);
}

export function getGitHubStatus() {
  return api("/github/status");
}

export function getGitHubRepositories() {
  return api("/github/repos");
}

export function disconnectGitHub() {
  return api("/github/disconnect", { method: "POST" });
}

export function createGitHubWebhook(payload) {
  return api("/github/webhook/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getGitHubWebhookStatus(owner, repo, testDelivery = false) {
  const params = new URLSearchParams();
  if (owner && repo) {
    params.set("owner", owner);
    params.set("repo", repo);
  }
  if (testDelivery) {
    params.set("testDelivery", "true");
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return api(`/github/webhook/status${query}`);
}

export function deleteGitHubWebhook(payload = {}) {
  return api("/github/webhook", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

// Repository Analysis endpoints
export function analyzeRepository(owner, repo) {
  return api("/repositories/analyze", {
    method: "POST",
    body: JSON.stringify({ owner, repo }),
  });
}

export function generateConfiguration(owner, repo, analysis) {
  return api("/repositories/generate-config", {
    method: "POST",
    body: JSON.stringify({ owner, repo, analysis }),
  });
}

export function previewCicdPipeline(owner, repo, branch = "main") {
  return api("/cicd/preview", {
    method: "POST",
    body: JSON.stringify({ owner, repo, branch }),
  });
}

export function generateCicdPipeline(owner, repo, branch = "main", workflow) {
  return api("/cicd/generate", {
    method: "POST",
    body: JSON.stringify({ owner, repo, branch, workflow }),
  });
}

export function getCicdPipelineStatus() {
  return api("/cicd/status");
}

// Docker Hub registry integration endpoints
export function connectDockerHub(username, accessToken) {
  return api("/registry/dockerhub/connect", {
    method: "POST",
    body: JSON.stringify({ username, accessToken }),
  });
}

export function getDockerHubRegistryStatus() {
  return api("/registry/dockerhub/status");
}

export function disconnectDockerHubRegistry() {
  return api("/registry/dockerhub/disconnect", { method: "POST" });
}

// Jenkins connection management endpoints
export function connectJenkins(url, username, apiToken) {
  return api("/jenkins/connect", {
    method: "POST",
    body: JSON.stringify({ url, username, apiToken }),
  });
}

export function getJenkinsConnectionStatus() {
  return api("/jenkins/status");
}

export function disconnectJenkins() {
  return api("/jenkins/disconnect", { method: "POST" });
}

export function testJenkinsConnection(payload = {}) {
  return api("/jenkins/test", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function previewJenkinsPipeline(owner, repo, branch = "main", options = {}) {
  return api("/jenkins/pipeline/preview", {
    method: "POST",
    body: JSON.stringify({ owner, repo, branch, ...options }),
  });
}

export function generateJenkinsPipeline(owner, repo, branch = "main", jenkinsfile, options = {}) {
  return api("/jenkins/pipeline/generate", {
    method: "POST",
    body: JSON.stringify({ owner, repo, branch, jenkinsfile, ...options }),
  });
}

export function createJenkinsJob(payload) {
  return api("/jenkins/jobs/create", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getJenkinsJobs() {
  return api("/jenkins/jobs");
}

export function getJenkinsJob(id) {
  return api(`/jenkins/jobs/${id}`);
}

export function deleteJenkinsJob(id) {
  return api(`/jenkins/jobs/${id}`, { method: "DELETE" });
}

export function recreateJenkinsJob(id) {
  return api(`/jenkins/jobs/${id}/recreate`, { method: "POST" });
}

// Pipeline image history endpoints
export function getImageHistory(limit = 50) {
  return api(`/deployments/images/history?limit=${limit}`);
}

export function getImageDetails(imageId) {
  return api(`/deployments/images/${imageId}`);
}

// AWS Infrastructure Management
export function connectAWS(accessKeyId, secretAccessKey, region, connectionName) {
  return api("/aws/connect", {
    method: "POST",
    body: JSON.stringify({ accessKeyId, secretAccessKey, region, connectionName }),
  });
}

export function getAWSConnections() {
  return api("/aws/connections");
}

export function getAWSConnection(connectionId) {
  return api(`/aws/connections/${connectionId}`);
}

export function disconnectAWS(connectionId) {
  return api(`/aws/connections/${connectionId}`, { method: "DELETE" });
}

export function createInfrastructure(connectionId, config) {
  return api("/aws/infrastructure/create", {
    method: "POST",
    body: JSON.stringify({ connectionId, ...config }),
  });
}

export function getProvisioningStatus(jobId) {
  return api(`/aws/infrastructure/provisioning-status/${jobId}`);
}

export function getProvisioningDebug(jobId) {
  return api(`/aws/jobs/${jobId}/debug`);
}

export function getAWSInstances(params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ).toString();
  return api(`/aws/instances${query ? `?${query}` : ""}`);
}

export function getAWSInstance(instanceId) {
  return api(`/aws/instances/${instanceId}`);
}

export function startAWSInstance(instanceId) {
  return api(`/aws/instances/${instanceId}/start`, { method: "POST" });
}

export function stopAWSInstance(instanceId) {
  return api(`/aws/instances/${instanceId}/stop`, { method: "POST" });
}

export function restartAWSInstance(instanceId) {
  return api(`/aws/instances/${instanceId}/restart`, { method: "POST" });
}

export function terminateAWSInstance(instanceId) {
  return api(`/aws/instances/${instanceId}`, { method: "DELETE" });
}

export function getInfrastructure(region = null) {
  const query = region ? `?region=${region}` : "";
  return api(`/aws/infrastructure${query}`);
}

export function getInfrastructureDetails(infrastructureId) {
  return api(`/aws/infrastructure/${infrastructureId}`);
}

export function getInfrastructureDashboard(infrastructureId) {
  return api(`/aws/infrastructure/${infrastructureId}/dashboard`);
}

export function terminateInfrastructure(infrastructureId, confirmTermination = false) {
  return api(`/aws/infrastructure/${infrastructureId}/terminate`, {
    method: "POST",
    body: JSON.stringify({ confirmTermination }),
  });
}

export function updateInfrastructureStatus(infrastructureId, updates) {
  return api(`/aws/infrastructure/${infrastructureId}/status`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export function getInstanceTypes() {
  return api("/aws/instance-types");
}

// One-Click Deployment Endpoints
export function validateOneClickDeploy(payload) {
  const body = typeof payload === "string" ? { repositoryUrl: payload } : payload;
  return api("/deployment/one-click-validate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function startOneClickDeploy(payload) {
  const response = await axiosInstance.post("/deployment/one-click-deploy", payload, {
    timeout: 30 * 60 * 1000, // 30 minute timeout for long deployment
  });
  return response.data;
}

export function getDeploymentProgress(deploymentId) {
  return api(`/deployment/${deploymentId}/progress`);
}

export function getDeploymentDetails(deploymentId) {
  return api(`/deployment/${deploymentId}`);
}

export function enableOneClickAutoDeploy(deploymentId) {
  return api(`/deployment/${deploymentId}/auto-deploy/enable`, {
    method: "POST",
  });
}

export function disableOneClickAutoDeploy(deploymentId) {
  return api(`/deployment/${deploymentId}/auto-deploy/disable`, {
    method: "POST",
  });
}
