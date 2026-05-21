import mongoose from "mongoose";
import { config } from "./config.js";
import { localDB } from "./db-local.js";

let isConnected = false;
export let useLocalDB = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;

export async function connectDb() {
  mongoose.set("strictQuery", true);
  
  try {
    await mongoose.connect(config.mongoUri, {
      retryWrites: true,
      w: "majority",
      serverSelectionTimeoutMS: 3000,
      socketTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });
    isConnected = true;
    useLocalDB = false;
    reconnectAttempts = 0;
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    isConnected = false;
    useLocalDB = true;
    reconnectAttempts = 0;
    console.warn("⚠️  MongoDB connection failed:", error.message);
    console.warn("✅ Using local file-based database for development");
    console.warn("⚠️  Server will continue running with local database.");
  }
}

export function isDbConnected() {
  return isConnected;
}

// Attempt to reconnect if connection is lost
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  MongoDB disconnected.");
  isConnected = false;
  useLocalDB = true;
  reconnectAttempts++;
  
  if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
    console.warn(`⚠️  Reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}...`);
    setTimeout(() => {
      mongoose.connect(config.mongoUri, {
        serverSelectionTimeoutMS: 3000,
        socketTimeoutMS: 3000,
      }).catch((err) => {
        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.warn("❌ Max reconnection attempts reached. Using local database.");
        }
      });
    }, 5000);
  }
});

mongoose.connection.on("connected", () => {
  isConnected = true;
  useLocalDB = false;
  reconnectAttempts = 0;
  console.log("✅ MongoDB connected");
});

mongoose.connection.on("error", (err) => {
  console.error("❌ MongoDB error:", err.message);
  isConnected = false;
  useLocalDB = true;
});

export { localDB };
