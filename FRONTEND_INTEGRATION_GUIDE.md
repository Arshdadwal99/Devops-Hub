# Frontend Integration Guide

## Overview

This guide ensures all frontend components are properly integrated with backend APIs and real-time Socket.io updates.

## API Configuration

### Frontend API Service (`frontend/src/lib/api.ts` or `api.js`)

Ensure axios instance is properly configured:

```javascript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to all requests
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default axiosInstance;
```

### Socket.io Configuration (`frontend/src/lib/socket.js`)

```javascript
import io from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_WEBSOCKET_URL || 'http://localhost:5000';

let socket = null;

export const connectSocket = (token) => {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socket.on('connect', () => {
    console.log('✅ Socket.io connected');
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket.io disconnected');
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
```

## Component Integration

### 1. Dashboard Component Integration

The main Dashboard should integrate:

```javascript
// frontend/src/pages/Dashboard.jsx

import { useEffect, useState } from 'react';
import { axiosInstance } from '../lib/api';
import { getSocket, connectSocket } from '../lib/socket';

function Dashboard() {
  const [data, setData] = useState({
    metrics: null,
    pipeline: null,
    logs: [],
    alerts: [],
    containers: [],
  });

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const socket = connectSocket(token);

    // Subscribe to all real-time events
    socket.emit('subscribe:metrics');
    socket.emit('subscribe:pipeline');
    socket.emit('subscribe:logs');
    socket.emit('subscribe:alerts');
    socket.emit('subscribe:docker-monitor');

    // Listen for metrics updates
    socket.on('metrics:update', (metricsData) => {
      setData(prev => ({
        ...prev,
        metrics: metricsData,
      }));
    });

    // Listen for pipeline updates
    socket.on('pipeline:update', (pipelineData) => {
      setData(prev => ({
        ...prev,
        pipeline: pipelineData,
      }));
    });

    // Listen for new alerts
    socket.on('alert:new', (alert) => {
      setData(prev => ({
        ...prev,
        alerts: [alert, ...prev.alerts].slice(0, 10),
      }));
    });

    // Initial data fetch
    fetchDashboardData();

    return () => {
      socket.off('metrics:update');
      socket.off('pipeline:update');
      socket.off('alert:new');
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [metrics, pipeline, logs, alerts, containers] = await Promise.all([
        axiosInstance.get('/metrics'),
        axiosInstance.get('/jenkins/pipeline/status'),
        axiosInstance.get('/logs?limit=10'),
        axiosInstance.get('/alerts?limit=10'),
        axiosInstance.get('/docker/containers'),
      ]);

      setData({
        metrics: metrics.data,
        pipeline: pipeline.data,
        logs: logs.data.logs,
        alerts: alerts.data.alerts,
        containers: containers.data.containers,
      });
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    }
  };

  return (
    <div className="dashboard">
      {/* Render data */}
    </div>
  );
}

export default Dashboard;
```

### 2. Jenkins Build Status Component

```javascript
// frontend/src/components/JenkinsBuildStatus.jsx

import { useEffect, useState } from 'react';
import { axiosInstance } from '../lib/api';
import { getSocket } from '../lib/socket';

function JenkinsBuildStatus() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const socket = getSocket();
    
    // Subscribe to Jenkins status updates
    socket.emit('subscribe:jenkins-status');
    socket.on('jenkins:status-update', (data) => {
      setStatus(data);
    });

    // Initial fetch
    fetchStatus();

    return () => {
      socket.off('jenkins:status-update');
    };
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await axiosInstance.get('/jenkins/pipeline/status');
      setStatus(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch Jenkins status:', error);
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!status) return <div>No status available</div>;

  return (
    <div className="jenkins-status">
      <h2>Pipeline Status: {status.status}</h2>
      <p>Build #: {status.buildNumber}</p>
      {status.inProgress && (
        <div className="progress">
          <div style={{ width: `${status.progress}%` }}>
            {status.progress}%
          </div>
        </div>
      )}
    </div>
  );
}

export default JenkinsBuildStatus;
```

### 3. Real-Time Logs Component

```javascript
// frontend/src/components/RealTimeLogs.jsx

import { useEffect, useState } from 'react';
import { axiosInstance } from '../lib/api';
import { getSocket } from '../lib/socket';

function RealTimeLogs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const socket = getSocket();

    // Subscribe to log updates
    socket.emit('subscribe:logs');
    socket.on('log:new', (newLog) => {
      setLogs(prev => [newLog, ...prev].slice(0, 100));
    });

    // Initial load
    fetchLogs();

    return () => {
      socket.off('log:new');
    };
  }, []);

  const fetchLogs = async () => {
    try {
      const response = await axiosInstance.get('/logs?limit=50');
      setLogs(response.data.logs || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  return (
    <div className="logs-container">
      {logs.map(log => (
        <div key={log._id} className={`log-entry log-${log.logType}`}>
          <span className="timestamp">
            {new Date(log.timestamp).toLocaleTimeString()}
          </span>
          <span className="source">[{log.source}]</span>
          <span className="message">{log.message}</span>
        </div>
      ))}
    </div>
  );
}

export default RealTimeLogs;
```

### 4. Alerts Component

