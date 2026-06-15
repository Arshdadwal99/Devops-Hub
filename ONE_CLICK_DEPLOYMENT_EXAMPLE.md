# One-Click Deployment - Complete Integration Example

This file demonstrates a complete working example of the one-click deployment system.

## Full User Journey

### Step 1: User Navigates to Deployment Page

```jsx
// App.jsx
import OneClickDeployment from './components/OneClickDeployment';

function App() {
  return (
    <div>
      <header>DevOps Hub - One-Click Deployment</header>
      <OneClickDeployment />
    </div>
  );
}
```

### Step 2: User Fills Form and Clicks Deploy

**Browser Console Output:**
```
User Input:
- Owner: john-doe
- Repo: my-nodejs-app
- Branch: main
Button clicked: [ Deploy with CI/CD ]
```

### Step 3: Frontend Sends Request to Backend

```javascript
// OneClickDeployment.jsx
const handleDeploy = async () => {
  const response = await fetch('/api/deployments/oneclick', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      owner: 'john-doe',
      repo: 'my-nodejs-app',
      branch: 'main'
    })
  });

  const data = await response.json();
  console.log('Deployment started:', data.deploymentId);
};
```

### Step 4: Backend Receives Request

```bash
Backend API receives:
POST /api/deployments/oneclick
Headers: Authorization: Bearer <token>
Body: {
  "owner": "john-doe",
  "repo": "my-nodejs-app",
  "branch": "main"
}

Server logs:
[OneClick Deploy] Starting: john-doe/my-nodejs-app
```

### Step 5: API Returns Deployment ID

```javascript
// deploymentRoutes.js
router.post("/oneclick", async (req, res, next) => {
  const deploymentId = `deploy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  res.json({
    success: true,
    deploymentId: "deploy-1234567890-abcd1234",
    message: "One-click deployment started"
  });

  // Start background process (don't wait)
  oneClickDeploymentService.executeOneClickDeployment(userId, deploymentConfig);
});
```

**Response:**
```json
{
  "success": true,
  "deploymentId": "deploy-1234567890-abcd1234",
  "message": "One-click deployment started. Tracking progress via Socket.io."
}
```

### Step 6: Frontend Listens for Progress

```javascript
// OneClickDeployment.jsx
useEffect(() => {
  if (!socket) return;

  socket.on('oneclick:progress', (data) => {
    console.log(`[${data.step}] ${data.displayName} - ${data.progress}%`);
    
    // Update UI
    setProgressLog(prev => [...prev, data]);
    
    if (data.status === 'success' && data.step === 'COMPLETE') {
      setDeploymentStatus({ completed: true, ...data });
    }
  });
}, [socket]);
```

### Step 7: Backend Orchestration Starts

```javascript
// oneClickDeploymentService.js
async executeOneClickDeployment(userId, deploymentConfig) {
  const deploymentId = `deploy-${Date.now()}-...`;
  
  // Step 1
  await this.broadcastProgress(deploymentId, "VERIFY_CONNECTIONS", "in-progress");
  const connections = await this.verifyConnections(userId);
  await this.broadcastProgress(deploymentId, "VERIFY_CONNECTIONS", "success");
  
  // Step 2
  await this.broadcastProgress(deploymentId, "ANALYZE_REPOSITORY", "in-progress");
  const analysis = await this.analyzeRepository(userId, owner, repo);
  await this.broadcastProgress(deploymentId, "ANALYZE_REPOSITORY", "success");
  
  // ... continue through all 12 steps ...
}
```

### Step 8: Real-Time Progress Broadcast

**Socket.io Events (via broadcast):**

```javascript
// Event 1: Connections Verified
{
  "deploymentId": "deploy-1234567890-abcd1234",
  "step": "VERIFY_CONNECTIONS",
  "displayName": "✓ Verifying Connections",
  "status": "success",
  "progress": 8,
  "message": "All integrations verified",
  "data": {
    "jenkins": "connected",
    "dockerHub": "connected",
    "aws": "connected",
    "github": "connected"
  }
}

// Event 2: Repository Analyzed
{
  "deploymentId": "deploy-1234567890-abcd1234",
  "step": "ANALYZE_REPOSITORY",
  "displayName": "✓ Repository Analyzed",
  "status": "success",
  "progress": 15,
  "message": "Repository analysis complete",
  "data": {
    "language": "javascript",
    "framework": "express",
    "buildTool": "npm",
    "size": "45MB"
  }
}

// Event 3: Deployment Files Generated
{
  "deploymentId": "deploy-1234567890-abcd1234",
  "step": "GENERATE_DEPLOYMENT_FILES",
  "displayName": "✓ Generated Deployment Files",
  "status": "success",
  "progress": 23,
  "message": "All deployment files generated"
}

