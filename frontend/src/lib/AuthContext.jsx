import { createContext, useState, useContext, useEffect } from "react";
import { getCurrentUser } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if user is logged in on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem("authToken");
      
      // Only check auth if we have a token
      if (token) {
        try {
          const userData = await getCurrentUser();
          setUser(userData);
          setIsAuthenticated(true);
        } catch (error) {
          // Silently clear auth if user fetch fails - don't show error on login page
          console.warn("Auth check failed:", error.message);
          localStorage.removeItem("authToken");
          setIsAuthenticated(false);
        }
      } else {
        // No token, user is not authenticated
        setIsAuthenticated(false);
      }
      
      setLoading(false);
    };

    // Delay the auth check slightly to ensure everything is ready
    const timer = setTimeout(checkAuth, 100);
    return () => clearTimeout(timer);
  }, []);

  const login = (userData, token) => {
    localStorage.setItem("authToken", token);
    setUser(userData);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem("authToken");
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
