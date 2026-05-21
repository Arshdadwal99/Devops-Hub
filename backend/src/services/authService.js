import { User } from "../models/User.js";
import { generateToken } from "../middleware/authMiddleware.js";
import { isDbConnected, localDB } from "../db.js";
import bcrypt from "bcryptjs";
import { verifyFirebaseToken } from "./firebaseAdmin.js";

export const signupService = async (email, password, name) => {
  try {
    console.log("🔍 Signup request:", { email, name });
    console.log("📊 Database connected:", isDbConnected());
    
    // Check if using local DB
    if (!isDbConnected()) {
      console.log("📁 Using local database");
      // Check if user already exists in local DB
      const existingUser = localDB.findUserByEmail(email);
      if (existingUser) {
        throw new Error("User already exists");
      }

      console.log("🔐 Hashing password...");
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log("✅ Password hashed");

      // Create new user in local DB
      const user = localDB.createUser({
        email,
        name,
        password: hashedPassword,
        authProvider: "local",
      });
      console.log("✅ User created in local DB:", user._id);

      const token = generateToken(user._id);
      return {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          authProvider: user.authProvider,
        },
        token,
      };
    }

    console.log("🗄️  Using MongoDB");
    // MongoDB path
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error("User already exists");
    }

    const user = new User({
      email,
      name,
      password,
      authProvider: "local",
    });

    await user.save();

    const token = generateToken(user._id);
    return {
      user: user.toJSON(),
      token,
    };
  } catch (error) {
    if (error.message.includes("MongoDB") || error.message.includes("connection")) {
      throw new Error("Database unavailable. Please try again later.");
    }
    throw error;
  }
};

export const loginService = async (email, password) => {
  try {
    // Check if using local DB
    if (!isDbConnected()) {
      const user = localDB.findUserByEmail(email);
      if (!user) {
        throw new Error("Invalid email or password");
      }

      if (!user.password) {
        throw new Error("This account uses Google authentication. Please sign in with Google.");
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new Error("Invalid email or password");
      }

      const token = generateToken(user._id);
      return {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          authProvider: user.authProvider,
        },
        token,
      };
    }

    // MongoDB path
    const user = await User.findOne({ email });
    if (!user) {
      throw new Error("Invalid email or password");
    }

    if (!user.password) {
      throw new Error("This account uses Google authentication. Please sign in with Google.");
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    const token = generateToken(user._id);
    return {
      user: user.toJSON(),
      token,
    };
  } catch (error) {
    if (error.message.includes("MongoDB") || error.message.includes("connection")) {
      throw new Error("Database unavailable. Please try again later.");
    }
    throw error;
  }
};

export const googleAuthService = async (googleId, email, name, profilePicture) => {
  try {
    // Check if using local DB
    if (!isDbConnected()) {
      let user = localDB.findUserByEmail(email);

      if (user) {
        if (!user.googleId) {
          user.googleId = googleId;
          user.authProvider = "google";
          localDB.saveData();
        }
      } else {
        user = localDB.createUser({
          email,
          name,
          googleId,
          profilePicture,
          authProvider: "google",
        });
      }

      const token = generateToken(user._id);
      return {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          authProvider: user.authProvider,
        },
        token,
      };
    }

    // MongoDB path
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (user) {
      if (!user.googleId) {
        user.googleId = googleId;
        user.authProvider = "google";
        await user.save();
      }
    } else {
      user = new User({
        email,
        name,
        googleId,
        profilePicture,
        authProvider: "google",
      });
      await user.save();
    }

    const token = generateToken(user._id);
    return {
      user: user.toJSON(),
      token,
    };
  } catch (error) {
    if (error.message.includes("MongoDB") || error.message.includes("connection")) {
      throw new Error("Database unavailable. Please try again later.");
    }
    throw error;
  }
};

export const getUserService = async (userId) => {
  try {
    // Check if using local DB
    if (!isDbConnected()) {
      const user = localDB.findUserById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      return {
        _id: user._id,
        email: user.email,
        name: user.name,
        authProvider: user.authProvider,
      };
    }

    // MongoDB path
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    return user.toJSON();
  } catch (error) {
    if (error.message.includes("MongoDB") || error.message.includes("connection")) {
      throw new Error("Database unavailable. Please try again later.");
    }
    throw error;
  }
};

/**
 * Firebase Authentication Service
 * Handles Firebase signup and login using ID tokens
 */
export const firebaseAuthService = async (firebaseIdToken, authType = "login", userData = {}) => {
  try {
    console.log(`🔐 [Firebase Auth] Processing ${authType} with Firebase token`);
    
    // Verify Firebase token
    const decodedToken = await verifyFirebaseToken(firebaseIdToken);
    const { uid: firebaseUid, email } = decodedToken;
    
    console.log(`✅ Firebase token verified for user: ${email}`);

    // Check if using local DB
    if (!isDbConnected()) {
      console.log("📁 Using local database");
      let user = localDB.findUserByEmail(email);

      if (user) {
        console.log(`👤 Existing user found: ${user._id}`);
        // Update Firebase UID if not set
        if (!user.firebaseUid) {
          user.firebaseUid = firebaseUid;
          user.authProvider = "firebase";
          localDB.saveData();
        }
      } else {
        console.log("🆕 Creating new user in local database");
        user = localDB.createUser({
          email,
          name: userData.name || email.split("@")[0],
          firebaseUid,
          authProvider: "firebase",
        });
      }

      const token = generateToken(user._id);
      return {
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
          authProvider: user.authProvider,
        },
        token,
      };
    }

    // MongoDB path
    console.log("🗄️  Using MongoDB");
    let user = await User.findOne({ $or: [{ firebaseUid }, { email }] });

    if (user) {
      console.log(`👤 Existing user found: ${user._id}`);
      // Update Firebase UID if not set
      if (!user.firebaseUid) {
        user.firebaseUid = firebaseUid;
        user.authProvider = "firebase";
        await user.save();
      }
    } else {
      console.log("🆕 Creating new Firebase user in MongoDB");
      user = new User({
        email,
        name: userData.name || email.split("@")[0],
        firebaseUid,
        authProvider: "firebase",
      });
      await user.save();
    }

    const token = generateToken(user._id);
    return {
      user: user.toJSON(),
      token,
    };
  } catch (error) {
    console.error("❌ Firebase authentication error:", error.message);
    
    // Handle specific error types
    if (error.message && error.message.includes("Firebase Admin")) {
      throw new Error("Firebase service not properly configured. Please contact administrator.");
    }
    
    if (error.message && error.message.includes("Firebase token")) {
      throw new Error("Invalid Firebase authentication token");
    }
    
    if (error.message && error.message.includes("MongoDB") || error.message.includes("connection")) {
      throw new Error("Database unavailable. Please try again later.");
    }
    
    // Re-throw with Firebase prefix if not already present
    if (!error.message.includes("Firebase")) {
      throw new Error(`Firebase: ${error.message}`);
    }
    
    throw error;
  }
};
