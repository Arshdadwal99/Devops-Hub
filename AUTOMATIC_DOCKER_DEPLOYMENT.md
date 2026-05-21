# Automatic Docker Deployment After Jenkins Build

**Status:** ✅ Fully Implemented  
**Version:** 1.0  
**Last Updated:** May 13, 2026

---

## 📋 Overview

This system automatically builds and deploys Docker containers after successful Jenkins builds triggered by GitHub webhooks. It creates a complete CI/CD pipeline:

```
GitHub Push
    ↓
GitHub Webhook
    ↓
Jenkins Build
    ↓
✅ BUILD SUCCESS
    ↓
Docker Build
    ↓
Stop Old Container
    ↓
Deploy New Container
    ↓
✅ DEPLOYMENT COMPLETE
```

---

## 🔄 Complete Workflow

### Step 1: GitHub Push Triggers Webhook
```
Developer pushes to repository
↓
GitHub sends webhook to your server
↓
/api/webhooks/github endpoint receives it
```

### Step 2: Webhook Service Processes Event
```
Webhook verified with HMAC-SHA256
↓
Data extracted and stored in MongoDB
↓
Jenkins build triggered with parameters
```

### Step 3: Deployment Automation Service Activates
```
IF Jenkins build successful THEN
  - Wait for build to complete
  - Build Docker image
  - Push to registry (optional)
  - Stop old container
  - Remove old container
  - Start new container
  - Track deployment in MongoDB
  - Send alerts
END
```

### Step 4: New Container Running
```
Application updated automatically
↓
No manual intervention needed
↓
Deployment history saved
↓
Alerts sent on success or failure
```

---

## 🗂️ Database Schema Updates

### Webhook Model - Deployment Tracking Fields

```javascript
{
  // ... existing fields ...
  
  // New deployment automation fields
  deploymentTriggered: Boolean,           // Whether deployment was triggered
  deploymentId: ObjectId,                 // Reference to Deployment document
  deploymentStatus: String,               // "pending", "success", or "failed"
  deploymentError: String,                // Error message if failed
  deploymentStartTime: Date,              // When deployment started
  deploymentEndTime: Date,                // When deployment ended
  deploymentImageTag: String,             // Docker image tag used
}
```

### Deployment Model - Already Exists

```javascript
{
  userId: String,                         // User who triggered deployment
  version: String,                        // Application version
  previousVersion: String,                // Previous version for rollback
  status: String,                         // "in-progress", "success", "failed", "rolled-back"
  environment: String,                    // "development", "staging", "production"
  containers: [{
    name: String,                         // Container name
    image: String,                        // Docker image tag
    status: String,                       // Container status
    ports: [String],                      // Exposed ports
  }],
  deploymentType: String,                 // "manual", "auto", or "rollback"
  deployedBy: String,                     // Who deployed it
  startTime: Date,
  endTime: Date,
  duration: Number,                       // Duration in milliseconds
  logs: [String],                         // Deployment logs
  rollbackReason: String,
  createdAt: Date,
  updatedAt: Date,
}
```

---

## 🛠️ Environment Configuration

Add these variables to `backend/.env`:

```bash
# ===== AUTOMATIC DEPLOYMENT SETTINGS =====

# Enable/disable automatic Docker deployment (default: true)
ENABLE_AUTO_DEPLOYMENT=true

# Container configuration
CONTAINER_NAME=devops-hub-app
CONTAINER_PORT=3000
HOST_PORT=3000
ENVIRONMENT=production

# Container environment variables (comma-separated)
CONTAINER_ENV=NODE_ENV=production,LOG_LEVEL=info

# Container volumes (comma-separated, optional)
CONTAINER_VOLUMES=/app/data:/data,/app/logs:/logs

# Docker registry settings
DOCKER_REGISTRY=localhost
DOCKER_REGISTRY_USERNAME=docker-user
DOCKER_REGISTRY_PASSWORD=docker-password

# Deployment timing
DEPLOYMENT_TIMEOUT=300000      # 5 minutes max wait for build
POLL_INTERVAL=5000             # Check build status every 5 seconds

# Jenkins settings (required)
JENKINS_URL=http://localhost:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=your-token-here
JENKINS_JOB_NAME=devops-hub-deploy
```

---

## 📡 API Endpoints

### GET /api/deployments
**Get deployment history**

```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/deployments?limit=20&skip=0&status=success"
```

**Response:**
```json
{
  "success": true,
  "deployments": [
    {
      "_id": "60d5ec49c1234567890abcde",
      "version": "abc1234",
      "status": "success",
      "deploymentType": "auto",
      "environment": "production",
      "duration": 45000,
      "startTime": "2026-05-13T10:30:00Z",
      "endTime": "2026-05-13T10:30:45Z",
      "containers": [
        {
          "name": "devops-hub-app",
          "image": "localhost/devops-hub:abc1234",
          "status": "running"
        }
      ]
    }
  ],
  "total": 42,
  "count": 20
}
```

