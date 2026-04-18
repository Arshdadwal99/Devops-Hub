import { User } from "../models/User.js";
import { generateToken } from "../middleware/authMiddleware.js";

export const signupService = async (email, password, name) => {
  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new Error("User already exists");
  }

  // Create new user
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
};

export const loginService = async (email, password) => {
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
};

export const googleAuthService = async (googleId, email, name, profilePicture) => {
  // Check if user exists
  let user = await User.findOne({ $or: [{ googleId }, { email }] });

  if (user) {
    // Update googleId if it was a local account that's now signing in with Google
    if (!user.googleId) {
      user.googleId = googleId;
      user.authProvider = "google";
      await user.save();
    }
  } else {
    // Create new user
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
};

export const getUserService = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }
  return user.toJSON();
};
