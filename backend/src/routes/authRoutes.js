import express from "express";
import {
  signupService,
  loginService,
  googleAuthService,
  getUserService,
} from "../services/authService.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Signup route
router.post("/signup", async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const result = await signupService(email, password, name);
    res.status(201).json(result);
  } catch (error) {
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

export default router;
