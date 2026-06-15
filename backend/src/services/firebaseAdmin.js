import admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

let firebaseApp;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.join(__dirname, "../../serviceAccountKey.json");

function normalizePrivateKey(privateKey) {
  return privateKey?.replace(/\\n/g, "\n");
}

function loadServiceAccount() {
  if (process.env.FIREBASE_ADMIN_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);
    return {
      ...serviceAccount,
      private_key: normalizePrivateKey(serviceAccount.private_key),
      source: "FIREBASE_ADMIN_KEY",
    };
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      source: "FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY",
    };
  }

  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf-8"));
    return {
      ...serviceAccount,
      private_key: normalizePrivateKey(serviceAccount.private_key),
      source: "serviceAccountKey.json",
    };
  }

  throw new Error(
    "Firebase Admin credentials not found. Set FIREBASE_ADMIN_KEY, set FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY, or place serviceAccountKey.json in backend/."
  );
}

try {
  const serviceAccountKey = loadServiceAccount();
  const configuredProjectId = process.env.FIREBASE_PROJECT_ID;

  if (!serviceAccountKey.project_id || !serviceAccountKey.client_email || !serviceAccountKey.private_key) {
    throw new Error("Firebase Admin credentials are incomplete. project_id, client_email, and private_key are required.");
  }

  if (configuredProjectId && configuredProjectId !== serviceAccountKey.project_id) {
    throw new Error(
      `Firebase project mismatch: FIREBASE_PROJECT_ID=${configuredProjectId}, service account project_id=${serviceAccountKey.project_id}`
    );
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: serviceAccountKey.project_id,
      clientEmail: serviceAccountKey.client_email,
      privateKey: serviceAccountKey.private_key,
    }),
    projectId: serviceAccountKey.project_id,
  });

  console.log("Firebase Admin SDK initialized", {
    projectId: serviceAccountKey.project_id,
    credentialSource: serviceAccountKey.source,
    clientEmail: serviceAccountKey.client_email,
  });
} catch (error) {
  console.warn("Firebase Admin SDK initialization skipped:", error.message);
  console.log("To use Firebase authentication, configure Firebase Admin credentials for the same project as the frontend.");
}

export const verifyFirebaseToken = async (idToken) => {
  try {
    if (!firebaseApp) {
      throw new Error("Firebase Admin SDK not initialized");
    }

    console.log("Received Firebase token:", idToken?.substring(0, 30));
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log("Decoded Firebase UID:", decodedToken.uid);
    return decodedToken;
  } catch (error) {
    console.error("Firebase verification error:", error);
    
    // Check for specific error code - expired token
    if (error.code === 'auth/id-token-expired') {
      const expiredError = new Error("Firebase ID token has expired");
      expiredError.code = 'auth/id-token-expired';
      throw expiredError;
    }
    
    throw new Error("Firebase token verification failed: " + error.message);
  }
};

export const firebaseAdmin = admin;
export default firebaseApp;
