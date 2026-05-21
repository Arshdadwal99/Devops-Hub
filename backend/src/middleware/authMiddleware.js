import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { verifyFirebaseToken } from "../services/firebaseAdmin.js";

export const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const result = await verifyAuthToken(token);
    req.user = result.user;
    req.userProvider = result.provider;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export const verifyAuthToken = async (token) => {
  if (!token) {
    throw new Error("No token provided");
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    return { user: decoded, provider: "jwt" };
  } catch (_jwtError) {
    console.log("JWT verification failed, trying Firebase...");
  }

  try {
    const decodedFirebase = await verifyFirebaseToken(token);
    return {
      user: { userId: decodedFirebase.uid, uid: decodedFirebase.uid, email: decodedFirebase.email },
      provider: "firebase",
    };
  } catch (firebaseError) {
    console.error("Firebase token verification failed:", firebaseError.message);
    throw new Error("Invalid token");
  }
};

export const generateToken = (userId) => {
  return jwt.sign({ userId }, config.jwtSecret, { expiresIn: "7d" });
};
