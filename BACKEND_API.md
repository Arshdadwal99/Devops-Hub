# DevOps Hub Backend - Production API Documentation

## Overview

Complete production-ready backend for DevOps Hub with real-time monitoring, CI/CD integration, container management, and AI-powered log analysis.

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas (cloud) or MongoDB local
- Jenkins (for CI/CD)
- Docker (for container management)
- Firebase Admin credentials

### Installation

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend                            │
│           (Firebase Auth + Real-time Updates)               │
└──────────────────────┬──────────────────────────────────────┘
                       │ Socket.io / REST API
┌──────────────────────▼──────────────────────────────────────┐
│                   Express.js Server                          │
├─────────────────────────────────────────────────────────────┤
│ ✅ Auth Verification      ✅ Real-time Socket.io             │
│ ✅ Rate Limiting          ✅ Error Handling                  │
│ ✅ Logging                ✅ CORS Protection                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
      ┌────────────────┼────────────────┐
      │                │                │
      ▼                ▼                ▼
  MongoDB           Jenkins           Docker
  Deployment        Pipelines         Containers
  Alerts            Build Status      Metrics
  Logs              History           Stats
```

## API Endpoints

### Authentication (Public)

#### Verify Firebase Token
```
GET /api/health
```

### Dashboard

#### Get Complete Dashboard Data
```
GET /api/dashboard
Authorization: Bearer <token>

Response:
{
  "status": "healthy",
  "timestamp": "2026-05-05T10:00:00Z",
  "metrics": {
    "cpu": 45,
    "memory": 63,
    "disk": 28,
    "uptime": 123456,
    "latency": 138,
    "containers": {
      "running": 8,
      "stopped": 2,
      "failed": 0,
      "total": 10
    }
  },
  "pipeline": {
    "status": "SUCCESS",
    "progress": 100,
    "lastBuild": {...},
    "lastCompleted": {...}
  },
  "docker": {
    "containers": 10,
    "running": 8,
    "stopped": 2
  },
  "recentPipelines": [...],
  "recentLogs": [...]
}
```

### Metrics

#### Get Current Metrics
```
GET /api/metrics
Authorization: Bearer <token>

Response:
{
  "cpu": 45.5,
  "memory": 63.2,
  "disk": 28.1,
  "uptime": 123456,
  "latency": 138,
  "containerCount": 10,
  "containerHealth": {
    "running": 8,
    "stopped": 2,
    "failed": 0
  },
  "systemLoad": {
    "load1": 2.5,
    "load5": 2.1,
    "load15": 1.8
  }
}
```

#### Get Metrics History
```
GET /api/metrics/history?duration=3600000
Authorization: Bearer <token>

Query Parameters:
- duration: milliseconds (default: 1 hour)

Response:
{
  "success": true,
  "history": [
    {
      "time": "10:00",
      "cpu": 45,
      "memory": 63,
      "disk": 28,
      "containers": 10
    },
    ...
  ],
  "count": 60
}
```

### Pipeline

#### Get Pipeline Status
```
GET /api/dashboard/pipeline
Authorization: Bearer <token>

Response:
{
  "success": true,
  "status": "RUNNING",
  "progress": 65,
  "lastBuild": {
    "number": 45,
    "status": "RUNNING",
    "url": "http://jenkins:8080/job/devops-hub-deploy/45"
  },
  "lastCompletedBuild": {
    "number": 44,
    "status": "SUCCESS",
    "duration": 120000,
    "timestamp": "2026-05-05T09:30:00Z"
  }
}
```

#### Get Build History
```
GET /api/dashboard/pipeline/builds?limit=10
Authorization: Bearer <token>

Response:
{
  "success": true,
  "builds": [
    {
      "number": 45,
      "status": "SUCCESS",
      "duration": 125000,
      "timestamp": "2026-05-05T10:00:00Z",
      "url": "..."
    },
    ...
  ],
  "count": 10
}
```

#### Get Last Successful Build
```
GET /api/dashboard/pipeline/last-successful
Authorization: Bearer <token>

Response:
{
  "success": true,
  "number": 44,
  "status": "SUCCESS",
  "duration": 120000,
  "timestamp": "2026-05-05T09:30:00Z",
  "commitHash": "abc123def456",
  "author": "john-dev"
}
```

### Containers

#### Get All Containers
```
GET /api/dashboard/containers
Authorization: Bearer <token>

Response:
{
  "success": true,
  "containers": [
    {
      "ID": "abc123...",
      "Names": ["/api-green"],
      "Image": "gcr.io/project/api:v1.4.2",
      "State": "running",
      "Status": "Up 2 hours",
      "Ports": [...],
      "SizeRw": 1024,
      "SizeRootFs": 2048
    },
    ...
  ],
  "total": 10
}
```

#### Get Docker Info
```
GET /api/dashboard/docker-info
Authorization: Bearer <token>

