import express from "express";
import {
  signupService,
  loginService,
  googleAuthService,
  getUserService,
  firebaseAuthService,
} from "../services/authService.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Signup route
router.post("/signup", async (req, res, next) => {
  try {
    console.log("📝 [Auth/Signup] Request received");
    const { email, password, name } = req.body;
    console.log("📝 [Auth/Signup] Data:", { email, name, passwordLength: password?.length });

    if (!email || !password || !name) {
      console.warn("⚠️  [Auth/Signup] Missing required fields");
      return res.status(400).json({ message: "Missing required fields" });
    }

    console.log("🔄 [Auth/Signup] Calling signup service...");
    const result = await signupService(email, password, name);
    console.log("✅ [Auth/Signup] Service returned successfully");
    res.status(201).json(result);
  } catch (error) {
    console.error("❌ [Auth/Signup] Error:", error.message);
    next(error);
  }
});

// Login route
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const result = await loginService(email, password);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Google authentication callback
router.post("/google", async (req, res, next) => {
  try {
    const { token: googleToken } = req.body;

    if (!googleToken) {
      return res.status(400).json({ message: "Google token is required" });
    }

    // Decode the Google token to get user info
    const payload = JSON.parse(
      Buffer.from(googleToken.split(".")[1], "base64").toString()
    );

    const result = await googleAuthService(
      payload.sub,
      payload.email,
      payload.name,
      payload.picture
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// Get current user
router.get("/me", verifyToken, async (req, res, next) => {
  try {
    const user = await getUserService(req.user.userId);
    res.json(user);
  } catch (error) {
    next(error);
  }
});

// Firebase authentication (signup/login)
router.post("/firebase", async (req, res, next) => {
  try {
    const { firebaseToken, name } = req.body;

    if (!firebaseToken) {
      return res.status(400).json({ message: "Firebase token is required" });
    }

    console.log("🔐 [Firebase Auth] Request received");
    
    const result = await firebaseAuthService(firebaseToken, "firebase", { name });
    console.log("✅ [Firebase Auth] Authentication successful");
    
    res.json(result);
  } catch (error) {
    console.error("❌ [Firebase Auth] Error:", error.message);
    next(error);
  }
});

export default router;
