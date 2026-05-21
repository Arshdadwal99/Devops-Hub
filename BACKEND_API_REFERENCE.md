# DevOps Hub Backend - Complete API Reference

## Base URL
```
http://localhost:5000/api
```

## Authentication
All protected endpoints require:
```
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

---

## 📊 Dashboard Endpoints

### Get Complete Dashboard
**GET** `/dashboard`

Returns all dashboard data: metrics, pipeline status, deployment info, logs, and alerts.

**Headers**:
```
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

**Response** (200 OK):
```json
{
  "timestamp": "2026-05-11T10:30:00Z",
  "metrics": {
    "cpu": 45.2,
    "memory": 62.1,
    "disk": 28.5,
    "network": {
      "incoming": 1024,
      "outgoing": 2048
    },
    "uptime": 86400,
    "latency": 45,
    "activeContainers": 5,
    "requestsPerHour": 1200,
    "containerCount": 8,
    "containerHealth": {
      "running": 5,
      "stopped": 2,
      "failed": 1
    }
  },
  "pipeline": {
    "workflow": "Build & Deploy",
    "buildStatus": "success",
    "deploymentStatus": "stable",
    "environment": "production",
    "progress": 100,
    "lastCommit": {
      "message": "Fix deployment issue",
      "hash": "#123",
      "author": "John Doe",
      "timestamp": "2026-05-11T10:00:00Z"
    }
  },
  "deployment": {
    "lastDeployment": { ...deployment object },
    "status": "success",
    "version": "1.0.1",
    "previousVersion": "1.0.0",
    "deploymentHistory": []
  },
  "logs": [
    {
      "timestamp": "2026-05-11T10:30:00Z",
      "message": "Deployment completed",
      "type": "info",
      "source": "jenkins"
    }
  ],
  "alerts": [
    {
      "id": "alert-id",
      "type": "cpu_high",
      "severity": "warning",
      "message": "CPU usage is at 85%",
      "timestamp": "2026-05-11T10:25:00Z"
    }
  ]
}
```

### Get Dashboard Metrics
**GET** `/dashboard/metrics`

**Response** (200 OK):
```json
{
  "cpu": 45.2,
  "memory": 62.1,
  "disk": 28.5,
  "network": { ... },
  "uptime": 86400,
  "latency": 45,
  "activeContainers": 5,
  "requestsPerHour": 1200
}
```

### Get Dashboard Pipeline
**GET** `/dashboard/pipeline-status`

**Response** (200 OK):
```json
{
  "workflow": "Build & Deploy",
  "buildStatus": "success",
  "deploymentStatus": "stable",
  "environment": "production",
  "progress": 100,
  "lastCommit": { ... }
}
```

### Get Dashboard Logs
**GET** `/dashboard/logs`

**Response** (200 OK):
```json
[
  {
    "timestamp": "2026-05-11T10:30:00Z",
    "message": "Deployment completed",
    "type": "info",
    "source": "jenkins"
  }
]
```

### Get Dashboard Alerts
**GET** `/dashboard/alerts`

**Response** (200 OK):
```json
[
  {
    "id": "alert-id",
    "type": "cpu_high",
    "severity": "warning",
    "message": "CPU usage is at 85%",
    "timestamp": "2026-05-11T10:25:00Z"
  }
]
```

### Health Check
**GET** `/dashboard/health`

No authentication required.

**Response** (200 OK):
```json
{
  "ok": true,
  "message": "Dashboard service is healthy"
}
```

---

## 🚀 Deployment Endpoints

### Deploy New Version
**POST** `/deployments/deploy`

**Request Body**:
```json
{
  "version": "1.0.1",
  "containerName": "devops-app",
  "image": "my-registry/devops-app:1.0.1",
  "environment": "production"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "deployment": {
    "_id": "deployment-id",
    "userId": "user-id",
    "version": "1.0.1",
    "status": "in-progress",
    "deploymentType": "manual",
    "startTime": "2026-05-11T10:30:00Z",
    "containers": [
      {
        "name": "devops-app",
        "image": "my-registry/devops-app:1.0.1",
        "status": "deploying"
      }
    ]
  },
  "dashboard": { ...complete dashboard data }
}
```

### Restart Containers
**POST** `/deployments/restart`

**Request Body**:
```json
{
  "containerName": "devops-app"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "dashboard": { ...complete dashboard data }
}
```

### Rollback to Previous Version
**POST** `/deployments/rollback`

**Request Body**:
```json
{
  "containerName": "devops-app",
  "previousVersion": "1.0.0",
  "reason": "Critical bug in 1.0.1"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "deployment": {
    "_id": "deployment-id",
    "version": "1.0.0",
    "status": "in-progress",
    "deploymentType": "rollback",
    "rollbackReason": "Critical bug in 1.0.1"
  },
  "dashboard": { ...complete dashboard data }
}
```

### Get Deployment History
**GET** `/deployments?limit=20&skip=0&status=success`

