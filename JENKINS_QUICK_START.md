# Jenkins Integration Quick Start 🚀

## Overview

Complete Jenkins API integration with deployment tracking, analytics, real-time monitoring, and automatic retry logic.

**New Features Added:**
- ✅ Deployment analytics with success rates  
- ✅ Real-time deployment status tracking
- ✅ Automatic retry with exponential backoff
- ✅ Pipeline stage tracking and timing
- ✅ Build sync to MongoDB
- ✅ Graceful degradation when Jenkins unavailable

## Prerequisites

1. **Jenkins Instance Running**
   - URL: `http://localhost:8080` (or set `JENKINS_URL` in .env)
   - Job Name: `devops-hub-deploy` (or set `JENKINS_JOB_NAME` in .env)

2. **Jenkins API Token** (Required for production)
   - Go to Jenkins Dashboard → Your User → Configure
   - Click "Add new Token" under "API Token" section
   - Copy token and set in `.env` as `JENKINS_TOKEN`
   - For testing: Set `JENKINS_TOKEN=mock-mode` to use mock data

3. **MongoDB Atlas Connection**
   - Connection string in `.env` as `MONGO_URI`
   - Deployment collection will be auto-created

4. **Environment Variables** (in `backend/.env`)
   ```bash
   # Jenkins Configuration
   JENKINS_URL=http://localhost:8080
   JENKINS_USER=admin
   JENKINS_TOKEN=your-api-token-here
   JENKINS_JOB_NAME=devops-hub-deploy
   JENKINS_AUTO_CREATE_JOB=true
   
   # Features
   ENABLE_JENKINS_MONITORING=true
   ENABLE_DEPLOYMENT_TRACKING=true
   
   # Database
   MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname
   
   # Server
   JWT_SECRET=dev-secret-key
   PORT=5000
   ```

## Starting the System

### 1. Start Backend
```bash
cd backend
npm install
npm start
```

Expected output:
```
🔄 [Server] Checking Jenkins server...
✅ [Jenkins] Server is ready at http://localhost:8080
   Job: devops-hub-deploy
   User: admin

✅ Backend listening on port 5000
```

### 2. Start Frontend (in new terminal)
```bash
cd frontend
npm install
npm run dev
```

## New API Endpoints

### Deployment Analytics
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  'http://localhost:5000/api/jenkins/deployments/analytics?days=30'
```
Returns: Success rates, duration stats, failure trends

### Running Deployments
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  'http://localhost:5000/api/jenkins/deployments/running'
```
Returns: Currently executing deployments with progress

### Recent Deployments
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  'http://localhost:5000/api/jenkins/deployments?limit=10'
```
Returns: Last 10 deployments from database

### Deployment Status by Build Number
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  'http://localhost:5000/api/jenkins/deployments/321'
```
Returns: Build #321 status with all pipeline stages

### Sync Builds to Database
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}' \
  'http://localhost:5000/api/jenkins/deployments/sync'
```
Returns: Number of builds synced

## API Endpoints (Existing)

### 1. Trigger Build
```bash
curl -X POST http://localhost:5000/api/jenkins/trigger \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repository": { "name": "my-app" },
    "commit": { 
      "sha": "abc123def456",
      "message": "Fix deployment issue",
      "author": { "name": "Developer" }
    },
    "branch": "main",
    "environment": "production"
  }'
```

Response:
```json
{
  "success": true,
  "buildNumber": 42,
  "buildUrl": "http://localhost:8080/job/devops-hub-deploy/42/"
}
```

### 2. Get Pipeline Status
```bash
curl http://localhost:5000/api/jenkins/pipeline/status
```

Response:
```json
{
  "success": true,
  "status": "RUNNING",
  "progress": 45,
  "buildNumber": 42,
  "jobName": "devops-hub-deploy",
  "url": "http://localhost:8080/job/devops-hub-deploy/",
  "lastBuild": { "number": 42, "status": "RUNNING" },
  "lastCompletedBuild": { "number": 41, "status": "SUCCESS" }
}
```

### 3. Get Build Status
```bash
curl http://localhost:5000/api/jenkins/builds/42/status
```

Response:
```json
{
  "buildNumber": 42,
  "status": "RUNNING",
  "url": "http://localhost:8080/job/devops-hub-deploy/42/",
  "duration": 125000,
  "estimatedDuration": 180000,
  "timestamp": "2024-01-15T10:30:00Z",
  "inProgress": true
}
```

### 4. Get Build Details
```bash
curl http://localhost:5000/api/jenkins/builds/42 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Response includes:
- Build metadata (number, status, duration)
- Git information (commit, branch, author)
- Pipeline stages with status
- Build logs
- Artifacts
- Parameters passed

