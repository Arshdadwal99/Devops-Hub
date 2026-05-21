# Socket.io Quick Reference Guide

## Quick Start

### 1. Initialize Socket.io Server

Already done in `server.js`. Socket.io server is initialized with CORS configuration.

### 2. Wrap App with Socket Provider

```jsx
// App.jsx
import { SocketProvider } from "./lib/SocketContext";

<SocketProvider token={token}>
  <YourApp />
</SocketProvider>
```

### 3. Use Socket in Components

```jsx
import { useSocketContext } from "../lib/SocketContext";

function MyComponent() {
  const socket = useSocketContext();
  
  // Check connection
  if (!socket?.isConnected) return <div>Connecting...</div>;
  
  // Subscribe to updates
  useEffect(() => {
    socket.subscribe("alerts");
  }, [socket]);
  
  // Display data
  return (
    <div>
      {socket.data.alerts?.map(alert => (
        <div key={alert.alertId}>{alert.title}</div>
      ))}
    </div>
  );
}
```

## Event Reference

### Backend Event Emission

```javascript
// Jenkins Service
import { emitJenkinsBuildStarted, emitJenkinsBuildCompleted } from "./socketEventsService.js";

emitJenkinsBuildStarted({ buildNumber, jobName, branch, commit, author });
emitJenkinsBuildCompleted({ buildNumber, jobName, status, result, duration });

// Deployment Service
import { emitDeploymentStarted, emitDeploymentProgress, emitDeploymentSucceeded, emitDeploymentFailed } from "./socketEventsService.js";

emitDeploymentStarted({ deploymentId, buildNumber, version, containerName });
emitDeploymentProgress({ deploymentId, stage, status, message, progress });
emitDeploymentSucceeded({ deploymentId, buildNumber, version, duration, imageTag });
emitDeploymentFailed({ deploymentId, buildNumber, version, error, failedStage });

// Alert Service
import { emitNewAlert, emitAlertResolved } from "./socketEventsService.js";

emitNewAlert({ _id, type, severity, title, message, resourceType, resourceId });
emitAlertResolved(alertId);
```

### Frontend Event Reception

```javascript
// In useSocket hook
socket.on("jenkins:build-started", (buildData) => {...});
socket.on("jenkins:build-completed", (buildData) => {...});
socket.on("deployment:started", (deploymentData) => {...});
socket.on("deployment:progress", (progressData) => {...});
socket.on("deployment:succeeded", (deploymentData) => {...});
socket.on("deployment:failed", (deploymentData) => {...});
socket.on("alert:new", (alertData) => {...});
socket.on("alert:resolved", (alertData) => {...});
```

## Channel Subscriptions

```javascript
// Subscribe to channels
socket.subscribe("metrics");
socket.subscribe("jenkins-builds");
socket.subscribe("alerts");
socket.subscribe("logs");
socket.subscribe("pipeline");
socket.subscribe("docker-monitor");
socket.subscribe("docker-stats");
```

## Real-time Data Structure

```javascript
socket.data = {
  // Jenkins
  jenkinsBuildStarted: {buildNumber, jobName, status, timestamp, branch, commit, author},
  jenkinsBuildCompleted: {buildNumber, jobName, status, result, duration, logSummary, artifacts},
  jenkinsBuildProgress: {buildNumber, jobName, progress, currentStage},
  
  // Deployment
  deploymentStarted: {deploymentId, buildNumber, version, containerName},
  deploymentProgress: {deploymentId, stage, status, message, progress},
  deploymentSucceeded: {deploymentId, buildNumber, version, duration, imageTag},
  deploymentFailed: {deploymentId, buildNumber, version, error, failedStage},
  
  // Alerts
  alerts: [{alertId, type, severity, title, message, resourceType, resourceId}, ...],
  
  // Logs
  logs: [{source, level, message, timestamp}, ...],
  
  // Metrics
  metrics: {cpu, memory, disk, network, uptime},
  
  // Pipeline
  pipelineStatus: {status, stage, progress, buildNumber, deploymentId},
  
  // Containers
  containerStatus: [{containerId, containerName, status, cpu, memory}, ...]
}
```

## Common Patterns

### 1. Real-time Build Monitor