### GET /api/deployments/auto
**Get automatic deployments only**

```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/deployments/auto?limit=10&status=success"
```

### GET /api/deployments/stats
**Get deployment statistics**

```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/deployments/stats"
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "total": 42,
    "success": 40,
    "failed": 2,
    "successRate": 95.24,
    "byType": {
      "auto": 35,
      "manual": 6,
      "rollback": 1
    },
    "avgDuration": 35,
    "byEnvironment": [
      {
        "_id": "production",
        "count": 30,
        "successCount": 29
      },
      {
        "_id": "staging",
        "count": 12,
        "successCount": 11
      }
    ],
    "recentDeployments": [...]
  }
}
```

### GET /api/deployments/:id
**Get deployment details**

```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/deployments/60d5ec49c1234567890abcde"
```

### POST /api/deployments/deploy
**Manual deployment (triggers immediately)**

```bash
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "containerName": "devops-hub-app",
    "image": "localhost/devops-hub:v1.2.3",
    "version": "v1.2.3",
    "ports": ["3000:3000"],
    "env": ["NODE_ENV=production"],
    "volumes": ["/app/data:/data"]
  }' \
  http://localhost:5000/api/deployments/deploy
```

### POST /api/deployments/rollback
**Rollback to previous version**

```bash
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "containerName": "devops-hub-app",
    "previousVersion": "v1.2.2"
  }' \
  http://localhost:5000/api/deployments/rollback
```

### POST /api/deployments/restart
**Restart container**

```bash
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "containerName": "devops-hub-app"
  }' \
  http://localhost:5000/api/deployments/restart
```

---

## 🚀 How Automatic Deployment Works

### 1. Webhook Receives GitHub Event
```javascript
GitHub sends: 
{
  "repository": {"name": "devops-dashboard", "full_name": "user/devops-dashboard"},
  "ref": "refs/heads/main",
  "head_commit": {"id": "abc1234", "message": "Add feature X"}
}
```

### 2. Jenkins Build Triggered
```javascript
POST /job/devops-hub-deploy/buildWithParameters?
  REPO_NAME=devops-dashboard&
  BRANCH=main&
  COMMIT_SHA=abc1234&
  COMMIT_MESSAGE=Add feature X&
  AUTHOR=user@example.com
```

### 3. Deployment Service Waits for Build
```javascript
// Poll Jenkins API every 5 seconds
GET /job/devops-hub-deploy/123/api/json

// Checks for: build.result (SUCCESS, FAILURE, UNSTABLE, ABORTED)
// Polls until build completes or timeout (5 minutes)
```

### 4. Build Succeeded - Docker Image Built
```bash
docker build -f ./Dockerfile -t localhost/devops-hub:abc1234 .
```

### 5. Optional Registry Push
```bash
docker tag localhost/devops-hub:abc1234 \
  registry.example.com/devops-hub:abc1234
docker push registry.example.com/devops-hub:abc1234
```

### 6. Stop & Remove Old Container
```bash
docker ps -a | grep devops-hub-app
docker stop [OLD_CONTAINER_ID] -t 30
docker rm [OLD_CONTAINER_ID] -f
```

### 7. Start New Container
```bash
docker run -d \
  --name devops-hub-app-1715600000000 \
  --restart unless-stopped \
  -p 3000:3000 \
  -e NODE_ENV=production \
  localhost/devops-hub:abc1234
```

### 8. Track in MongoDB
```javascript
Deployment {
  version: "abc1234",
  status: "success",
  deploymentType: "auto",
  duration: 45000,
  containers: [{
    name: "devops-hub-app",
    image: "localhost/devops-hub:abc1234",
    status: "running"
  }],
  logs: ["[timestamp] Starting deployment...", ...]
}

Webhook {
  deploymentTriggered: true,
  deploymentId: ObjectId(...),
  deploymentStatus: "success",
  deploymentImageTag: "localhost/devops-hub:abc1234"
}
```

---

## 📊 Complete Request/Response Flow

### Request: GitHub Webhook
```json
POST /api/webhooks/github HTTP/1.1
Host: your-domain.com
X-GitHub-Event: push
X-Hub-Signature-256: sha256=abc123...
Content-Type: application/json

{
  "repository": {...},
  "ref": "refs/heads/main",
  "head_commit": {...}
}
```

### Response: Webhook Received
```json
HTTP/1.1 200 OK
Content-Type: application/json

{
  "success": true,
  "webhookId": "60d5ec49c1234567890abcde",
  "buildNumber": 123,
  "deploymentTriggered": true,
  "message": "Webhook processed. Jenkins build #123 started. Auto deployment queued."
}
```