**Query Parameters**:
- `limit` (optional): Number of results (default: 20)
- `skip` (optional): Number to skip (default: 0)
- `status` (optional): Filter by status (success, failed, in-progress, rolled-back)

**Response** (200 OK):
```json
{
  "success": true,
  "deployments": [
    {
      "_id": "deployment-id",
      "version": "1.0.1",
      "status": "success",
      "deployedBy": "dashboard",
      "startTime": "2026-05-11T10:30:00Z",
      "endTime": "2026-05-11T10:45:00Z",
      "duration": 900000
    }
  ],
  "total": 42,
  "count": 20
}
```

### Get Specific Deployment
**GET** `/deployments/:deploymentId`

**Response** (200 OK):
```json
{
  "success": true,
  "deployment": { ...deployment object }
}
```

---

## 📊 Metrics Endpoints

### Get Current Metrics
**GET** `/metrics`

**Response** (200 OK):
```json
{
  "userId": "system",
  "timestamp": "2026-05-11T10:30:00Z",
  "cpu": 45.2,
  "memory": 62.1,
  "disk": 28.5,
  "network": {
    "incoming": 1024,
    "outgoing": 2048
  },
  "uptime": 86400,
  "latency": 45,
  "activeConnections": 128,
  "requestsPerSecond": 20,
  "containerCount": 8,
  "containerHealth": {
    "running": 5,
    "stopped": 2,
    "failed": 1
  },
  "systemLoad": {
    "load1": 2.5,
    "load5": 2.1,
    "load15": 1.8
  },
  "fromCache": false
}
```

### Get Metrics History
**GET** `/metrics/history?duration=3600000`

**Query Parameters**:
- `duration` (optional): Time range in milliseconds (default: 1 hour)

**Response** (200 OK):
```json
{
  "success": true,
  "history": [
    {
      "time": "10:30",
      "cpu": 45,
      "memory": 62,
      "disk": 28,
      "containers": 8
    }
  ],
  "count": 60
}
```

---

## 🚨 Alert Endpoints

### Get All Alerts
**GET** `/alerts?severity=warning&limit=50&skip=0`

**Query Parameters**:
- `severity` (optional): Filter by severity (info, warning, critical)
- `limit` (optional): Number of results (default: 50)
- `skip` (optional): Number to skip (default: 0)

**Response** (200 OK):
```json
{
  "success": true,
  "alerts": [
    {
      "_id": "alert-id",
      "userId": "user-id",
      "type": "cpu_high",
      "severity": "warning",
      "title": "High CPU Usage",
      "message": "CPU usage is at 85%",
      "resolved": false,
      "createdAt": "2026-05-11T10:25:00Z"
    }
  ],
  "total": 15,
  "count": 15
}
```

### Get Specific Alert
**GET** `/alerts/:alertId`

**Response** (200 OK):
```json
{
  "success": true,
  "alert": { ...alert object }
}
```

### Resolve Alert
**PUT** `/alerts/:alertId/resolve`

**Request Body**:
```json
{
  "action": "Increased server resources"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "alert": {
    "_id": "alert-id",
    "resolved": true,
    "resolvedAt": "2026-05-11T10:35:00Z",
    "action": "Increased server resources"
  }
}
```

### Delete Alert
**DELETE** `/alerts/:alertId`

**Response** (200 OK):
```json
{
  "success": true,
  "deletedId": "alert-id"
}
```

---

## 📝 Logs Endpoints

### Get System Logs
**GET** `/monitoring/logs?containerName=devops-app&limit=50`

**Query Parameters**:
- `containerName` (optional): Filter by container
- `limit` (optional): Number of results (default: 50)

**Response** (200 OK):
```json
{
  "success": true,
  "logs": [
    {
      "_id": "log-id",
      "source": "docker",
      "logType": "info",
      "containerName": "devops-app",
      "message": "Container started successfully",
      "timestamp": "2026-05-11T10:30:00Z"
    }
  ],
  "count": 50
}
```

### Get Container Logs
**GET** `/monitoring/containers/:containerId/logs`

**Response** (200 OK):
```json
{
  "success": true,
  "containerId": "container-id",
  "logs": [
    {
      "timestamp": "2026-05-11T10:30:00Z",
      "message": "[INFO] Application started",
      "type": "info"
    }
  ]
}
```

---

## 🤖 Analysis Endpoints

### Analyze Logs
**POST** `/analyze/logs`

**Request Body**:
```json
{
  "logs": [
    "Error: Connection refused",
    "Warning: Memory usage high",
    "Error: Failed to connect to database"
  ]
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "analysis": {
    "failure_probability": 75,
    "severity": "High",
    "root_cause": "Database connection failure",
    "explanation": "The application cannot connect to the database...",
    "suggested_fixes": [
      "Check database server status",
      "Verify database credentials",
      "Check network connectivity"
    ],
    "affected_stage": "deploy",
    "confidence": 85
  }
}
```

---

## 🔗 Webhook Endpoints

### GitHub Webhook (Public)
**POST** `/webhooks/github`

