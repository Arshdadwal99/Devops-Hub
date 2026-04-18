import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: process.env.PORT || 5000,
  mongoUri:
    process.env.MONGODB_URI || "mongodb://localhost:27017/devops-dashboard",
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET || "your-secret-key-change-in-production",
  googleClientId:
    process.env.GOOGLE_CLIENT_ID || "your-google-client-id",
  googleClientSecret:
    process.env.GOOGLE_CLIENT_SECRET || "your-google-client-secret",
};
