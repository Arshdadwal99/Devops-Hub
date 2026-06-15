import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getGitHubConnectUrl, handleGitHubCallback, getGitHubStatus, disconnectGitHub } from "../lib/api";

export default function GitHubIntegrationCard({ refreshTrigger = 0 }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Fetch GitHub status on mount and when refreshTrigger changes
  useEffect(() => {
    fetchStatus();
  }, [refreshTrigger]);

  // Handle GitHub callback if coming from OAuth redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    
    if (code) {
      console.log("GitHub callback detected, processing...");
      handleCallback(code);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  async function fetchStatus() {
    try {
      setLoading(true);
      setError("");
      const response = await getGitHubStatus();
      setStatus(response.data);
    } catch (err) {
      console.error("Failed to fetch GitHub status:", err);
      setError("Failed to fetch GitHub status");
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    try {
      setConnecting(true);
      setError("");
      setMessage("");
      
      const response = await getGitHubConnectUrl();
      
      // Redirect to GitHub OAuth
      if (response.authUrl) {
        window.location.href = response.authUrl;
      }
    } catch (err) {
      console.error("Failed to get GitHub connect URL:", err);
      setError("Failed to initiate GitHub connection. Please try again.");
      setConnecting(false);
    }
  }

  async function handleCallback(code) {
    try {
      setConnecting(true);
      setError("");
      const response = await handleGitHubCallback(code);
      
      if (response.success) {
        setMessage("✅ GitHub account connected successfully!");
        setStatus(response.data);
        // Refresh after 2 seconds
        setTimeout(fetchStatus, 2000);
      }
    } catch (err) {
      console.error("Failed to connect GitHub account:", err);
      setError("Failed to connect GitHub account. " + (err.response?.data?.error || "Please try again."));
    } finally {
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      setDisconnecting(true);
      setError("");
      setMessage("");
      
      const response = await disconnectGitHub();
      
      if (response.success) {
        setMessage("✅ GitHub account disconnected successfully!");
        setStatus(response.data);
        // Refresh after 2 seconds
        setTimeout(fetchStatus, 2000);
      }
    } catch (err) {
      console.error("Failed to disconnect GitHub account:", err);
      setError("Failed to disconnect GitHub account. Please try again.");
    } finally {
      setDisconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl">
        <div className="flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-700 border-t-aurora" />
        </div>
      </div>
    );
  }

  const isConnected = status?.githubConnected;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="mt-1 text-3xl">🐙</div>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">GitHub Integration</h3>
            <p className="mt-1 text-sm text-slate-400">
              {isConnected
                ? `Connected as @${status.githubUsername}`
                : "Connect your GitHub account to enable integration"}
            </p>
          </div>
        </div>
        <div className="text-right">
          {isConnected ? (
            <div className="inline-block rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 border border-emerald-300/20">
              ✓ Connected
            </div>
          ) : (
            <div className="inline-block rounded-full bg-slate-500/20 px-3 py-1 text-xs font-semibold text-slate-200 border border-slate-300/20">
              Not Connected
            </div>
          )}
        </div>
      </div>

      {status?.githubAvatar && isConnected && (
        <div className="mt-4 flex items-center gap-3">
          <img
            src={status.githubAvatar}
            alt={status.githubUsername}
            className="h-10 w-10 rounded-full"
          />
          <div className="text-xs text-slate-400">
            Connected on {new Date(status.githubConnectedAt).toLocaleDateString()}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg bg-red-500/20 border border-red-300/20 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {message && (
        <div className="mt-4 rounded-lg bg-emerald-500/20 border border-emerald-300/20 p-3 text-sm text-emerald-200">
          {message}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        {!isConnected ? (
          <button
            onClick={handleConnect}
            disabled={connecting}
            className="flex-1 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-600/50"
          >
            {connecting ? (
              <span className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-600 border-t-slate-300" />
                Connecting...
              </span>
            ) : (
              "Connect GitHub"
            )}
          </button>
        ) : (
          <>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="flex-1 rounded-lg bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed border border-red-300/20"
            >
              {disconnecting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-600 border-t-red-300" />
                  Disconnecting...
                </span>
              ) : (
                "Disconnect"
              )}
            </button>
            <button
              onClick={() => navigate("/github/repositories")}
              className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-center text-sm font-semibold text-slate-100 transition hover:bg-slate-600 border border-slate-500/50"
            >
              📚 Browse Repos →
            </button>
          </>
        )}
      </div>

      <div className="mt-4 text-xs text-slate-400">
        <p>ℹ️ This integration allows you to manage GitHub connections and authorize deployments.</p>
        <p className="mt-2">No repositories will be accessed until explicitly authorized.</p>
      </div>
    </div>
  );
}
