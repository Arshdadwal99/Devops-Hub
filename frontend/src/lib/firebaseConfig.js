import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKeyForDevelopment123456789012",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "devops-hub-dummy.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "devops-hub-dummy",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "devops-hub-dummy.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:abc123def456"
};

let app;
let auth;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  console.log("Firebase initialized successfully");
} catch (error) {
  console.warn("Firebase initialization warning:", error.message);
  // Continue even if Firebase init has issues
}

export { app, auth };
export default app;