Response:
{
  "success": true,
  "info": {
    "containers": 10,
    "containersPaused": 0,
    "containersRunning": 8,
    "containersStopped": 2,
    "images": 25,
    "serverVersion": "24.0.0",
    "osType": "linux",
    "architecture": "x86_64"
  }
}
```

### Deployments

#### Deploy New Version
```
POST /api/deployments/deploy
Authorization: Bearer <token>

Body:
{
  "containerName": "api-server",
  "image": "gcr.io/project/api:v1.4.3",
  "version": "v1.4.3",
  "ports": ["8080:8080"],
  "env": ["NODE_ENV=production", "LOG_LEVEL=info"],
  "volumes": ["/data:/app/data"]
}

Response:
{
  "success": true,
  "deployment": {
    "_id": "...",
    "version": "v1.4.3",
    "status": "success",
    "duration": 45000,
    "logs": [...]
  },
  "logs": [
    "[2026-05-05T10:00:00Z] Starting deployment...",
    "[2026-05-05T10:00:05Z] Stopping old container...",
    ...
  ]
}
```

#### Restart Container
```
POST /api/deployments/restart
Authorization: Bearer <token>

Body:
{
  "containerName": "api-server"
}

Response:
{
  "success": true,
  "container": {
    "name": "api-server",
    "status": "running"
  },
  "logs": [...]
}
```

#### Rollback to Previous Version
```
POST /api/deployments/rollback
Authorization: Bearer <token>

Body:
{
  "containerName": "api-server",
  "previousVersion": "v1.4.2"
}

Response:
{
  "success": true,
  "deployment": {
    "_id": "...",
    "version": "v1.4.2",
    "status": "success",
    "deploymentType": "rollback",
    "logs": [...]
  }
}
```

#### Get Deployment History
```
GET /api/deployments?limit=20&skip=0&status=success
Authorization: Bearer <token>

Query Parameters:
- limit: number of results (default: 20)
- skip: number of results to skip (default: 0)
- status: filter by status (success, failed, in-progress, rolled-back)

Response:
{
  "success": true,
  "deployments": [...],
  "total": 150,
  "count": 20
}
```

### Alerts

#### Get Alerts
```
GET /api/alerts?severity=critical&resolved=false&limit=50
Authorization: Bearer <token>

Query Parameters:
- severity: info, warning, critical
- resolved: true/false
- type: deployment_failed, cpu_high, memory_high, etc.
- limit: number of results (default: 50)
- skip: number of results to skip

Response:
{
  "success": true,
  "alerts": [
    {
      "_id": "...",
      "type": "cpu_high",
      "severity": "warning",
      "title": "High CPU Usage: 87%",
      "message": "CPU usage has exceeded safe threshold...",
      "resourceType": "system",
      "resolved": false,
      "createdAt": "2026-05-05T10:00:00Z"
    },
    ...
  ],
  "total": 15,
  "count": 15
}
```

#### Get Alert Statistics
```
GET /api/alerts/stats
Authorization: Bearer <token>

Response:
{
  "success": true,
  "total": 150,
  "critical": 5,
  "warning": 12,
  "info": 133,
  "unresolved": 8
}
```

#### Resolve Alert
```
PUT /api/alerts/{alertId}/resolve
Authorization: Bearer <token>

Body:
{
  "action": "Increased memory allocation"
}

Response:
{
  "success": true,
  "alert": {
    "_id": "...",
    "resolved": true,
    "resolvedAt": "2026-05-05T11:00:00Z",
    "action": "Increased memory allocation"
  }
}
```

#### Delete Alert
```
DELETE /api/alerts/{alertId}
Authorization: Bearer <token>

Response:
{
  "success": true,
  "deletedId": "..."
}
```

### Logs

#### Get Logs
```
GET /api/dashboard/logs?type=error&limit=50&skip=0
Authorization: Bearer <token>

Query Parameters:
- type: info, warning, error, debug
- source: jenkins, docker, deployment, application, system
- limit: number of results
- skip: skip results

Response:
{
  "success": true,
  "logs": [
    {
      "_id": "...",
      "source": "jenkins",
      "logType": "error",
      "message": "Build failed: Test suite failed",
      "buildNumber": 45,
      "timestamp": "2026-05-05T10:00:00Z"
    },
    ...
  ],
  "total": 500,
  "count": 50
}
```

### AI Log Analysis

#### Analyze Logs
```
POST /api/analyze/logs
Authorization: Bearer <token>

Body:
{
  "logs": [
    "2026-05-05 10:00:00 ERROR: Connection timeout",
    "2026-05-05 10:00:05 WARNING: Retry attempt 1/3",
    "..."
  ]
}

Response:
{
  "success": true,
  "analysis": {
    "failure_probability": 75,
    "severity": "High",
    "root_cause": "Network connectivity issues",
    "explanation": "Pattern-based analysis detected connection timeout errors...",
    "suggested_fixes": [
      "Check network connectivity",
      "Verify DNS resolution",
      "Review firewall rules",
      ...
    ],
    "affected_stage": "integration",
    "confidence": 85
  },
  "patterns": {
    "errors": ["Connection timeout"],
    "warnings": ["Retry attempt"],
    "network": ["Connection timeout"],
    ...
  }
}
```

## Real-Time Updates (Socket.io)

### Connection
```javascript
import io from 'socket.io-client';

