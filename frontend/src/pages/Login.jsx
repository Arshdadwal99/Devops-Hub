import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import { auth } from "../lib/firebaseConfig";
import { firebaseLogin, firebaseLogout } from "../lib/firebaseAuth";
import { firebaseAuth } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [firebaseReady, setFirebaseReady] = useState(false);
  const navigate = useNavigate();
  const { login: setAuthLogin } = useAuth();

  useEffect(() => {
    // Check if Firebase is properly configured
    if (auth && auth.app?.options?.apiKey && !auth.app.options.apiKey.includes("Dummy")) {
      setFirebaseReady(true);
    }

    const authError = sessionStorage.getItem("authError");
    if (authError) {
      setError(authError);
      sessionStorage.removeItem("authError");
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      // Sign in with Firebase
      const firebaseUser = await firebaseLogin(email, password);
      
      // Send Firebase token to backend
      const response = await firebaseAuth(firebaseUser.idToken);
      
      // Store JWT token and user data
      setAuthLogin(response.user, response.token);
      
      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    
    // Check if Firebase is properly configured
    if (!firebaseReady) {
      setError("Firebase is not properly configured. Please use email/password login or configure Firebase environment variables.");
      setLoading(false);
      return;
    }
    
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      // IMPORTANT: Force refresh to always get a fresh token immediately after Google auth
      const idToken = await user.getIdToken(true);
      
      // Send FRESH Firebase token directly to backend - do NOT cache in localStorage
      const response = await firebaseAuth(idToken);
      setAuthLogin(response.user, response.token);
      navigate("/");
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user") {
        // User cancelled, don't show error
        return;
      } else if (err.code === "auth/popup-blocked") {
        setError("Popup was blocked. Please allow popups for this site or use email/password login.");
      } else if (err.message && err.message.includes("Session expired")) {
        // Backend returned 401 for expired Firebase session
        setError("Your Google session expired. Please sign in again.");
      } else {
        setError(err.message || "Google authentication failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#1a1a2e', 
      color: '#fff', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{ 
        maxWidth: '400px', 
        width: '100%', 
        backgroundColor: '#16213e', 
        padding: '40px', 
        borderRadius: '12px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
      }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: 'bold', 
          marginBottom: '8px', 
          textAlign: 'center',
          margin: '0 0 8px 0'
        }}>
          DevOps Hub
        </h1>
        <p style={{ 
          color: '#aaa', 
          textAlign: 'center', 
          marginBottom: '32px',
          margin: '8px 0 32px 0'
        }}>
          Sign in to your dashboard
        </p>

        {error && (
          <div style={{ 
            backgroundColor: 'rgba(239, 68, 68, 0.2)', 
            border: '1px solid rgba(239, 68, 68, 0.5)', 
            color: '#fca5a5', 
            padding: '12px', 
            borderRadius: '6px', 
            marginBottom: '16px', 
            fontSize: '14px' 
          }}>
            <strong>Error:</strong> {error}
            {error.includes("not responding") || error.includes("Network error") ? (
              <div style={{ marginTop: '8px', fontSize: '12px', opacity: 0.9 }}>
                <p>💡 Make sure the backend is running:</p>
                <code style={{ display: 'block', background: 'rgba(0,0,0,0.3)', padding: '4px 8px', marginTop: '4px', borderRadius: '3px' }}>
                  npm run dev:backend
                </code>
              </div>
            ) : null}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#ccc', 
              marginBottom: '8px' 
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{ 
                width: '100%', 
                padding: '10px 12px', 
                backgroundColor: '#2a2a4e', 
                border: '1px solid #444', 
                borderRadius: '6px', 
                color: '#fff', 
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              required
            />
          </div>

          <div>
            <label style={{ 
              display: 'block', 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#ccc', 
              marginBottom: '8px' 
            }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ 
                width: '100%', 
                padding: '10px 12px', 
                backgroundColor: '#2a2a4e', 
                border: '1px solid #444', 
                borderRadius: '6px', 
                color: '#fff', 
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '10px',
              backgroundColor: loading ? '#2563eb' : '#3b82f6',
              color: '#fff',
              fontWeight: 'bold',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px'
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {firebaseReady && (
          <>
            <div style={{ textAlign: 'center', marginBottom: '24px', color: '#888', fontSize: '14px' }}>
              Or
            </div>

            <div style={{ marginBottom: '24px' }}>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  backgroundColor: '#fff',
                  color: '#000',
                  fontWeight: '500',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: loading ? 0.7 : 1
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {loading ? "Signing in..." : "Sign in with Google"}
              </button>
            </div>
          </>
        )}

        {!firebaseReady && (
          <div style={{ 
            backgroundColor: 'rgba(107, 114, 128, 0.2)', 
            border: '1px solid rgba(107, 114, 128, 0.5)', 
            color: '#d1d5db', 
            padding: '12px', 
            borderRadius: '6px', 
            marginBottom: '16px', 
            fontSize: '12px',
            textAlign: 'center'
          }}>
            💡 <strong>Tip:</strong> Google Sign-in is not available. Please use email/password to login.
          </div>
        )}

        <p style={{ 
          textAlign: 'center', 
          color: '#888', 
          fontSize: '14px',
          margin: '24px 0 0 0'
        }}>
          Don't have an account?{" "}
          <Link
            to="/signup"
            style={{ 
              color: '#60a5fa', 
              textDecoration: 'none',
              fontWeight: 'bold'
            }}
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