// Event 4: Infrastructure Provisioning (in-progress)
{
  "deploymentId": "deploy-1234567890-abcd1234",
  "step": "PROVISION_INFRASTRUCTURE",
  "displayName": "⏳ Infrastructure Ready",
  "status": "in-progress",
  "progress": 30,
  "message": "Provisioning EC2 instance..."
}

// Event 5: Infrastructure Ready (success)
{
  "deploymentId": "deploy-1234567890-abcd1234",
  "step": "PROVISION_INFRASTRUCTURE",
  "displayName": "✓ Infrastructure Ready",
  "status": "success",
  "progress": 38,
  "data": {
    "instanceId": "i-0123456789abcdef0",
    "instanceType": "t2.micro",
    "publicIp": "1.2.3.4"
  }
}

// ... continue for remaining steps ...

// Final Event: Complete
{
  "deploymentId": "deploy-1234567890-abcd1234",
  "step": "COMPLETE",
  "displayName": "✓ Deployment Complete",
  "status": "success",
  "progress": 100,
  "message": "One-click deployment completed successfully!"
}
```

### Step 9: Frontend Displays Progress

**UI Update Sequence:**

```
[00:00] Deployment Started
        Deployment ID: deploy-1234567890-abcd1234

[00:10] ✓ Verifying Connections (8%)
        All integrations verified
        Jenkins: ✓ | Docker Hub: ✓ | AWS: ✓ | GitHub: ✓

[00:15] ✓ Repository Analyzed (15%)
        Language: JavaScript
        Framework: Express.js
        Size: 45MB

[00:20] ✓ Generated Deployment Files (23%)
        Dockerfile generated
        Jenkinsfile generated
        docker-compose.yml generated

[00:30] ⏳ Infrastructure Ready (30%)
        Provisioning EC2 instance...

[03:30] ✓ Infrastructure Ready (38%)
        Instance Type: t2.micro
        Instance ID: i-0123456789abcdef0
        Public IP: 1.2.3.4

[03:40] ✓ Jenkins Configured (46%)
        Jenkins job created: my-nodejs-app-auto-deploy

[03:50] ✓ Webhook Configured (54%)
        GitHub webhook configured

[04:00] ✓ Docker Image Built (62%)
        Image: my-nodejs-app:1234567890
        Size: 250MB

[04:15] ✓ Image Pushed to Registry (70%)
        Pushed to Docker Hub

[04:25] ✓ Application Deployed (78%)
        Container: my-nodejs-app-container
        Port: 80 -> 3000

[04:35] ✓ Health Checks Passed (86%)
        HTTP 200: ✓
        Response time: 42ms
        Endpoints: 3/3 ✓

[04:40] ✓ Auto Deploy Enabled (94%)
        Webhook ready for pushes

[04:45] ✓ Deployment Complete (100%)
        Your application is now live!
```

### Step 10: Success Summary Displayed

```
╔════════════════════════════════════════════════════════════╗
║  ✅ Deployment Successful!                                ║
║                                                            ║
║  Deployment ID:  deploy-1234567890-abcd1234              ║
║  Repository:     john-doe/my-nodejs-app                  ║
║  Duration:       4m 45s                                  ║
║                                                            ║
║  Infrastructure:                                          ║
║  • Instance Type: t2.micro                               ║
║  • Instance ID:   i-0123456789abcdef0                    ║
║  • Public IP:     1.2.3.4                                ║
║                                                            ║
║  Application:                                             ║
║  • Access URL:    http://1.2.3.4                        ║
║  • Health Status: ✓ All systems operational              ║
║                                                            ║
║  Auto-Deploy:                                             ║
║  • Status: ✓ Enabled                                     ║
║  • Next push to main will auto-deploy                    ║
║                                                            ║
║  [ View Application ] [ View Logs ] [ Deploy Another ]   ║
╚════════════════════════════════════════════════════════════╝
```

## Auto-Deploy Example

### Step 1: Developer Makes a Commit

```bash
$ git commit -m "Add new feature"
$ git push origin main

Enumerating objects: 5, done.
Counting objects: 100% (5/5), done.
Writing objects: 100% (3/3), 245 bytes, done.
Total 3 (delta 2), reused 0 (delta 0), pack-reused 0
To github.com:john-doe/my-nodejs-app.git
   abc1234..def5678  main -> main
```

### Step 2: GitHub Sends Webhook

```
GitHub webhook triggered:
POST https://api.devops-hub.dev/webhooks/github

