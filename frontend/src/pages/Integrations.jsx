import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import GitHubIntegrationCard from "../components/GitHubIntegrationCard";
import { getDockerHubRegistryStatus, getJenkinsConnectionStatus, getAWSConnections } from "../lib/api";

export default function Integrations() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [callbackMessage, setCallbackMessage] = useState(null);
  const [callbackError, setCallbackError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [dockerHubStatus, setDockerHubStatus] = useState(null);
  const [jenkinsStatus, setJenkinsStatus] = useState(null);
  const [awsConnections, setAwsConnections] = useState([]);

  useEffect(() => {
    // Scroll to top when component mounts
    window.scrollTo(0, 0);

    // Check for OAuth callback response
    const success = searchParams.get("github_connected");
    const error = searchParams.get("error");
    const username = searchParams.get("username");

    if (success === "true") {
      setCallbackMessage(`✅ GitHub account connected successfully! (${username})`);
      // Trigger refresh of GitHub status
      setRefreshTrigger((prev) => prev + 1);
      
      // Clear URL params after processing
      setTimeout(() => {
        setSearchParams({});
      }, 100);
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setCallbackMessage(null);
      }, 5000);
    }

    if (error) {
      setCallbackError(`❌ Connection failed: ${error}`);
      
      // Clear error after 5 seconds
      setTimeout(() => {
        setCallbackError(null);
      }, 5000);
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    getDockerHubRegistryStatus()
      .then((response) => setDockerHubStatus(response.status))
      .catch(() => setDockerHubStatus({ connected: false }));
    getJenkinsConnectionStatus()
      .then((response) => setJenkinsStatus(response.status))
      .catch(() => setJenkinsStatus({ connected: false }));
    getAWSConnections()
      .then((response) => setAwsConnections(response.connections || []))
      .catch(() => setAwsConnections([]));
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 min-h-screen">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate("/")}
            className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold text-slate-100">Integrations</h1>
          <p className="mt-2 text-slate-400">
            Manage third-party service connections and integrations
          </p>
        </div>
      </div>

      {/* Callback Messages */}
      {callbackMessage && (
        <div className="mb-6 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-green-300">
          {callbackMessage}
        </div>
      )}
      {callbackError && (
        <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {callbackError}
        </div>
      )}

      {/* Integrations Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-1">
        {/* GitHub Integration */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-200">Source Control</h2>
          <GitHubIntegrationCard refreshTrigger={refreshTrigger} />
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-200">Container Registry</h2>
          <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-slate-100">Docker Hub</h3>
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${
                    dockerHubStatus?.connected
                      ? "bg-emerald-500/10 text-emerald-200"
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {dockerHubStatus?.connected ? "Connected" : "Not connected"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {dockerHubStatus?.connected
                    ? `Username: ${dockerHubStatus.username}`
                    : "Connect Docker Hub for generated pipeline image pushes."}
                </p>
              </div>
              <button
                onClick={() => navigate("/registry/dockerhub")}
                className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
              >
                {dockerHubStatus?.connected ? "Manage" : "Connect"}
              </button>
            </div>
          </div>
        </div>



        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-200">Cloud Infrastructure</h2>
          <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-slate-100">AWS</h3>
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${
                    awsConnections?.length > 0
                      ? "bg-emerald-500/10 text-emerald-200"
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {awsConnections?.length > 0 ? `${awsConnections.length} connection${awsConnections.length !== 1 ? 's' : ''}` : "Not connected"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {awsConnections?.length > 0
                    ? `Connected to ${awsConnections[0].accountId || "AWS Account"}`
                    : "Connect to AWS for fully automated infrastructure provisioning."}
                </p>
              </div>
              <button
                onClick={() => navigate("/aws/connect")}
                className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
              >
                {awsConnections?.length > 0 ? "Manage" : "Connect"}
              </button>
            </div>
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-200">CI/CD Pipeline</h2>
          <div className="rounded-lg border border-white/10 bg-slate-900/60 p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-slate-100">Jenkins</h3>
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${
                    jenkinsReady(jenkinsStatus)
                      ? "bg-emerald-500/10 text-emerald-200"
                      : jenkinsStatus?.connected
                      ? "bg-amber-500/10 text-amber-200"
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {jenkinsReady(jenkinsStatus) ? "Connected ✓" : jenkinsStatus?.connected ? "Needs config" : "Not connected"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  {jenkinsStatus?.connected
                    ? `Server: ${jenkinsStatus.url || "Connected"} | User: ${jenkinsStatus.username || "configured"}`
                    : "Connect Jenkins for automated CI/CD pipeline execution."}
                </p>
              </div>
              <button
                onClick={() => navigate("/jenkins/connect")}
                className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
              >
                {jenkinsStatus?.connected ? "Manage" : "Connect"}
              </button>
            </div>
          </div>
        </div>

        {/* Future integrations placeholder */}
        <div className="mt-4">
          <h2 className="mb-4 text-lg font-semibold text-slate-200">Coming Soon</h2>
          <div className="grid gap-4">
            {[
              { name: "GitLab", description: "Connect to GitLab for source control" },
              { name: "Bitbucket", description: "Connect to Bitbucket repositories" },
            ].map((integration) => (
              <div
                key={integration.name}
                className="rounded-2xl border border-white/10 bg-slate-900/30 p-6 backdrop-blur-xl opacity-60"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-300">{integration.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{integration.description}</p>
                  </div>
                  <div className="text-sm text-slate-400">Coming Soon</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-12 rounded-2xl border border-white/10 bg-slate-900/50 p-6 backdrop-blur-xl">
        <h2 className="text-lg font-semibold text-slate-100">About Integrations</h2>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <p>
            🔐 <strong>Security First:</strong> Your integrations are securely stored and encrypted. We never share your tokens with third parties.
          </p>
          <p>
            🔑 <strong>Token Storage:</strong> OAuth tokens are stored securely in the database and never exposed through the API.
          </p>
          <p>
            🚀 <strong>Easy Management:</strong> You can connect, disconnect, and manage integrations at any time from this page.
          </p>
          <p>
            ⚠️ <strong>Permissions:</strong> Each integration only has access to the permissions explicitly granted. Disconnect at any time to revoke access.
          </p>
        </div>
      </div>
    </main>
  );
}



function jenkinsReady(status) {
  const permissions = status?.permissions || {};
  return Boolean(
    status?.connected &&
      permissions.reachable &&
      permissions.authenticated &&
      permissions.read &&
      permissions.jobRead &&
      permissions.nodeRead
  );
}
