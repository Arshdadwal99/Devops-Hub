import mongoose from "mongoose";
import { config } from "./config.js";
import { localDB } from "./db-local.js";

let isConnected = false;
export let useLocalDB = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000; // 3 seconds between attempts

/**
 * MongoDB Connection Options optimized for Atlas in production
 */
const mongooseOptions = {
  // Connection string options
  retryWrites: true,
  w: "majority",
  
  // Timeouts optimized for Atlas (longer than local)
  serverSelectionTimeoutMS: 30000, // 30 seconds for server discovery
  socketTimeoutMS: 45000, // 45 seconds for socket operations
  connectTimeoutMS: 30000, // 30 seconds for initial connection
  
  // Connection pooling
  maxPoolSize: 10,
  minPoolSize: 2,
  
  // Heartbeat to keep connection alive
  heartbeatFrequencyMS: 30000, // 30 seconds
  
  // Server monitoring
  monitorCommands: true,
  
  // Buffering control - removed bufferMaxEntries as it's not supported in newer mongoose versions
  bufferCommands: false, // Don't buffer if disconnected (fail fast)
  
  // Retry logic
  maxStalenessSeconds: 120,
  
  // Family (IPv4 first)
  family: 4,
};

console.log("🔧 [DB] MongoDB connection options configured");
console.log("📍 [DB] Connection URI:", config.mongoUri ? config.mongoUri.split("@")[0] + "@***" : "NOT SET");
console.log("⚙️  [DB] Options:", {
  serverSelectionTimeoutMS: mongooseOptions.serverSelectionTimeoutMS,
  socketTimeoutMS: mongooseOptions.socketTimeoutMS,
  maxPoolSize: mongooseOptions.maxPoolSize,
  bufferCommands: mongooseOptions.bufferCommands,
});

export async function connectDb() {
  mongoose.set("strictQuery", true);
  
  if (!config.mongoUri) {
    console.error("❌ [DB] MONGO_URI not set! Please set MONGO_URI environment variable.");
    console.error("   For MongoDB Atlas: mongodb+srv://user:password@cluster.mongodb.net/dbname");
    isConnected = false;
    useLocalDB = true;
    return;
  }
  
  try {
    console.log("🔄 [DB] Connecting to MongoDB...");
    
    await mongoose.connect(config.mongoUri, mongooseOptions);
    
    isConnected = true;
    useLocalDB = false;
    reconnectAttempts = 0;
    
    console.log("✅ [DB] MongoDB connected successfully!");
    console.log(`✅ [DB] Database: ${mongoose.connection.db.getName()}`);
    console.log(`✅ [DB] Connection state: ${mongoose.connection.readyState}`);
    
    return true;
  } catch (error) {
    isConnected = false;
    useLocalDB = true;
    reconnectAttempts = 0;
    
    console.error("❌ [DB] MongoDB connection failed!");
    console.error("   Error:", error.message);
    
    if (error.message.includes("authentication failed")) {
      console.error("   → Check username/password in MONGO_URI");
    } else if (error.message.includes("getaddrinfo")) {
      console.error("   → Check network connectivity and cluster address");
    } else if (error.message.includes("bufferMaxEntries")) {
      console.error("   → Command buffer overflow - connection unstable");
    } else if (error.message.includes("ENOTFOUND")) {
      console.error("   → DNS resolution failed - check MONGO_URI format");
    }
    
    console.warn("⚠️  [DB] Using local file-based database for now");
    console.warn("   Server will continue running with limited functionality");
    console.warn("   MongoDB will be available once connection is restored");
    
    return false;
  }
}

/**
 * Get current connection status
 */
export function isDbConnected() {
  return isConnected;
}

/**
 * Get MongoDB connection object
 */
export function getConnection() {
  return mongoose.connection;
}

/**
 * Graceful connection close
 */
export async function closeDb() {
  try {
    await mongoose.disconnect();
    isConnected = false;
    console.log("✅ [DB] MongoDB connection closed");
  } catch (error) {
    console.error("❌ [DB] Error closing MongoDB connection:", error.message);
  }
}

// ============ EVENT LISTENERS ============

/**
 * Successfully connected to MongoDB
 */
mongoose.connection.on("connected", () => {
  isConnected = true;
  useLocalDB = false;
  reconnectAttempts = 0;
  console.log("✅ [DB] MongoDB connection established");
});

/**
 * MongoDB connection opened
 */
mongoose.connection.on("open", () => {
  console.log("✅ [DB] MongoDB ready to use");
});

/**
 * Mongoose disconnected from MongoDB
 */
mongoose.connection.on("disconnected", () => {
  console.warn("⚠️  [DB] MongoDB disconnected");
  isConnected = false;
  useLocalDB = true;
  
  // Attempt to reconnect
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
    reconnectAttempts++;
    const delay = RECONNECT_DELAY * reconnectAttempts; // Exponential backoff
    console.warn(`🔄 [DB] Attempting reconnect ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms...`);
    
    setTimeout(() => {
      mongoose.connect(config.mongoUri, mongooseOptions).catch((err) => {
        console.error(`❌ [DB] Reconnection attempt ${reconnectAttempts} failed:`, err.message);
      });
    }, delay);
  } else {
    console.error("❌ [DB] Max reconnection attempts reached");
    console.warn("⚠️  [DB] Please check MongoDB Atlas connection and restart server");
  }
});

/**
 * Mongoose encountered an error
 */
mongoose.connection.on("error", (err) => {
  console.error("❌ [DB] MongoDB error:", err.message);
  isConnected = false;
  useLocalDB = true;
  
  if (err.message.includes("buffering timed out")) {
    console.error("   → Database operation buffer timed out");
    console.error("   → Check MongoDB Atlas connectivity and network");
  }
});

/**
 * Mongoose attempted to reconnect and failed
 */
mongoose.connection.on("reconnectFailed", () => {
  console.error("❌ [DB] MongoDB reconnection failed permanently");
  isConnected = false;
});

/**
 * Application closed MongoDB
 */
mongoose.connection.on("close", () => {
  console.log("✅ [DB] MongoDB connection closed cleanly");
  isConnected = false;
});

export { localDB };