Headers:
  X-GitHub-Event: push
  X-GitHub-Delivery: abc123...
  X-Hub-Signature: sha256=...

Body:
  {
    "repository": {
      "name": "my-nodejs-app",
      "owner": { "login": "john-doe" }
    },
    "ref": "refs/heads/main",
    "commits": [{
      "id": "def5678",
      "message": "Add new feature"
    }]
  }
```

### Step 3: Jenkins Receives Trigger

```
Jenkins job triggered:
POST http://jenkins:8080/generic-webhook-trigger/invoke?token=...

Job: my-nodejs-app-auto-deploy
Trigger: GitHub webhook
Branch: main
Commit: def5678
```

### Step 4: Jenkins Pipeline Executes

```
Pipeline: my-nodejs-app-auto-deploy

Stage 1: Checkout
✓ Cloning repository...
✓ Checking out main
✓ Commit: def5678

Stage 2: Build
✓ Building Docker image...
✓ Image: my-nodejs-app:def5678
✓ Size: 248MB

Stage 3: Push
✓ Pushing to Docker Hub...
✓ Registry: docker.io/john-doe/my-nodejs-app:def5678

Stage 4: Deploy
✓ Connecting to EC2...
✓ Stopping old container...
✓ Starting new container...
✓ Container: my-nodejs-app-container (def5678)

Stage 5: Health Check
✓ Waiting for app to start...
✓ Checking health endpoint...
✓ App is healthy

Pipeline Result: SUCCESS ✓
Total time: 3m 15s
```

### Step 5: Application Updated

```
Old Version: abc1234
New Version: def5678

✓ Old container stopped
✓ Old Docker image kept for rollback
✓ New container running
✓ Traffic switched to new version

Deployment Status:
• Version: def5678
• Instance: 1.2.3.4:80
• Status: Running
• Health: OK
• Uptime: 30s
```

### Step 6: User Sees Live Update

```
Browser refresh shows:
- Application code updated
- New feature available
- Version indicator shows: def5678

No downtime.
No deployment dialog.
No user action required.

All automatic. ✓
```

## Error Scenario Example

### Infrastructure Provisioning Fails

```
[Progress] Provisioning Infrastructure...

Error occurs during EC2 instance creation:
"Failed to create instance: EC2 quota exceeded"

Broadcast:
{
  "step": "PROVISION_INFRASTRUCTURE",
  "status": "failed",
  "message": "Infrastructure provisioning failed: EC2 quota exceeded",
  "data": {
    "error": "EC2 quota exceeded",
    "limit": 10,
    "current": 10,
    "solution": "Delete unused instances or request quota increase"
  }
}

UI Display:
❌ Deployment Failed

Infrastructure provisioning failed:
EC2 quota exceeded

Current instances: 10/10
Solution: Delete unused instances or request AWS quota increase

[ Retry ] [ View Error Log ] [ Contact Support ]

Auto-deploy: NOT enabled
Please fix the issue and retry.
```

## Monitoring & Analytics

### Deployment Metrics

```javascript
// User Dashboard
Deployments: 15 total
- Successful: 14 (93.3%)
- Failed: 1 (6.7%)

Average Duration: 4m 42s

By Instance Type:
- t2.micro: 8 deployments
- t2.small: 5 deployments
- t2.medium: 2 deployments

By Time:
- Week: 3 deployments
- Month: 15 deployments

Most Recent:
1. ✓ my-nodejs-app (4m ago)
2. ✓ my-python-app (2h ago)
3. ❌ my-react-app (1d ago)
```

### Cost Tracking

```javascript
// Monthly Cost Estimation
Infrastructure:
- t2.micro (1 instance): $9.50
- t2.small (1 instance): $20.00

Data Transfer:
- Outbound: $5.00
- ECR push/pull: $2.00

Total Estimated: $36.50/month

Deployment Efficiency:
- Cost per deployment: $2.43
- Failed deployments (cost): $0
- Auto-deploy savings: ~60%
```

## Summary

This complete example shows:

1. ✅ User initiates one-click deployment
2. ✅ Frontend sends request to backend
3. ✅ Backend returns deployment ID immediately
4. ✅ Service executes asynchronously
5. ✅ Real-time Socket.io updates broadcast
6. ✅ Frontend displays progress
7. ✅ Deployment completes successfully
8. ✅ Summary shows with links
9. ✅ Auto-deploy enabled for future pushes
10. ✅ Subsequent pushes auto-deploy without user interaction

**Total user experience: Click button → Wait 5 minutes → App is live with auto-deploy enabled**

This is the true one-click deployment experience, similar to Vercel, Railway, and Render.
