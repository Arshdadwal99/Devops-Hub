# Socket.io Testing Guide

## Setup

### Prerequisites

- Node.js 18+
- DevOps Hub backend and frontend running
- MongoDB connection active
- Jenkins accessible at http://localhost:8080

### Installation

```bash
# Install Socket.io test utilities
npm install --save-dev socket.io-client

# Backend dependencies already installed
# Frontend dependencies already installed
```

## Manual Testing

### Test 1: Socket.io Connection

**Objective:** Verify Socket.io server accepts connections with valid token

**Steps:**

1. Open browser dev console
2. Run:
```javascript
// Check backend is running
fetch('http://localhost:5000/api/health').then(r => r.json()).then(console.log);

// Check Socket.io server is accepting connections
const token = localStorage.getItem('authToken');
console.log('Token:', token ? 'Present' : 'Missing');
```

3. Navigate to dashboard
4. Check browser console for: `✅ [Socket] Connected: socket-id-xxx`

**Expected Result:** ✅ Connection established successfully

---

### Test 2: Jenkins Build Event Emission

**Objective:** Verify Jenkins build events are emitted correctly

**Steps:**

1. Open dashboard dev console
2. Trigger a webhook push:
```bash
# In terminal, run webhook test
cd backend
npm run test:webhook
```

3. Monitor console for events:
```
📢 [Socket] Jenkins build started: {buildNumber: 1, jobName: "devops-hub-deploy", ...}
📢 [Socket] Jenkins build progress: {buildNumber: 1, progress: 25, currentStage: "Build"}
📢 [Socket] Jenkins build completed: {buildNumber: 1, status: "SUCCESS", ...}
```

4. Dashboard should update without page refresh

**Expected Result:** ✅ All Jenkins events received and dashboard updated

---

### Test 3: Deployment Event Stream

**Objective:** Verify complete deployment event sequence

**Steps:**

1. Enable debug logging in dashboard
2. Trigger automatic deployment via webhook
3. Monitor browser console for complete event sequence:

```
✅ Webhook received
📢 Deployment started
📢 Deployment progress (build-complete, 20%)
📢 Deployment progress (docker-build, 40%)
📢 Deployment progress (docker-push, 55%)
📢 Deployment progress (cleanup, 75%)
📢 Deployment progress (container-start, 90%)
📢 Deployment succeeded (100%)
```

4. Verify deployment record created in MongoDB
5. Check Docker container is running

**Expected Result:** ✅ All deployment stages completed successfully

---

### Test 4: Alert Event Handling

**Objective:** Verify alert events are created and transmitted

**Steps:**

1. Trigger a failure scenario (e.g., invalid Docker build)
2. Monitor alerts panel for new alert
3. Check console: `📢 [Socket] New alert: {type: "...", severity: "..."}`
4. Click resolve on alert
5. Verify alert disappears from list

**Expected Result:** ✅ Alerts displayed and updated in real-time

---

### Test 5: Channel Subscriptions

**Objective:** Verify clients can subscribe/unsubscribe from channels

**Steps:**

1. Open dev console
2. Access Socket.io context:
```javascript
// After SocketProvider is loaded
// You can inspect window.__socketData if exposed
```

3. Verify subscriptions:
```javascript
// Check active subscriptions by monitoring emitted subscribe events
// Should see: 📡 [Socket] Subscribing to: metrics, alerts, pipeline, etc.
```

**Expected Result:** ✅ All subscriptions active and logging

---

### Test 6: Real-time Metrics Updates

**Objective:** Verify metrics are updated in real-time

**Steps:**

1. Open Monitoring dashboard
2. Observe metrics panel (CPU, Memory, Disk)
3. Check console for: `📢 [Socket] Metrics update: {cpu: 45.2, ...}`
4. Verify metrics update every 5 seconds
5. CPU usage should reflect system load

**Expected Result:** ✅ Metrics updating in real-time

---

### Test 7: Container Status Updates

**Objective:** Verify container status changes are broadcast

**Steps:**

1. Start/stop containers manually:
```bash
docker start/stop <container-id>
```

2. Monitor dashboard for status changes
3. Check console: `📢 [Socket] Container status change: {status: "running"|"stopped"}`

**Expected Result:** ✅ Container status updates reflected immediately

---

### Test 8: Disconnection & Reconnection

**Objective:** Verify Socket.io handles disconnections gracefully

**Steps:**

1. Open dashboard
2. In dev console, close connection:
```javascript
// Find socket instance and disconnect
// or refresh page
```

3. Observe: `❌ [Socket] Disconnected`
4. Dashboard shows "Connecting..." state
5. Wait 5 seconds for automatic reconnection
6. Observe: `✅ [Socket] Connected: new-socket-id`

**Expected Result:** ✅ Automatic reconnection within 10 seconds

---

### Test 9: Authentication Token Validation

**Objective:** Verify only authenticated users can connect

**Steps:**

1. Clear localStorage: `localStorage.removeItem('authToken')`
2. Refresh page
3. Navigate to login
4. Check console: `⚠️ [Socket] No token provided, cannot connect`
5. Login with valid credentials
6. Verify Socket.io connects
7. Inspect auth header: `socket.io.auth.token` should equal authToken

**Expected Result:** ✅ Socket connection blocked without token

---

## Automated Testing

### Unit Tests for socketEventsService.js

