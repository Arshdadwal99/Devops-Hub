import { io } from "socket.io-client";

const apiUrl = import.meta.env.VITE_API_URL || "/api";
const SOCKET_URL = apiUrl.startsWith("http")
  ? apiUrl.replace(/\/api\/?$/, "")
  : window.location.origin;

let socket = null;

function getAuthToken() {
  return localStorage.getItem("authToken");
}

export function initSocket() {
  if (socket) return socket;

  const token = getAuthToken();
  if (!token) {
    console.warn("No auth token available for Socket.io connection");
    return null;
  }

  socket = io(SOCKET_URL, {
    auth: {
      token,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on("connect", () => {
    console.log("✅ Socket.io connected:", socket.id);
  });

  socket.on("disconnect", () => {
    console.log("❌ Socket.io disconnected");
  });

  socket.on("error", (error) => {
    console.error("Socket.io error:", error);
  });

  return socket;
}

export function getSocket() {
  return socket;
}

export function subscribeToMetrics(callback) {
  const socket = initSocket();
  if (!socket) return;

  socket.emit("subscribe:metrics");
  socket.on("metrics:update", callback);

  return () => {
    socket.off("metrics:update", callback);
  };
}

export function subscribeToAlerts(callback) {
  const socket = initSocket();
  if (!socket) return;

  socket.emit("subscribe:alerts");
  socket.on("alert:new", callback);
  socket.on("alerts:new", callback);

  return () => {
    socket.off("alert:new", callback);
    socket.off("alerts:new", callback);
  };
}

export function subscribeToPipeline(callback) {
  const socket = initSocket();
  if (!socket) return;

  socket.emit("subscribe:pipeline");
  socket.on("pipeline:update", callback);

  return () => {
    socket.off("pipeline:update", callback);
  };
}

export function subscribeToLogs(callback) {
  const socket = initSocket();
  if (!socket) return;

  socket.emit("subscribe:logs");
  socket.on("log:new", callback);
  socket.on("logs:new", callback);

  return () => {
    socket.off("log:new", callback);
    socket.off("logs:new", callback);
  };
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