```jsx
function BuildStatus() {
  const socket = useSocketContext();
  
  return (
    <div>
      {socket?.data?.jenkinsBuildStarted && (
        <div className="animate-pulse">🟡 Build Running...</div>
      )}
      {socket?.data?.jenkinsBuildCompleted?.status === "SUCCESS" && (
        <div className="text-green-600">✅ Build Success</div>
      )}
      {socket?.data?.jenkinsBuildCompleted?.status === "FAILURE" && (
        <div className="text-red-600">❌ Build Failed</div>
      )}
    </div>
  );
}
```

### 2. Deployment Progress Bar

```jsx
function DeploymentProgress() {
  const socket = useSocketContext();
  const progress = socket?.data?.deploymentProgress?.progress || 0;
  
  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className="bg-blue-600 h-2 rounded-full transition-all"
        style={{ width: `${progress}%` }}
      ></div>
    </div>
  );
}
```

### 3. Alert Notifications

```jsx
function Alerts() {
  const socket = useSocketContext();
  
  return (
    <div className="space-y-2">
      {socket?.data?.alerts?.map(alert => (
        <div key={alert.alertId} className={getSeverityClass(alert.severity)}>
          <strong>{alert.title}</strong>
          <p>{alert.message}</p>
        </div>
      ))}
    </div>
  );
}
```

### 4. System Metrics Display

```jsx
function Metrics() {
  const socket = useSocketContext();
  const m = socket?.data?.metrics;
  
  return (
    <div className="grid grid-cols-4 gap-4">
      <Metric label="CPU" value={`${m?.cpu?.toFixed(1)}%`} />
      <Metric label="Memory" value={`${m?.memory?.toFixed(1)}%`} />
      <Metric label="Disk" value={`${m?.disk?.toFixed(1)}%`} />
      <Metric label="Uptime" value={`${Math.round(m?.uptime / 3600)}h`} />
    </div>
  );
}
```

## Debugging

### Check Connection Status

```javascript
// In browser console
const socket = window.__socket; // Assuming you expose it
console.log("Connected:", socket?.isConnected);
console.log("Socket ID:", socket?.socket?.id);
console.log("Error:", socket?.error);
```

### Monitor Events

```javascript
// Add this to useSocket hook for debugging
useEffect(() => {
  if (typeof window !== 'undefined') {
    window.__socketData = data;
    console.log("[Socket] Data updated:", data);
  }
}, [data]);
```

### Test Socket Connection

```javascript
// From browser console
fetch("http://localhost:5000/api/health")
  .then(r => r.json())
  .then(data => console.log("Backend:", data));
```

## Files Modified

1. **Backend:**
   - `backend/src/services/socketEventsService.js` - NEW
   - `backend/src/server.js` - Updated (added initialization)
   - `backend/src/services/jenkinsService.js` - Updated (emit events)
   - `backend/src/services/deploymentAutomationService.js` - Updated (emit events)
   - `backend/src/services/alertService.js` - Updated (emit events)

2. **Frontend:**
   - `frontend/src/hooks/useSocket.js` - NEW
   - `frontend/src/lib/SocketContext.jsx` - NEW
   - `frontend/src/components/RealtimeDashboard.jsx` - NEW
   - `frontend/src/App.jsx` - Updated (add SocketProvider)

## Environment Variables

```env
# Frontend
VITE_SOCKET_URL=http://localhost:5000
```

## Testing

See `SOCKET_IO_TESTING.md` for comprehensive test procedures.

## Performance Tips

1. Only subscribe to needed channels
2. Unsubscribe when components unmount
3. Limit stored events (e.g., max 100 logs, 50 alerts)
4. Use debouncing for rapid updates
5. Implement virtual scrolling for large alert lists

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Socket not connecting | Check token is passed to SocketProvider |
| Events not received | Verify channel subscription and event emission |
| Memory leak | Ensure unsubscribe is called on unmount |
| High CPU usage | Reduce event emission frequency for metrics |
| Slow dashboard | Implement debouncing for frequent updates |

## Next Steps

1. Add Socket.io to more components (Dashboard, DeploymentPanel, MetricsDisplay)
2. Implement event persistence (replay recent events)
3. Add Socket.io metrics collection
4. Implement room-based subscriptions for teams
5. Add Socket.io tests to CI/CD pipeline