```javascript
// backend/src/services/__tests__/socketEventsService.test.js

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as socketEventsService from '../socketEventsService.js';

describe('Socket Events Service', () => {
  let mockIo;
  
  beforeEach(() => {
    mockIo = {
      to: vi.fn().mockReturnThis(),
      emit: vi.fn(),
      engine: { clientsCount: 5 }
    };
    socketEventsService.initializeSocketEvents(mockIo);
  });
  
  it('should initialize Socket.io', () => {
    expect(socketEventsService.getSocketIOInstance()).toBe(mockIo);
  });
  
  it('should emit Jenkins build started event', () => {
    socketEventsService.emitJenkinsBuildStarted({
      buildNumber: 42,
      jobName: 'test-job'
    });
    
    expect(mockIo.to).toHaveBeenCalledWith('jenkins-builds');
    expect(mockIo.emit).toHaveBeenCalled();
  });
  
  it('should emit deployment started event', () => {
    socketEventsService.emitDeploymentStarted({
      deploymentId: 'dep-123',
      buildNumber: 42
    });
    
    expect(mockIo.to).toHaveBeenCalledWith('pipeline');
  });
  
  it('should emit alert event', () => {
    socketEventsService.emitNewAlert({
      _id: 'alert-123',
      type: 'deployment_failure'
    });
    
    expect(mockIo.to).toHaveBeenCalledWith('alerts');
  });
});
```

### Integration Tests

```javascript
// backend/tests/socket.integration.test.js

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import io from 'socket.io-client';
import { start as startServer, stop as stopServer } from '../server.js';

describe('Socket.io Integration', () => {
  let serverInstance;
  let client;
  const token = 'test-token-valid';
  
  beforeAll(async () => {
    serverInstance = await startServer();
  });
  
  afterAll(async () => {
    await stopServer(serverInstance);
  });
  
  it('should establish Socket.io connection with valid token', (done) => {
    client = io('http://localhost:5000', {
      auth: { token },
      reconnection: false
    });
    
    client.on('connect', () => {
      expect(client.connected).toBe(true);
      done();
    });
  });
  
  it('should reject connection without token', (done) => {
    const invalidClient = io('http://localhost:5000', {
      reconnection: false
    });
    
    invalidClient.on('connect_error', (error) => {
      expect(error.message).toContain('Authentication');
      done();
    });
  });
  
  it('should receive jenkins:build-started event', (done) => {
    client.on('jenkins:build-started', (data) => {
      expect(data.buildNumber).toBe(42);
      expect(data.jobName).toBe('test-job');
      done();
    });
    
    // Emit event from server side
    // (simulated)
  });
});
```

## Performance Testing

### Test 10: Event Throughput

**Objective:** Measure max events per second

**Steps:**

```bash
# Create test script
cat > backend/tests/load-test.js << 'EOF'
import io from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: 'test-token' },
  reconnection: false
});

let eventCount = 0;
const startTime = Date.now();

socket.on('metrics:update', () => {
  eventCount++;
});

setTimeout(() => {
  const duration = (Date.now() - startTime) / 1000;
  const throughput = eventCount / duration;
  console.log(`Events per second: ${throughput.toFixed(2)}`);
  process.exit(0);
}, 10000);
EOF

node backend/tests/load-test.js
```

**Expected Result:** ✅ > 100 events/sec per client

---

### Test 11: Memory Usage

**Objective:** Monitor memory with multiple connections

**Steps:**

```bash
# Monitor memory while running
node --inspect backend/tests/stress-test.js

# In another terminal
node --inspect backend/tests/create-connections.js 100
# (creates 100 concurrent connections)

# Use Chrome DevTools to monitor memory
chrome://inspect
```

**Expected Result:** ✅ < 100MB per 100 connections

---

## Debugging

### Enable Verbose Logging

```javascript
// In browser console
localStorage.setItem('DEBUG', 'socket.io-client:*');
// Refresh page

// Or add to useSocket.js
if (process.env.NODE_ENV === 'development') {
  enableDebug = true;
}
```

### Monitor Network Traffic

1. Open DevTools → Network tab
2. Filter by "socket.io"
3. Check WebSocket messages
4. Monitor payload sizes

### Server-side Logging

```javascript
// In socketEventsService.js
process.env.DEBUG = 'socket.io:*';

// Or enable in server start
export const startServer = async () => {
  // ... 
  io.engine.on('initial_headers', (headers, req) => {
    console.log(`[Socket] Headers:`, headers);
  });
};
```

## Test Results Template

```markdown
## Socket.io Test Results - [DATE]

### Connection Tests
- [ ] Test 1: Connection ✅
- [ ] Test 2: Jenkins Events ✅
- [ ] Test 3: Deployment Events ✅

### Functionality Tests
- [ ] Test 4: Alerts ✅
- [ ] Test 5: Subscriptions ✅
- [ ] Test 6: Metrics ✅
- [ ] Test 7: Containers ✅

### Resilience Tests
- [ ] Test 8: Reconnection ✅
- [ ] Test 9: Authentication ✅

### Performance
- [ ] Test 10: Throughput ✅ (150 events/sec)
- [ ] Test 11: Memory ✅ (45MB per 100 connections)

### Summary
All tests passed. No critical issues found.
```

## CI/CD Integration

### GitHub Actions Test

```yaml
# .github/workflows/socket-io-tests.yml
name: Socket.io Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:latest
      jenkins:
        image: jenkins/jenkins:latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run test:socket-io
      - run: npm run test:integration:socket-io
```

## Reporting Issues

When Socket.io issues occur, collect:

1. **Browser Console Logs**
   ```javascript
   copy(console.logs);
   ```

2. **Network Traffic**
   - Export HAR file from DevTools
   - Include WebSocket frames

3. **Server Logs**
   ```bash
   docker logs devops-hub-backend | grep -i socket
   ```

4. **System Info**
   - Node version
   - Browser version
   - OS
   - Network conditions

5. **Reproduction Steps**
   - Exact steps to reproduce
   - Expected vs actual behavior
   - Screenshots/videos if helpful
