import { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';

export const useWebSocket = () => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    try {
      // Get JWT token from localStorage
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        console.warn('No token found, WebSocket not connected');
        return;
      }

      // Create socket connection with auth
      const newSocket = io(window.location.origin, {
        auth: { token },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling'],
      });

      socketRef.current = newSocket;

      // Connection event handlers
      newSocket.on('connect', () => {
        console.log('✅ WebSocket connected');
        setConnected(true);
        setSocket(newSocket);
      });

      newSocket.on('disconnect', () => {
        console.log('❌ WebSocket disconnected');
        setConnected(false);
      });

      newSocket.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
      });

      // Jenkins-specific listeners
      newSocket.on('jenkins:build-started', (data) => {
        console.log('🚀 Jenkins build started:', data);
      });

      newSocket.on('jenkins:build-progress', (data) => {
        console.log('⏳ Jenkins build progress:', data);
      });

      newSocket.on('jenkins:build-completed', (data) => {
        console.log('✅ Jenkins build completed:', data);
      });

      newSocket.on('jenkins:build-failed', (data) => {
        console.log('❌ Jenkins build failed:', data);
      });

      return () => {
        if (newSocket) {
          newSocket.disconnect();
        }
      };
    } catch (error) {
      console.error('Error setting up WebSocket:', error);
    }
  }, []);

  return socket;
};

export default useWebSocket;
