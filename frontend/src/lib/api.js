import axios from "axios";

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
    if (error.response?.status === 401) {
      // Clear auth token if unauthorized
      localStorage.removeItem("authToken");
      window.location.href = "/login";
    }

    // Format error message
    const errorMessage = error.response?.data?.message || 
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

export function googleAuth(googleToken) {
  return api("/auth/google", {
    method: "POST",
    body: JSON.stringify({ token: googleToken }),
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

export function deployRelease() {
  return api("/deployments/deploy", { method: "POST" });
}

export async function deployGitHubRepository(payload) {
  const response = await axiosInstance.post("/deployments/from-github", payload, {
    timeout: 10 * 60 * 1000,
  });
  return response.data;
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