No authentication required. GitHub sends webhook here on push.

**Headers**:
```
X-Hub-Signature-256: sha256=<signature>
Content-Type: application/json
```

**Response** (200 OK):
```json
{
  "success": true,
  "webhookId": "webhook-id",
  "buildNumber": 123,
  "buildUrl": "http://jenkins:8080/job/devops-hub-deploy/123",
  "message": "Webhook processed successfully..."
}
```

### Get Webhook History
**GET** `/webhooks/history?limit=20&skip=0`

**Query Parameters**:
- `limit` (optional): Number of results (default: 20)
- `skip` (optional): Number to skip (default: 0)

**Response** (200 OK):
```json
{
  "success": true,
  "webhooks": [
    {
      "_id": "webhook-id",
      "event": "push",
      "repository": { "name": "my-repo" },
      "commit": { "message": "Fix bug" },
      "status": "success",
      "createdAt": "2026-05-11T10:30:00Z"
    }
  ],
  "total": 42,
  "count": 20
}
```

### Get Webhook Statistics
**GET** `/webhooks/stats`

**Response** (200 OK):
```json
{
  "success": true,
  "stats": {
    "totalWebhooks": 100,
    "successCount": 95,
    "failureCount": 5,
    "averageProcessingTime": 2500
  }
}
```

### Get Webhook by ID
**GET** `/webhooks/:webhookId`

**Response** (200 OK):
```json
{
  "success": true,
  "webhook": { ...webhook object }
}
```

### Get Webhooks by Repository
**GET** `/webhooks/repo/:repoName?limit=20`

**Response** (200 OK):
```json
{
  "success": true,
  "webhooks": [ ...webhooks for repo ],
  "total": 30,
  "count": 20
}
```

### Delete Webhook
**DELETE** `/webhooks/:webhookId`

**Response** (200 OK):
```json
{
  "success": true,
  "deletedId": "webhook-id"
}
```

---

## 🔐 Authentication Endpoints

### Get Current User
**GET** `/auth/me`

**Response** (200 OK):
```json
{
  "userId": "user-id",
  "email": "user@example.com",
  "name": "John Doe"
}
```

### Verify Firebase Token
**GET** `/auth/verify?token=<FIREBASE_TOKEN>`

**Response** (200 OK):
```json
{
  "success": true,
  "userId": "user-id",
  "email": "user@example.com"
}
```

---

## 💾 Data Models

### Deployment
```json
{
  "_id": "ObjectId",
  "userId": "string",
  "pipelineId": "ObjectId",
  "version": "string",
  "previousVersion": "string",
  "status": "in-progress|success|failed|rolled-back",
  "environment": "development|staging|production",
  "containers": [
    {
      "name": "string",
      "image": "string",
      "status": "string",
      "ports": ["string"]
    }
  ],
  "deploymentType": "manual|auto|rollback",
  "deployedBy": "string",
  "startTime": "Date",
  "endTime": "Date",
  "duration": "number",
  "rollbackReason": "string",
  "logs": ["string"],
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### Alert
```json
{
  "_id": "ObjectId",
  "userId": "string",
  "type": "string",
  "severity": "info|warning|critical",
  "title": "string",
  "message": "string",
  "resourceType": "string",
  "resourceId": "string",
  "resolved": "boolean",
  "resolvedAt": "Date",
  "createdAt": "Date"
}
```

### Metrics
```json
{
  "_id": "ObjectId",
  "userId": "string",
  "timestamp": "Date",
  "cpu": "number",
  "memory": "number",
  "disk": "number",
  "network": { "incoming": "number", "outgoing": "number" },
  "uptime": "number",
  "latency": "number",
  "activeConnections": "number",
  "containerCount": "number",
  "containerHealth": { "running": "number", "stopped": "number", "failed": "number" }
}
```

---

## 🔗 Socket.io Events

### Connect & Subscribe
```javascript
const socket = io('http://localhost:5000', {
  auth: { token: firebaseToken }
});

// Subscribe to channels
socket.emit('subscribe:metrics');
socket.emit('subscribe:alerts');
socket.emit('subscribe:pipeline');
socket.emit('subscribe:logs');
```

### Listen for Updates
```javascript
socket.on('metrics:update', (metrics) => {
  // Real-time metrics
});

socket.on('alerts:new', (alerts) => {
  // New alerts
});

socket.on('pipeline:update', (pipeline) => {
  // Pipeline status update
});

socket.on('logs:new', (logs) => {
  // New logs
});
```

---

## ❌ Error Responses

### 400 Bad Request
```json
{
  "message": "Missing required field: version",
  "error": "Validation error"
}
```

### 401 Unauthorized
```json
{
  "message": "Invalid token"
}
```

### 404 Not Found
```json
{
  "message": "Deployment not found"
}
```

### 500 Internal Server Error
```json
{
  "message": "Internal server error",
  "error": "Error details here"
}
```

---

**API Version**: 1.0.0  
**Last Updated**: 2026-05-11