```javascript
// frontend/src/components/AlertsPanel.jsx

import { useEffect, useState } from 'react';
import { axiosInstance } from '../lib/api';
import { getSocket } from '../lib/socket';

function AlertsPanel() {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const socket = getSocket();

    // Subscribe to alert updates
    socket.emit('subscribe:alerts');
    socket.on('alert:new', (newAlert) => {
      setAlerts(prev => [newAlert, ...prev].slice(0, 20));
    });

    socket.on('alert:resolved', (alertId) => {
      setAlerts(prev =>
        prev.map(alert =>
          alert._id === alertId ? { ...alert, resolved: true } : alert
        )
      );
    });

    // Initial load
    fetchAlerts();

    return () => {
      socket.off('alert:new');
      socket.off('alert:resolved');
    };
  }, []);

  const fetchAlerts = async () => {
    try {
      const response = await axiosInstance.get('/alerts?limit=20');
      setAlerts(response.data.alerts || []);
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  };

  const resolveAlert = async (alertId) => {
    try {
      await axiosInstance.post(`/alerts/${alertId}/resolve`);
      setAlerts(prev =>
        prev.map(alert =>
          alert._id === alertId ? { ...alert, resolved: true } : alert
        )
      );
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    }
  };

  return (
    <div className="alerts-panel">
      <h2>Alerts ({alerts.filter(a => !a.resolved).length})</h2>
      {alerts.map(alert => (
        <div key={alert._id} className={`alert alert-${alert.severity}`}>
          <div className="alert-header">
            <span className="type">{alert.type}</span>
            <span className="severity">{alert.severity}</span>
          </div>
          <div className="alert-body">
            <h3>{alert.title}</h3>
            <p>{alert.message}</p>
          </div>
          {!alert.resolved && (
            <button onClick={() => resolveAlert(alert._id)}>Resolve</button>
          )}
        </div>
      ))}
    </div>
  );
}

export default AlertsPanel;
```

### 5. Container Status Component

```javascript
// frontend/src/components/ContainerStatus.jsx

import { useEffect, useState } from 'react';
import { axiosInstance } from '../lib/api';
import { getSocket } from '../lib/socket';

function ContainerStatus() {
  const [containers, setContainers] = useState([]);

  useEffect(() => {
    const socket = getSocket();

    // Subscribe to container updates
    socket.emit('subscribe:docker-monitor');
    socket.on('docker:container-update', (data) => {
      setContainers(prev =>
        prev.map(c => (c.Id === data.Id ? data : c)).concat(
          prev.find(c => c.Id === data.Id) ? [] : [data]
        )
      );
    });

    // Subscribe to container stats
    socket.emit('subscribe:docker-stats');
    socket.on('docker:stats-update', (stats) => {
      setContainers(prev =>
        prev.map(c =>
          c.Id === stats.containerId ? { ...c, stats } : c
        )
      );
    });

    // Initial load
    fetchContainers();

    return () => {
      socket.off('docker:container-update');
      socket.off('docker:stats-update');
    };
  }, []);

  const fetchContainers = async () => {
    try {
      const response = await axiosInstance.get('/docker/containers');
      setContainers(response.data.containers || []);
    } catch (error) {
      console.error('Failed to fetch containers:', error);
    }
  };

  return (
    <div className="containers-panel">
      <h2>Docker Containers</h2>
      {containers.map(container => (
        <div key={container.Id} className="container-card">
          <div className="container-name">
            {container.Names?.[0] || container.Name || 'Unknown'}
          </div>
          <div className="container-status">
            <span className={`status ${container.State}`}>
              {container.State}
            </span>
          </div>
          {container.stats && (
            <div className="container-stats">
              <span>CPU: {container.stats.cpuPercent}</span>
              <span>Memory: {container.stats.memoryPercent}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default ContainerStatus;
```

## Environment Variables

### Frontend `.env.local`

```
VITE_API_URL=http://localhost:5000
VITE_WEBSOCKET_URL=ws://localhost:5000

# Firebase
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

## Testing Components

### Test Real-Time Updates

```javascript
// Test component to verify Socket.io updates
import { useEffect, useState } from 'react';
import { getSocket } from '../lib/socket';

function SocketTest() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const socket = getSocket();

    // Listen for all events
    socket.on('metrics:update', (data) => {
      setEvents(prev => [
        ...prev,
        { type: 'metrics', data, time: new Date().toLocaleTimeString() },
      ]);
    });

    socket.on('pipeline:update', (data) => {
      setEvents(prev => [
        ...prev,
        { type: 'pipeline', data, time: new Date().toLocaleTimeString() },
      ]);
    });

    return () => {
      socket.off('metrics:update');
      socket.off('pipeline:update');
    };
  }, []);

  return (
    <div>
      <h2>Socket.io Events</h2>
      {events.map((event, i) => (
        <div key={i}>
          <strong>{event.type}</strong> - {event.time}
          <pre>{JSON.stringify(event.data, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}

export default SocketTest;
```

## Verification Checklist

- [ ] API base URL correctly configured
- [ ] Socket.io WebSocket URL correctly configured
- [ ] Auth token properly included in API requests
- [ ] Socket.io authentication token passed
- [ ] Components subscribe to Socket.io events
- [ ] Real-time updates received and displayed
- [ ] Dashboard renders with live data
- [ ] Alerts appear in real-time
- [ ] Logs stream in real-time
- [ ] Container status updates in real-time
- [ ] Jenkins status updates in real-time
- [ ] No console errors

## Common Issues & Solutions

### Issue: "Cannot GET /api/metrics"
- Check backend is running on correct port
- Verify VITE_API_URL environment variable
- Check CORS configuration in backend

### Issue: Socket.io connection fails
- Verify WebSocket URL is correct
- Check auth token is valid
- Verify Socket.io is initialized on backend

### Issue: Data not updating in real-time
- Check Socket.io subscriptions
- Verify event listeners are attached
- Check browser console for errors
- Verify backend is emitting events

### Issue: Firebase login not working
- Verify Firebase credentials in .env.local
- Check serviceAccountKey.json exists
- Verify Firebase project settings
