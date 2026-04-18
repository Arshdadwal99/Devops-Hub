import React from "react";
import ReactDOM from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App";
import "./index.css";

console.log("main.jsx loading...");
console.log("VITE_GOOGLE_CLIENT_ID:", import.meta.env.VITE_GOOGLE_CLIENT_ID);

const root = document.getElementById("root");
console.log("Root element:", root);

if (!root) {
  console.error("Root element not found!");
  document.body.innerHTML = "<h1>ERROR: Root element not found!</h1>";
} else {
  console.log("Creating React root...");
  try {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID || "test-client-id-123"}>
          <App />
        </GoogleOAuthProvider>
      </React.StrictMode>
    );
    console.log("React app rendered successfully");
  } catch (error) {
    console.error("React render error:", error);
    document.body.innerHTML = `<h1 style="color: red; padding: 20px;">ERROR: ${error.message}</h1>`;
  }
}