### 5. Get Build Logs
```bash
curl "http://localhost:5000/api/jenkins/builds/42/logs?start=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Response:
```json
{
  "success": true,
  "logs": [
    "Starting build...",
    "Checkout stage...",
    "Build stage...",
    "Deploy stage..."
  ],
  "hasMoreData": true,
  "nextStart": 1024,
  "totalSize": 5000
}
```

### 6. Get Pipeline Stages
```bash
curl http://localhost:5000/api/jenkins/builds/42/stages
```

Response:
```json
{
  "success": true,
  "stages": [
    {
      "name": "Checkout",
      "status": "SUCCESS",
      "duration": 5000
    },
    {
      "name": "Build",
      "status": "SUCCESS", 
      "duration": 15000
    },
    {
      "name": "Deploy",
      "status": "RUNNING",
      "duration": 8000
    }
  ],
  "progress": 67,
  "status": "RUNNING"
}
```

### 7. Get Build History
```bash
curl "http://localhost:5000/api/jenkins/history?limit=10&skip=0" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 8. Get Last Successful Build
```bash
curl http://localhost:5000/api/jenkins/last-successful \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 9. Get Statistics
```bash
curl "http://localhost:5000/api/jenkins/statistics?days=30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Response:
```json
{
  "success": true,
  "stats": {
    "totalBuilds": 42,
    "successCount": 38,
    "failureCount": 4,
    "successRate": 90.48,
    "avgDuration": 152000,
    "byStatus": { "SUCCESS": 38, "FAILURE": 4 }
  }
}
```

### 10. Abort Build
```bash
curl -X POST http://localhost:5000/api/jenkins/builds/42/abort \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 11. Get Builds by Status
```bash
curl "http://localhost:5000/api/jenkins/builds/status/FAILURE?limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 12. Get Builds by Branch
```bash
curl "http://localhost:5000/api/jenkins/builds/branch/main?limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 13. Sync Builds (Manual)
```bash
curl -X POST http://localhost:5000/api/jenkins/sync \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Testing Steps

### Step 1: Get Authentication Token
1. Login at frontend http://localhost:5173
2. Open DevTools (F12) → Application → LocalStorage
3. Copy `token` value

### Step 2: Test Build Trigger
1. Use token in curl commands above
2. Or use frontend to trigger build (once integrated)

### Step 3: Monitor Build Progress
1. Call `/api/jenkins/builds/42/status` repeatedly
2. Or `/api/jenkins/pipeline/status` for current pipeline

### Step 4: Get Build Results
1. Once build completes, call `/api/jenkins/builds/42`
2. Check logs, stages, and metadata

### Step 5: View Build History
1. Call `/api/jenkins/history` to see all stored builds
2. MongoDB stores all build data for analytics

## Troubleshooting

### Issue: "Authentication failed" 
- Solution: Verify JENKINS_TOKEN is correct in .env
- Check Jenkins → Your User → Configure → API Token

### Issue: "Connection refused"
- Solution: Ensure Jenkins is running on JENKINS_URL
- Default: http://localhost:8080

### Issue: "MongoDB connection failed"
- Solution: Check MONGODB_URI in .env
- Ensure MongoDB Atlas cluster is accessible

### Issue: "Build history empty"
- Solution: Trigger a build first with /api/jenkins/trigger
- Wait for build to complete
- Check MongoDB for BuildHistory collection

### Issue: "Invalid job name"
- Solution: Verify JENKINS_JOB_NAME matches Jenkins pipeline name
- Default: "devops-hub-deploy"

## Performance Tips

1. **Use MongoDB First**: History queries check DB before Jenkins API
2. **Pagination**: Use limit/skip for large datasets
3. **Caching**: Build details cached in MongoDB for 90 days
4. **Bulk Sync**: POST /api/jenkins/sync updates multiple builds at once
5. **Streaming Logs**: Use start offset for large logs

## Integration with Dashboard

### Planned Components
1. **Build History Panel**: Displays recent builds
2. **Build Details Modal**: Shows logs, stages, artifacts
3. **Live Progress Bar**: Real-time build progress
4. **Status Badges**: SUCCESS/FAILURE/RUNNING indicators
5. **Log Viewer**: Search and filter build logs
6. **Statistics Chart**: Success rate, duration trends

### Frontend API Calls
```javascript
import { getDashboard } from '../lib/api.js';

// Get dashboard includes Jenkins status
const { dashboard } = await getDashboard();
console.log(dashboard.pipeline); // Current pipeline status
console.log(dashboard.deployments); // Recent deployments from Jenkins
```

## Files Overview

| File | Purpose |
|------|---------|
| `backend/src/models/BuildHistory.js` | MongoDB schema for build history |
| `backend/src/services/jenkinsService.js` | Jenkins API calls + MongoDB sync |
| `backend/src/controllers/jenkinsController.js` | Request handlers |
| `backend/src/routes/jenkinsRoutes.js` | REST API endpoints |
| `backend/src/server.js` | Routes registered here |

## Success Indicators

✅ Backend starts without errors
✅ POST /api/jenkins/trigger returns build number
✅ GET /api/jenkins/pipeline/status returns current status
✅ MongoDB BuildHistory collection has documents
✅ Build logs available in GET /api/jenkins/builds/:buildNumber/logs
✅ Statistics endpoint returns aggregated data
✅ Frontend can call all endpoints with JWT auth

---

**Ready to integrate into frontend dashboard!** 🚀
