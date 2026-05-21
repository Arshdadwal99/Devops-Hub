import React, { createContext, useContext } from "react";
import useSocket from "../hooks/useSocket.js";

/**
 * Socket.io Context
 * Provides real-time data and Socket.io methods to all components
 */
const SocketContext = createContext(null);

/**
 * Socket.io Context Provider
 * Wraps the application and provides Socket.io connection
 */
export const SocketProvider = ({ children, token }) => {
  const socket = useSocket(token);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

/**
 * Custom hook to use Socket.io context
 * Usage: const socket = useSocketContext();
 */
export const useSocketContext = () => {
  const context = useContext(SocketContext);
  if (!context) {
    console.warn("⚠️  useSocketContext must be used within SocketProvider");
    return null;
  }
  return context;
};

export default SocketContext;
