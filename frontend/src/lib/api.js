const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function getAuthToken() {
  return localStorage.getItem("authToken");
}

async function request(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Clear auth token if unauthorized
      localStorage.removeItem("authToken");
      window.location.href = "/login";
    }
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

// Export request as api for generic use
export const api = request;

// Auth endpoints
export function signup(email, password, name) {
  return request("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
}

export function login(email, password) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function googleAuth(googleToken) {
  return request("/auth/google", {
    method: "POST",
    body: JSON.stringify({ token: googleToken }),
  });
}

export function getCurrentUser() {
  return request("/auth/me");
}

export function logout() {
  localStorage.removeItem("authToken");
}

// Dashboard endpoints
export function getDashboard() {
  return request("/dashboard");
}

export function deployRelease() {
  return request("/deploy", { method: "POST" });
}

export function rollbackRelease() {
  return request("/rollback", { method: "POST" });
}

export function restartServices() {
  return request("/restart", { method: "POST" });
}
