import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { login, googleAuth } from "../lib/api";
import { useAuth } from "../lib/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login: setAuthLogin } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await login(email, password);
      setAuthLogin(response.user, response.token);
      navigate("/");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setLoading(true);
    setError("");

    try {
      const response = await googleAuth(credentialResponse.credential);
      setAuthLogin(response.user, response.token);
      navigate("/");
    } catch (err) {
      setError(err.message || "Google authentication failed");
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
            {error}
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

        <div style={{ textAlign: 'center', marginBottom: '24px', color: '#888', fontSize: '14px' }}>
          Or
        </div>

        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError("Google login failed")}
            theme="dark"
            size="large"
          />
        </div>

        <p style={{ 
          textAlign: 'center', 
          color: '#888', 
          fontSize: '14px',
          margin: '0'
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
