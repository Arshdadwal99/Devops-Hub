# One-Click Deployment API Reference

## Base URL

```
https://api.devops-hub.dev/api
```

## Authentication

All endpoints require authentication via Bearer token:

```
Authorization: Bearer YOUR_TOKEN
```

Obtain token from:
```
GET /auth/token
```

## API Endpoints

### 1. Start One-Click Deployment

Start a fully automated deployment for a GitHub repository.

```
POST /deployments/oneclick
```

**Request Headers:**
```
Authorization: Bearer YOUR_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "owner": "username",
  "repo": "repo-name",
  "branch": "main"
}
```

**Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| owner | string | Yes | GitHub repository owner/username |
| repo | string | Yes | GitHub repository name |
| branch | string | No | Git branch (default: main) |

**Response (200 OK):**
```json
{
  "success": true,
  "deploymentId": "deploy-1234567890-abcd1234",
  "message": "One-click deployment started. Monitoring progress via Socket.io events."
}
```

**Response (400 Bad Request):**
```json
{
  "success": false,
  "error": "owner is required"
}
```

**Response (500 Internal Server Error):**
```json
{
  "success": false,
  "error": "One-click deployment failed: [error details]"
}
```

**Example Usage:**

```bash
curl -X POST https://api.devops-hub.dev/api/deployments/oneclick \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "john-doe",
    "repo": "my-app",
    "branch": "main"
  }'
```

**JavaScript/Fetch:**
```javascript
const response = await fetch('/api/deployments/oneclick', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    owner: 'john-doe',
    repo: 'my-app',
    branch: 'main'
  })
});

const data = await response.json();
console.log(data.deploymentId); // "deploy-1234567890-abcd1234"
```

---

### 2. Get Deployment Status

Get the current status of a one-click deployment.

```
GET /deployments/oneclick/:deploymentId
```

**Request Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Path Parameters:**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| deploymentId | string | Yes | Deployment ID from start endpoint |

**Response (200 OK):**
```json
{
  "success": true,
  "deployment": {
    "id": "deploy-1234567890-abcd1234",
    "userId": "user123",
    "repositoryOwner": "john-doe",
    "repositoryName": "my-app",
    "branch": "main",
    "status": "in-progress",
    "startedAt": "2024-01-15T10:30:00Z",
    "completedAt": null,
    "error": null,
    "steps": {
      "VERIFY_CONNECTIONS": {
        "status": "success",
        "connections": {
          "jenkins": {...},
          "dockerHub": {...},
          "aws": {...},
          "github": {...}
        }
      },
      "ANALYZE_REPOSITORY": {
        "status": "success",
        "analysis": {
          "language": "javascript",
          "framework": "express",
          "buildTool": "npm"
        }
      },
      "GENERATE_DEPLOYMENT_FILES": {
        "status": "success",
        "files": {
          "dockerfile": "FROM node:16...",
          "jenkinsfile": "pipeline {...}",
          "dockerCompose": "version: '3'..."
        }
      },
      "PROVISION_INFRASTRUCTURE": {
        "status": "in-progress",
        "infrastructure": null
      }
    },
    "infrastructure": null,
    "jenkinsJob": null,
    "webhook": null,
    "deployment": null
  }
}
```

**Response (404 Not Found):**
```json
{
  "success": false,
  "error": "Deployment deploy-1234567890-abcd1234 not found"
}
```

**Example Usage:**

