import { 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { auth } from "./firebaseConfig";

// Enable persistence
setPersistence(auth, browserLocalPersistence).catch(err => {
  console.warn("Persistence error:", err.message);
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    localStorage.removeItem("firebaseToken");
    return;
  }

  // NOTE: Do NOT cache Firebase tokens in localStorage
  // Fresh tokens must be generated immediately after each auth action (Google login, email login)
  // Tokens in localStorage will inevitably expire if user closes/reopens browser
  // The backend must verify tokens from the CURRENT request only, never cached tokens
  try {
    // Just verify the token can be refreshed, but don't cache it
    await user.getIdToken(true);
  } catch (error) {
    console.warn("Firebase token refresh failed:", error.message);
    localStorage.removeItem("firebaseToken");
  }
});

/**
 * Sign up with email and password
 */
export const firebaseSignup = async (email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const idToken = await userCredential.user.getIdToken(true);
    return {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      idToken
    };
  } catch (error) {
    throw new Error(getFirebaseErrorMessage(error.code));
  }
};

/**
 * Sign in with email and password
 */
export const firebaseLogin = async (email, password) => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const idToken = await userCredential.user.getIdToken(true);
    return {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      idToken
    };
  } catch (error) {
    throw new Error(getFirebaseErrorMessage(error.code));
  }
};

/**
 * Sign out
 */
export const firebaseLogout = async () => {
  try {
    await firebaseSignOut(auth);
  } catch (error) {
    throw new Error("Logout failed: " + error.message);
  }
};

/**
 * Get current user
 */
export const getCurrentAuthUser = () => {
  return auth.currentUser;
};

/**
 * Listen to auth state changes
 */
export const onAuthChange = (callback) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Get Firebase error message
 */
const getFirebaseErrorMessage = (errorCode) => {
  const messages = {
    "auth/email-already-in-use": "Email is already registered",
    "auth/invalid-email": "Invalid email address",
    "auth/weak-password": "Password is too weak (min 6 characters)",
    "auth/user-not-found": "User not found",
    "auth/wrong-password": "Incorrect password",
    "auth/invalid-credential": "Invalid email or password",
    "auth/too-many-requests": "Too many failed login attempts. Try again later",
    "auth/account-exists-with-different-credential": "Account already exists with different sign-in method"
  };
  return messages[errorCode] || "Authentication failed";
};
