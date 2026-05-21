import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { SocketProvider } from "./lib/SocketContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import MonitoringDashboard from "./components/MonitoringDashboard";

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
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/monitoring"
            element={
              <ProtectedRoute>
                <MonitoringDashboard />
              </ProtectedRoute>
            }
          />
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
