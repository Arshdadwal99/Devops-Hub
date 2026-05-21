# Testing Start, Stop, and Rollback Features

## Overview
Your DevOps Dashboard has three main deployment operations:
1. **Deploy** - Deploy a new version
2. **Restart** - Restart the running container (graceful stop + start)
3. **Rollback** - Revert to previous version

## Prerequisites
- Backend running: `npm run dev:backend` (port 5000)
- Frontend running: `npm run dev:frontend` (port 5173)
- MongoDB running
- Docker running
- Logged in to the dashboard

## API Endpoints (Fixed ✅)
- **Deploy**: `POST /api/deployments/deploy`
- **Restart**: `POST /api/deployments/restart`
- **Rollback**: `POST /api/deployments/rollback`

---

## Testing Guide

### 1. Test Deploy Feature
**What it does**: Deploys a new Docker container with a specific version

**UI Test**:
1. Open dashboard → Click **"Deploy Now"** button
2. Expected: Should show deployment in progress
3. Check backend console for logs starting with `🚀 [Deployment]`
4. Expected result: Deployment record created with status "success" or "failed"

**Curl Test** (backend must be running):
```bash
curl -X POST http://localhost:5000/api/deployments/deploy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "containerName": "devops-app",
    "image": "nginx:latest",
    "version": "1.0.0",
    "ports": ["8080:80"],
    "env": [],
    "volumes": []
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "deployment": {
    "_id": "...",
    "status": "success",
    "version": "1.0.0",
    "containers": [...],
    "logs": [...]
  }
}
```

---

### 2. Test Restart Feature
**What it does**: Gracefully stops and restarts the current container

**UI Test**:
1. Open dashboard → Click **"Restart"** button
2. Expected: Container restarts (stops then starts)
3. Check backend console for `🔄 [Deployment] Restarting container`
4. Container should go down briefly then come back up

**Curl Test**:
```bash
curl -X POST http://localhost:5000/api/deployments/restart \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "containerName": "devops-app"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "container": {
    "name": "devops-app",
    "status": "running"
  },
  "logs": [...]
}
```

**Steps in the restart process**:
1. Finds the current container
2. Stops it with 10-second timeout
3. Waits 2 seconds for graceful shutdown
4. Starts it again
5. Logs all actions

---

### 3. Test Rollback Feature
**What it does**: Stops current container and starts a previous version

**Prerequisites**:
- Must have deployed at least one previous version
- Need the previous version tag (e.g., "0.9.0")

**UI Test**:
1. Deploy version "1.0.0" first
2. Deploy version "1.1.0" 
3. Click **"Rollback"** button
4. Expected: Should rollback to "1.0.0"
5. Check backend console for `⏮️ [Deployment] Rolling back`

**Curl Test**:
```bash
curl -X POST http://localhost:5000/api/deployments/rollback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "containerName": "devops-app",
    "previousVersion": "1.0.0"
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "deployment": {
    "_id": "...",
    "status": "success",
    "version": "1.0.0",
    "deploymentType": "rollback",
    "logs": [...]
  }
}
```

**Steps in the rollback process**:
1. Finds the current container
2. Stops it
3. Waits 2 seconds
4. Starts container with previous version image tag
5. Creates deployment record with type "rollback"
6. Generates alert on success/failure

---

## Troubleshooting

### Issue: "Container not found"
**Cause**: Container name doesn't match or not running
**Solution**:
1. Check running containers: `docker ps`
2. Verify containerName matches exactly
3. Make sure container is running before restart/rollback

### Issue: "Image not found"
**Cause**: Docker image doesn't exist locally
**Solution**:
1. Pull the image: `docker pull nginx:latest`
2. Or deploy with a valid image that exists locally
3. Check image name spelling

### Issue: API returns 401 Unauthorized
**Cause**: Invalid or missing auth token
**Solution**:
1. Login to dashboard first
2. Token is stored in localStorage
3. For curl tests, include valid Bearer token

### Issue: "Cannot connect to server"
**Cause**: Backend not running or wrong port
**Solution**:
1. Start backend: `npm run dev:backend`
2. Verify running on port 5000: `http://localhost:5000/api/health`
3. Check no firewall blocking port 5000

### Issue: Docker command errors
**Cause**: Docker not running
**Solution**:
1. Start Docker Desktop (Windows)
2. Run: `docker ps` to verify
3. Check Docker daemon is running

---

## Database Records Created

### Deployment Records
Each operation creates a record in the `deployments` collection:

```javascript
{
  _id: ObjectId,
  userId: "user123",
  version: "1.0.0",
  previousVersion: "0.9.0",
  status: "success|failed|rolled-back|in-progress",
  environment: "production",
  containers: [{
    name: "devops-app",
    image: "nginx:1.0.0",
    status: "running"
  }],
  deploymentType: "manual|auto|rollback",
  startTime: Date,
  endTime: Date,
  duration: Number,
  logs: [String],
  createdAt: Date
}
```

### Alert Records
Successful/failed deployments create alerts in `alerts` collection:
- ✅ `deployment_success` (severity: info/warning)
- ❌ `deployment_failed` (severity: critical)

---

## Real-Time Monitoring

### Socket.io Events
The dashboard sends real-time updates via Socket.io:
- `metrics:update` - Every 10 seconds
- `alerts:new` - When new alerts are created
- `pipeline:update` - Pipeline status changes
- `logs:new` - New deployment logs

---

## Expected Backend Logs

### Successful Deploy
```
🚀 [Deployment] Starting deployment: 1.0.0
🔨 [Docker] Building image: nginx:1.0.0
✅ [Docker] Image built successfully
🚀 [Docker] Running container: devops-app
✅ [Docker] Container started: abc123def456
✅ [Deployment] Deployment completed: 1.0.0
```

### Successful Restart
```
🔄 [Deployment] Restarting container: devops-app
⏹️ [Docker] Stopping container: abc123def456
✅ [Docker] Container stopped: abc123def456
🚀 [Docker] Running container: devops-app
✅ [Docker] Container started: new123id456
```

### Successful Rollback
```
⏮️ [Deployment] Rolling back to: 0.9.0
⏹️ [Docker] Stopping container: abc123def456
✅ [Docker] Container stopped: abc123def456
🚀 [Docker] Running container: devops-app
✅ [Docker] Container started: new123id456
```

---

## Success Criteria ✅

Your deployment features are working if:

- [ ] Deploy creates deployment record with status "success"
- [ ] Deployment appears in DB with correct version
- [ ] Restart gracefully stops and restarts container
- [ ] Container shows downtime then comes back up
- [ ] Rollback creates record with deploymentType "rollback"
- [ ] Alerts created for deployment events
- [ ] All logs recorded in database
- [ ] Frontend buttons trigger backend endpoints
- [ ] Real-time updates via Socket.io

---

## Next Steps

1. **Test each feature** following the curl examples above
2. **Monitor backend console** for status logs
3. **Check database** for deployment records using MongoDB Compass
4. **Verify alerts** are created for each deployment
5. **Check frontend** dashboard updates in real-time

If any feature fails, check the backend console logs for error details.
