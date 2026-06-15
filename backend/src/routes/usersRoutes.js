import express from "express";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Users endpoints info
router.get("/", (req, res) => {
  res.json({
    message: "Users API",
    currentUser: req.user?.userId,
    endpoints: {
      profile: "GET /api/users/profile",
      settings: "GET /api/users/settings",
      update: "PUT /api/users/profile",
      preferences: "PUT /api/users/preferences",
      activity: "GET /api/users/activity"
    }
  });
});

// Get user profile
router.get("/profile", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid;
    res.json({
      userId,
      email: req.user?.email,
      name: req.user?.name,
      provider: req.user?.provider,
      createdAt: req.user?.createdAt
    });
  } catch (error) {
    next(error);
  }
});

// Get user settings
router.get("/settings", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid;
    res.json({
      userId,
      theme: "dark",
      notifications: true,
      emailAlerts: true
    });
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.put("/profile", async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const userId = req.user?.userId || req.user?.uid;
    
    res.json({
      message: "Profile updated successfully",
      userId,
      name,
      email
    });
  } catch (error) {
    next(error);
  }
});

// Update user preferences
router.put("/preferences", async (req, res, next) => {
  try {
    const { theme, notifications, emailAlerts } = req.body;
    const userId = req.user?.userId || req.user?.uid;
    
    res.json({
      message: "Preferences updated successfully",
      userId,
      theme,
      notifications,
      emailAlerts
    });
  } catch (error) {
    next(error);
  }
});

// Get user activity
router.get("/activity", async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.uid;
    res.json({
      userId,
      recentActivity: [],
      lastLogin: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

export default router;