const socket = io('ws://localhost:5000', {
  auth: {
    token: firebaseIdToken
  }
});

socket.on('connect', () => {
  console.log('Connected to backend');
});
```

### Subscribe to Metrics
```javascript
socket.emit('subscribe:metrics');

socket.on('metrics:update', (metrics) => {
  console.log('Updated metrics:', metrics);
  // {
  //   cpu: 45,
  //   memory: 63,
  //   disk: 28,
  //   ...
  // }
});
```

### Subscribe to Alerts
```javascript
socket.emit('subscribe:alerts');

socket.on('alerts:new', (alerts) => {
  console.log('New alerts:', alerts);
});
```

### Subscribe to Pipeline Updates
```javascript
socket.emit('subscribe:pipeline');

socket.on('pipeline:update', (pipelineData) => {
  console.log('Pipeline updated:', pipelineData);
});
```

### Subscribe to Logs
```javascript
socket.emit('subscribe:logs');

socket.on('logs:new', (log) => {
  console.log('New log:', log);
});
```

## Database Models

### User
```javascript
{
  _id: ObjectId,
  email: String,
  name: String,
  firebaseUid: String,
  authProvider: String,
  createdAt: Date,
  updatedAt: Date
}
```

### Pipeline
```javascript
{
  _id: ObjectId,
  userId: String,
  status: String, // running, success, failed, pending
  progress: Number, // 0-100
  lastCommit: {
    hash: String,
    message: String,
    author: String,
    timestamp: Date
  },
  stages: Array,
  buildNumber: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### Deployment
```javascript
{
  _id: ObjectId,
  userId: String,
  version: String,
  status: String, // in-progress, success, failed, rolled-back
  deploymentType: String, // manual, auto, rollback
  containers: Array,
  logs: Array,
  startTime: Date,
  endTime: Date,
  duration: Number,
  createdAt: Date
}
```

### Alert
```javascript
{
  _id: ObjectId,
  userId: String,
  type: String,
  severity: String, // info, warning, critical
  title: String,
  message: String,
  resourceType: String,
  resolved: Boolean,
  createdAt: Date
}
```

### Metrics
```javascript
{
  _id: ObjectId,
  userId: String,
  timestamp: Date,
  cpu: Number,
  memory: Number,
  disk: Number,
  network: {
    incoming: Number,
    outgoing: Number
  },
  containerHealth: {
    running: Number,
    stopped: Number,
    failed: Number
  }
}
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/devops-dashboard
CLIENT_ORIGIN=http://localhost:3000,https://yourdomain.com
JWT_SECRET=your-super-secret-key
FIREBASE_PROJECT_ID=your-firebase-project
JENKINS_URL=http://jenkins:8080
JENKINS_TOKEN=your-jenkins-token
JENKINS_JOB_NAME=devops-hub-deploy
DOCKER_HOST=unix:///var/run/docker.sock
GITHUB_WEBHOOK_SECRET=your-github-secret
OPENAI_API_KEY=your-openai-key
```

## Error Handling

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Error message",
  "message": "Error message (alternative)"
}
```

Common HTTP Status Codes:
- `200`: Success
- `400`: Bad Request
- `401`: Unauthorized
- `404`: Not Found
- `500`: Server Error
- `503`: Service Unavailable (DB issue)

## Performance Optimization

- Metrics are cached for 5 seconds to reduce system load
- Database TTL indexes automatically purge old data:
  - Metrics: 30 days
  - Logs: 90 days
  - Traffic: 7 days
- Real-time metrics collected every 10 seconds
- Connection pooling for MongoDB
- Docker stats limited to running containers

## Security

- ✅ Firebase token verification on all protected routes
- ✅ CORS protection with configurable origins
- ✅ JWT tokens for optional backend authentication
- ✅ GitHub webhook verification using HMAC signature
- ✅ No sensitive data in logs
- ✅ Environment variables for all secrets

## Monitoring & Debugging

### Enable Verbose Logging
```bash
NODE_ENV=development npm run dev
```

### Check Database Connection
```bash
curl http://localhost:5000/api/health
```

### Monitor Metrics Collection
The server logs metrics every 10 seconds:
```
📊 [Metrics] Gathering system metrics...
✅ [Metrics] CPU: 45%, Memory: 63%, Containers: 8/10
```

## Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "start"]
```

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Update `MONGODB_URI` to Atlas
- [ ] Configure `CLIENT_ORIGIN` for your domain
- [ ] Set secure `JWT_SECRET`
- [ ] Configure Jenkins integration
- [ ] Set Firebase project ID
- [ ] Configure GitHub webhooks
- [ ] Enable HTTPS in frontend
- [ ] Set up Docker daemon access
- [ ] Configure AWS credentials if needed
- [ ] Set up monitoring/logging

## Support & Troubleshooting

See [TROUBLESHOOTING.md](../TROUBLESHOOTING.md) for common issues.