```bash
curl -X GET https://api.devops-hub.dev/api/deployments/oneclick/deploy-1234567890-abcd1234 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**JavaScript/Fetch:**
```javascript
const deploymentId = "deploy-1234567890-abcd1234";
const response = await fetch(`/api/deployments/oneclick/${deploymentId}`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log(data.deployment.status); // "in-progress"
```

---

### 3. List User Deployments

Get all one-click deployments for the current user.

```
GET /deployments/user/deployments
```

**Request Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| limit | number | Results per page (default: 20) |
| offset | number | Results offset (default: 0) |
| status | string | Filter by status (success, failed, in-progress) |

**Response (200 OK):**
```json
{
  "success": true,
  "deployments": [
    {
      "id": "deploy-1234567890-abcd1234",
      "repositoryOwner": "john-doe",
      "repositoryName": "my-app",
      "status": "success",
      "completedAt": "2024-01-15T11:30:00Z",
      "infrastructure": {
        "instanceId": "i-1234567890",
        "publicIp": "1.2.3.4"
      }
    },
    {
      "id": "deploy-1234567890-xyz9876",
      "repositoryOwner": "john-doe",
      "repositoryName": "another-app",
      "status": "failed",
      "error": "GitHub connection failed"
    }
  ],
  "count": 2
}
```

**Example Usage:**

```bash
curl -X GET "https://api.devops-hub.dev/api/deployments/user/deployments?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**JavaScript/Fetch:**
```javascript
const response = await fetch('/api/deployments/user/deployments?limit=10', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log(`${data.count} deployments found`);
data.deployments.forEach(d => {
  console.log(`${d.repositoryName}: ${d.status}`);
});
```

---

## Socket.io Events

Real-time deployment progress is broadcast via Socket.io.

### Connect to Socket.io

```javascript
import io from 'socket.io-client';

const socket = io('https://api.devops-hub.dev', {
  auth: {
    token: localStorage.getItem('token')
  }
});
```

### Listen for Progress Updates

```javascript
socket.on('oneclick:progress', (data) => {
  console.log('Deployment step:', data.step);
  console.log('Status:', data.status);
  console.log('Progress:', data.progress + '%');
});
```

### Event Data Structure

```json
{
  "deploymentId": "deploy-1234567890-abcd1234",
  "step": "BUILD_DOCKER_IMAGE",
  "displayName": "✓ Docker Image Built",
  "status": "success",
  "progress": 70,
  "message": "Docker image built successfully",
  "timestamp": "2024-01-15T10:35:00Z",
  "data": {
    "imageId": "sha256:abc123...",
    "imageTag": "my-app:1234567890"
  }
}
```

### Event Status Values

- `in-progress` - Step is currently executing
- `success` - Step completed successfully
- `failed` - Step failed

### Event Steps

1. `VERIFY_CONNECTIONS` - Validating all integrations
2. `ANALYZE_REPOSITORY` - Scanning repository
3. `GENERATE_DEPLOYMENT_FILES` - Creating configs
4. `PROVISION_INFRASTRUCTURE` - Setting up EC2
5. `CREATE_JENKINS_JOB` - Creating Jenkins job
6. `CONFIGURE_JENKINS_CREDENTIALS` - Adding secrets
7. `CONFIGURE_GITHUB_WEBHOOK` - Setting up webhook
8. `BUILD_DOCKER_IMAGE` - Building image
9. `PUSH_DOCKER_IMAGE` - Pushing to registry
10. `DEPLOY_TO_EC2` - Deploying container
11. `RUN_HEALTH_CHECKS` - Verifying health
12. `ENABLE_AUTO_DEPLOY` - Enabling automation
13. `COMPLETE` - Deployment finished

---

## Response Codes

| Code | Meaning |
|------|---------|
| 200 | Request successful |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (invalid token) |
| 404 | Resource not found |
| 500 | Server error |
| 503 | Service unavailable |

---

## Rate Limiting

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1234567890
```

- **Limit**: 100 requests per hour
- **Burst**: 10 requests per second

---

## Error Handling

### Example Error Response

```json
{
  "success": false,
  "error": "Repository analysis failed: GitHub API error",
  "errorCode": "ANALYSIS_FAILED",
  "details": {
    "service": "GitHub",
    "action": "analyzeRepository",
    "message": "404 Not Found"
  }
}
```

### Common Error Codes

| Code | Meaning |
|------|---------|
| INVALID_CREDENTIALS | GitHub/Jenkins/AWS credentials invalid |
| CONNECTION_FAILED | Could not connect to service |
| ANALYSIS_FAILED | Repository analysis error |
| PROVISION_FAILED | EC2 provisioning error |
| BUILD_FAILED | Docker build error |
| DEPLOY_FAILED | Deployment to EC2 error |
| HEALTH_CHECK_FAILED | Application health check failed |

---

## Complete Example

### 1. Start Deployment

```javascript
const deploymentId = await startDeployment('john-doe', 'my-app');
```

### 2. Listen for Progress

```javascript
socket.on('oneclick:progress', (data) => {
  updateUI(data.step, data.progress);
  
  if (data.status === 'failed') {
    showError(data.message);
  }
});
```

### 3. Check Status Periodically

```javascript
const interval = setInterval(async () => {
  const deployment = await getDeploymentStatus(deploymentId);
  
  if (deployment.status === 'success' || deployment.status === 'failed') {
    clearInterval(interval);
    showSummary(deployment);
  }
}, 5000);
```

### 4. Show Results

```javascript
if (deployment.status === 'success') {
  console.log(`✅ Deployed to ${deployment.infrastructure.publicIp}`);
} else if (deployment.status === 'failed') {
  console.log(`❌ Failed: ${deployment.error}`);
}
```

---

## Webhook Events

After deployment, GitHub webhook events automatically trigger redeployment.

### Webhook Payload

```json
{
  "action": "opened",
  "pull_request": {...},
  "repository": {
    "name": "my-app",
    "owner": {
      "login": "john-doe"
    }
  },
  "pusher": {...},
  "commits": [...],
  "ref": "refs/heads/main"
}
```

### Webhook Delivery

- **URL**: `https://api.devops-hub.dev/webhooks/github`
- **Event**: `push`, `pull_request`
- **Retry**: 3 times with exponential backoff

---

## Limits & Quotas

| Limit | Value |
|-------|-------|
| Max deployments per hour | 60 |
| Max concurrent deployments | 5 |
| Max EC2 instances | 10 |
| Max Docker image size | 1GB |
| Max deployment timeout | 30 minutes |
| Max log size | 100MB |

---

## SDK Examples

### Python

```python
import requests

url = "https://api.devops-hub.dev/api/deployments/oneclick"
headers = {"Authorization": f"Bearer {token}"}
data = {"owner": "john-doe", "repo": "my-app"}

response = requests.post(url, json=data, headers=headers)
deployment = response.json()
print(deployment['deploymentId'])
```

### Node.js

```javascript
const axios = require('axios');

const response = await axios.post(
  'https://api.devops-hub.dev/api/deployments/oneclick',
  { owner: 'john-doe', repo: 'my-app' },
  { headers: { Authorization: `Bearer ${token}` } }
);

console.log(response.data.deploymentId);
```

### cURL

```bash
curl -X POST https://api.devops-hub.dev/api/deployments/oneclick \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"owner": "john-doe", "repo": "my-app"}'
```

---

## Support

For API issues:
- 📖 [Full Documentation](./ONE_CLICK_DEPLOYMENT_GUIDE.md)
- 💬 [GitHub Issues](https://github.com/devops-hub/issues)
- 📧 support@devops-hub.dev
