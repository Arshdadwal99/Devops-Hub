import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { SocketProvider } from "./lib/SocketContext";
import ProtectedRoute from "./components/ProtectedRoute";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import Integrations from "./pages/Integrations";
import GitHubRepositories from "./pages/GitHubRepositories";
import GitHubWebhookConfig from "./pages/GitHubWebhookConfig";
import BuildProgress from "./pages/BuildProgress";
import ImageRegistry from "./pages/ImageRegistry";
import DockerHubConnection from "./pages/DockerHubConnection";

import JenkinsConnection from "./pages/JenkinsConnection";
import AWSConnection from "./pages/AWSConnection";
import AWSJobDebug from "./pages/AWSJobDebug";
import AWSInfrastructureProvisioning from "./pages/AWSInfrastructureProvisioning";
import AWSInfrastructureManagement from "./pages/AWSInfrastructureManagement";
import AWSInstanceDetails from "./pages/AWSInstanceDetails";
import MonitoringDashboard from "./components/MonitoringDashboard";
import DeploymentDashboard from "./pages/DeploymentDashboard";

function SettingsPage() {
  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="glass-panel rounded-[28px] p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-slate-400">Workspace</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-slate-100">Settings</h1>
        <p className="mt-3 text-slate-400">
          Account and integration preferences are managed from their respective connection screens.
        </p>
      </section>
    </main>
  );
}

console.log("App.jsx loading...");

function AppContent() {
  const { isAuthenticated } = useAuth();
  const token = localStorage.getItem("authToken");

  return (
    <SocketProvider token={isAuthenticated ? token : null}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route
              path="/"
              element={<Dashboard />}
            />
            <Route
              path="/integrations"
              element={<Integrations />}
            />
            <Route
              path="/github/repositories"
              element={<GitHubRepositories />}
            />
            <Route
              path="/github/webhook/:repositoryId"
              element={<GitHubWebhookConfig />}
            />
            <Route
              path="/deployments/setup/:deploymentId"
              element={<BuildProgress />}
            />
            <Route
              path="/deployments/images"
              element={<ImageRegistry />}
            />
            <Route
              path="/registry/dockerhub"
              element={<DockerHubConnection />}
            />
            <Route
              path="/jenkins/connect"
              element={<JenkinsConnection />}
            />
            <Route
              path="/monitoring"
              element={<MonitoringDashboard />}
            />
            <Route
              path="/settings"
              element={<SettingsPage />}
            />
            <Route
              path="/aws/connect"
              element={<AWSConnection />}
            />
            <Route
              path="/aws/jobs/:jobId/debug"
              element={<AWSJobDebug />}
            />
            <Route
              path="/aws/:connectionId/provision"
              element={<AWSInfrastructureProvisioning />}
            />
            <Route
              path="/aws/infrastructure"
              element={<AWSInfrastructureManagement />}
            />
            <Route
              path="/aws/infrastructure/:instanceId"
              element={<AWSInstanceDetails />}
            />
            <Route
              path="/aws/:connectionId/infrastructure"
              element={<AWSInfrastructureManagement />}
            />
            <Route
              path="/deployment/:deploymentId"
              element={<DeploymentDashboard />}
            />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </SocketProvider>
  );
}

function App() {
  console.log("App component rendering...");
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