### Background: Automatic Deployment Starts

#### 1. Wait for Build
```
⏳ Waiting for Jenkins build #123 to complete...
⏳ Build #123 still running... (5s)
⏳ Build #123 still running... (10s)
...
✅ Jenkins build #123 completed with result: SUCCESS
```

#### 2. Build Docker Image
```
🔨 Building Docker image: localhost/devops-hub:abc1234
[INFO] Sending build context to Docker daemon 5.12MB
[INFO] Step 1/15 : FROM node:18-alpine
[INFO] Step 2/15 : WORKDIR /app
...
[INFO] Successfully tagged localhost/devops-hub:abc1234
✅ Docker image built successfully
```

#### 3. Stop Old Container
```
Found old container: 9f8e7d6c5b4a3
⏹️ Stopping container: 9f8e7d6c5b4a3
✅ Old container stopped
🗑️ Removing container: 9f8e7d6c5b4a3
✅ Old container removed
```

#### 4. Start New Container
```
🚀 Running container: devops-hub-app-1715600000000
✅ Container started: a1b2c3d4e5f6g7h8i9j0
🔄 Container health: healthy
```

#### 5. Deployment Complete
```
✅ Deployment successful
Duration: 45 seconds
Container: devops-hub-app-1715600000000
Image: localhost/devops-hub:abc1234
Status: running
```

---

## 🔍 Monitoring Deployment Status

### Check Recent Deployments
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/deployments?limit=5"
```

### Check Automatic Deployments Only
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/deployments/auto?status=success"
```

### Get Statistics
```bash
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/deployments/stats"
```

### Monitor Backend Logs
```bash
# Watch for deployment logs
tail -f logs/backend.log | grep "Deployment"

# Output will show:
# [Deployment] Starting automatic deployment...
# [Docker] Building image: localhost/devops-hub:abc1234
# [Deployment] Deployment completed successfully
```

### Check MongoDB
```bash
mongosh
> use devops-dashboard
> db.deployments.findOne({}, {sort: {createdAt: -1}})
```

---

## ⚙️ Configuration Examples

### Example 1: Production Deployment
```bash
# .env
ENABLE_AUTO_DEPLOYMENT=true
CONTAINER_NAME=devops-hub-prod
ENVIRONMENT=production
DOCKER_REGISTRY=registry.example.com
DOCKER_REGISTRY_USERNAME=docker-user
DOCKER_REGISTRY_PASSWORD=docker-pass
CONTAINER_ENV=NODE_ENV=production,LOG_LEVEL=warn
CONTAINER_VOLUMES=/app/data:/data
```

### Example 2: Staging Deployment
```bash
# .env.staging
ENABLE_AUTO_DEPLOYMENT=true
CONTAINER_NAME=devops-hub-staging
ENVIRONMENT=staging
DOCKER_REGISTRY=localhost
CONTAINER_ENV=NODE_ENV=staging,LOG_LEVEL=info
```

### Example 3: Development (No Auto Deployment)
```bash
# .env.dev
ENABLE_AUTO_DEPLOYMENT=false
# Manual deployment only with POST /api/deployments/deploy
```

---

## 🐛 Troubleshooting

### Issue: Deployment Not Triggering

**Symptom:** Webhook received but deployment didn't start

**Solutions:**
```bash
# Check if auto-deployment is enabled
grep ENABLE_AUTO_DEPLOYMENT backend/.env
# Should output: ENABLE_AUTO_DEPLOYMENT=true

# Check Jenkins build was successful
curl -u admin:TOKEN http://localhost:8080/job/devops-hub-deploy/lastBuild/api/json

# Check deployment logs
tail -f logs/backend.log | grep "Deployment"

# Check webhook record
mongosh
> db.webhooks.findOne({}, {sort: {createdAt: -1}})
> // Should show: deploymentTriggered: true
```

### Issue: Build Completes but Deployment Times Out

**Symptom:** Jenkins build succeeds but deployment fails with timeout

**Solutions:**
```bash
# Check Docker build time
docker build --progress=plain -f ./Dockerfile -t test:latest . 2>&1 | tail -20

# If build is slow, increase timeout:
DEPLOYMENT_TIMEOUT=600000  # 10 minutes

# Check polling interval
POLL_INTERVAL=10000  # Poll every 10 seconds instead of 5
```

### Issue: Container Won't Start

**Symptom:** Deployment succeeds but container isn't running

**Solutions:**
```bash
# Check Docker logs
docker logs [CONTAINER_ID]

# Verify environment variables
CONTAINER_ENV=NODE_ENV=production
# Ensure all required env vars are set

# Check ports
CONTAINER_PORT=3000
HOST_PORT=3000
# Port might already be in use

# Check volumes
CONTAINER_VOLUMES=/app/data:/data
# Directory must exist: mkdir -p /app/data
```

