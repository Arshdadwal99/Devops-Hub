import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Initialize Firebase Admin SDK
// Set FIREBASE_ADMIN_KEY environment variable or place serviceAccountKey.json in backend/
let firebaseApp;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  let serviceAccountKey;
  
  if (process.env.FIREBASE_ADMIN_KEY) {
    serviceAccountKey = JSON.parse(process.env.FIREBASE_ADMIN_KEY);
  } else {
    // Try to load from file - serviceAccountKey.json should be in backend/ directory
    const keyPath = path.join(__dirname, "../../serviceAccountKey.json");
    if (fs.existsSync(keyPath)) {
      serviceAccountKey = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
    } else {
      throw new Error("serviceAccountKey.json not found and FIREBASE_ADMIN_KEY not set");
    }
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKey),
  });
  
  console.log("✅ Firebase Admin SDK initialized");
} catch (error) {
  console.warn("⚠️  Firebase Admin SDK initialization skipped:", error.message);
  console.log("   To use Firebase authentication, set FIREBASE_ADMIN_KEY environment variable or place serviceAccountKey.json in backend/");
}

export const verifyFirebaseToken = async (idToken) => {
  try {
    if (!firebaseApp) {
      throw new Error("Firebase Admin SDK not initialized");
    }
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error("Invalid Firebase token: " + error.message);
  }
};

export const firebaseAdmin = admin;
export default firebaseApp;