### Issue: Image Push Fails

**Symptom:** Docker registry push fails

**Solutions:**
```bash
# For local registry, it's OK to fail
# System will continue with local image

# For remote registry, check credentials:
docker login registry.example.com
# Enter DOCKER_REGISTRY_USERNAME and DOCKER_REGISTRY_PASSWORD

# Verify in .env:
DOCKER_REGISTRY=registry.example.com
DOCKER_REGISTRY_USERNAME=your-username
DOCKER_REGISTRY_PASSWORD=your-password
```

### Issue: Rollback Fails

**Symptom:** Can't rollback to previous version

**Solutions:**
```bash
# Check if previous image exists
docker images | grep devops-hub

# You need to keep previous images
# Update docker-compose or deployment config to not remove old images

# Or manually deploy specific version:
POST /api/deployments/deploy
{
  "containerName": "devops-hub-app",
  "image": "localhost/devops-hub:v1.2.2",
  "version": "v1.2.2"
}
```

---

## 📈 Performance Optimization

### Reduce Deployment Time

```bash
# 1. Use smaller base image
FROM node:18-alpine  # Instead of node:18

# 2. Use Docker multi-stage build
FROM node:18-alpine AS builder
# ... build dependencies ...
FROM node:18-alpine
COPY --from=builder /app/node_modules /app/node_modules

# 3. Cache Docker layers
# Put frequently changing code last in Dockerfile

# 4. Use local registry (not Docker Hub)
DOCKER_REGISTRY=localhost  # Much faster than remote
```

### Parallel Processing

```bash
# Current: Sequential process
# Build → Push → Stop → Remove → Start

# For faster deployments:
# Run old container removal in parallel
# while starting new container
```

### Monitor Deployment Performance

```bash
# Check average deployment time
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/deployments/stats" | jq '.stats.avgDuration'

# Check by environment
curl -H "Authorization: Bearer TOKEN" \
  "http://localhost:5000/api/deployments/stats" | jq '.stats.byEnvironment'
```

---

## 🔐 Security Considerations

### 1. Docker Registry Credentials
```bash
# ✅ GOOD: Use environment variables
DOCKER_REGISTRY_USERNAME=env_var
DOCKER_REGISTRY_PASSWORD=env_var

# ❌ BAD: Store in code
const username = "hardcoded-user"
```

### 2. Container Isolation
```bash
# Run containers with limited privileges
docker run --security-opt=no-new-privileges ...

# Use read-only filesystem where possible
docker run -v /app/data:/data:ro ...
```

### 3. Secret Management
```bash
# Use MongoDB for sensitive data
# Never log secrets
# Use .env for local, GitHub Secrets for CI/CD
```

### 4. Build Artifact Storage
```bash
# Clean up old images regularly
docker image prune -a --filter "until=72h"

# Don't store build artifacts in containers
# Use external storage (S3, etc.)
```

---

## ✅ Verification Checklist

Before deploying to production:

- [ ] `ENABLE_AUTO_DEPLOYMENT=true` is set
- [ ] All Docker environment variables configured
- [ ] Jenkins connection tested and working
- [ ] Jenkins job can be triggered manually
- [ ] Docker daemon is running
- [ ] Dockerfile exists in repository
- [ ] Container ports are available
- [ ] Volume directories exist (if using volumes)
- [ ] MongoDB deployment records being saved
- [ ] Test webhook triggered successfully
- [ ] Jenkins build completed successfully
- [ ] Docker image built automatically
- [ ] Container started and healthy
- [ ] Deployment recorded in MongoDB
- [ ] Alerts configured for failures
- [ ] Logs are being captured
- [ ] Rollback tested and working
- [ ] Team trained on monitoring

---

## 📚 Related Documentation

- [GitHub Webhook Integration](GITHUB_WEBHOOK_IMPLEMENTATION.md)
- [Jenkins Setup Guide](WEBHOOK_JENKINS_SETUP.md)
- [Docker Deployment Guide](DOCKER_IMPLEMENTATION_COMPLETE.md)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Monitoring Guide](MONITORING_GUIDE.md)

---

## 🎯 Summary

The automatic Docker deployment system provides:

✅ **Fully Automated CI/CD Pipeline**
- GitHub push → Jenkins build → Docker deployment

✅ **Complete Deployment Tracking**
- All deployments stored in MongoDB
- Detailed logs and statistics

✅ **Flexible APIs**
- Get deployment history
- Manual trigger deployment
- Rollback to previous version
- Monitor statistics

✅ **Production Ready**
- Error handling and recovery
- Timeout management
- Health checks
- Alert notifications

✅ **Easy Integration**
- Works with existing webhook system
- Environment-based configuration
- No code changes needed

---

**System Status:** ✅ Ready for Production Deployment
