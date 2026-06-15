# Auto Deploy Button - Diagnostic & Troubleshooting Guide

## Quick Start: How to Check the Status

### 1. Open Browser DevTools (F12)
Go to the Build Progress page for your deployment, then check the console for logs like:

```
Setup Status: {...}
Auto Deploy Status: {...}
Auto Deploy Debug: {
  setupStatus: {...},
  canEnableAutoDeploy: true/false,
  missingRequirements: [...]
}
Can Enable Auto Deploy: true/false
Missing Requirements: [...]
```

### 2. Check Server Logs
Look for messages starting with `[Auto Deploy]`:

```
[Auto Deploy] Getting preconditions for: { userId: '...', owner: '...', repo: '...', branch: '...' }
[Auto Deploy] Query results: { jenkinsConnected: true, dockerHubConnected: true, ... }
[Auto Deploy] Precondition checks: [ 
  { label: 'Jenkins Connected', ok: true },
  { label: 'Jenkinsfile Generated', ok: true },
  { label: 'Jenkins Job Created', ok: ??? },
  { label: 'GitHub Webhook Configured', ok: ??? },
  ...
]
```

## Understanding the Preconditions

The "Enable Auto Deploy" button requires ALL of the following to be true:

| Precondition | What It Checks | How to Fix |
|---|---|---|
| Jenkins Connected | Jenkins server is reachable and authenticated | Connect Jenkins: Settings > Jenkins Connection |
| Jenkinsfile Generated | CI/CD pipeline file exists in repository | Generate Pipeline: Build Progress > Generate CI/CD Pipeline |
| Jenkins Job Created | Job created in Jenkins for this repo/branch | Should be auto-created, check backend logs |
| GitHub Webhook Configured | Webhook set up to trigger Jenkins on push | Should be auto-created, check backend logs |
| Docker Hub Connected | Docker Hub registry is connected | Connect Docker Hub: Settings > Docker Hub |
| EC2 Connected | EC2 instance is connected and validated | Connect EC2: Settings > EC2 |

## Troubleshooting: "Button Remains Disabled"

### Step 1: Identify Missing Preconditions

Look at the console logs for `missingRequirements` array:

```javascript
// If you see:
missingRequirements: ["Jenkins Job Created", "GitHub Webhook Configured"]

// Then those two are blocking you
```

### Step 2: Check Each Requirement

#### A. Jenkins Job Created

**What to check:**
```bash
# In backend logs, look for:
[Auto Deploy] Query results: { 
  jobFound: true,      # ← Should be true
  jobName: 'devops-hub-owner-repo-main'
}
```

**If `jobFound: false`:**
1. Check Jenkins web UI - does the job exist?
2. Check MongoDB: Does a JenkinsJob record exist?
   ```javascript
   db.jenkinsjobs.findOne({ 
     userId: "YOUR_USER_ID",
     status: "active"
   })
   ```
3. If job exists in Jenkins but not found:
   - Backend will use auto-detection fallback
   - Check logs for: `[Auto Deploy] Found job via fallback search`

#### B. GitHub Webhook Configured

**What to check:**
```bash
# In backend logs, look for:
[Auto Deploy] Query results: { 
  webhookFound: true,    # ← Should be true
  webhookUrl: 'https://jenkins-url/github-webhook/'
}
```

**If `webhookFound: false`:**
1. Check GitHub repo settings > Webhooks
   - Should see webhook pointing to your Jenkins
   - Should have status "Recent Deliveries: Success"
2. Check MongoDB: Does a GitHubWebhookConfig record exist?
   ```javascript
   db.githubwebhookconfigs.findOne({
     userId: "YOUR_USER_ID",
     status: "active"
   })
   ```
3. If webhook exists but not found:
   - Backend will use auto-detection fallback
   - Check logs for: `[Auto Deploy] Found webhook via fallback search`

#### C. Other Preconditions (Jenkins, Jenkinsfile, Docker Hub, EC2)

**If any of these show `false`:**
1. Jenkins Connected ❌ → Go to Settings > Jenkins, re-enter connection details
2. Jenkinsfile Generated ❌ → Go to Build Progress, click "Generate CI/CD Pipeline"
3. Docker Hub Connected ❌ → Go to Settings > Docker Hub, enter credentials
4. EC2 Connected ❌ → Go to Settings > EC2, enter instance details and validate

### Step 3: Force Refresh and Retry

```javascript
// In browser console on Build Progress page:
document.location.reload();

// Wait for page to load, check console again for new logs
```

### Step 4: Check Database Directly

If auto-detection isn't working, check what's actually in the database:

```javascript
// Check if Jenkins job exists
db.jenkinsjobs.findOne({
  userId: "YOUR_USER_ID",
  repository: { name: "your-repo" }
})

// Check if webhook exists
db.githubwebhookconfigs.findOne({
  userId: "YOUR_USER_ID"
})

// Check Jenkins job status
db.jenkinsjobs.find({
  userId: "YOUR_USER_ID"
}).pretty()
```

**Expected output:**
```javascript
{
  _id: ObjectId(...),
  userId: "...",
  jobId: "abc123",
  jobName: "devops-hub-owner-repo-main",
  status: "active",      // ← MUST be "active"
  repository: {
    owner: "owner",
    name: "repo",
    branch: "main"
  },
  ...
}
```

## Console Log Reference

### Backend Console
```
[Auto Deploy] Getting preconditions for: { userId: '...', owner: '...', repo: '...', branch: 'main' }
[Auto Deploy] Initial query results: { ... }
[Auto Deploy] Found job via fallback search: devops-hub-owner-repo-main
[Auto Deploy] Found webhook via fallback search: https://...
[Auto Deploy] Precondition checks: [...]
[Auto Deploy] Status check for: { userId: '...', query: {...} }
[Auto Deploy] Found config: { configExists: true, ... }
[Auto Deploy] Response debug info: { setupStatus: {...}, canEnableAutoDeploy: true, ... }
```

### Frontend Console
```javascript
Setup Status: {
  repositoryConnected: true,
  deploymentFilesGenerated: true,
  dockerHubConnected: true,
  ec2Connected: true,
  jenkinsConnected: true,
  cicdGenerated: true,
  autoDeployEnabled: false
}

Auto Deploy Status: {
  success: true,
  autoDeploy: { enabled: false, ... },
  debug: {
    setupStatus: {...},
    canEnableAutoDeploy: true,
    missingRequirements: []
  }
}
```

## Common Issues and Solutions

### Issue: "Cannot Enable Auto Deploy because: Jenkins Job Created = Pending"

**Solution:**
1. Jenkins job might not have been created yet
2. Try: Build Progress → Generate CI/CD Pipeline → Create Jenkins Job
3. Check MongoDB to verify job was saved
4. Refresh page - backend should now find it

### Issue: "Cannot Enable Auto Deploy because: GitHub Webhook Configured = Pending"

**Solution:**
1. Webhook might not have been created yet
2. Try: Build Progress → Create GitHub Webhook
3. Verify webhook appears in GitHub repo settings
4. Refresh page - backend should now find it

### Issue: Button enables but then shows error when clicked

**Solution:**
1. One of the final validations is failing
2. Check error message on screen
3. Common: Docker Hub not connected, EC2 validation failed, Jenkins unreachable
4. Fix the issue and retry

## Manual Enable (Advanced)

If the button is still disabled but you know all conditions are met:

```bash
# Via API call (using curl or Postman)
POST /api/deployments/auto-deploy/enable
Body: {
  "deploymentId": "your-deployment-id",
  "owner": "github-owner",
  "repo": "repo-name",
  "branch": "main"
}

# Response should show: "success": true
```

## Performance Notes

- First check takes ~2-3 seconds (multiple database queries)
- Subsequent checks are faster (cached results)
- If slow, check if MongoDB is responsive
- If very slow, Jenkins connection might be timing out

## Getting Help

If you're still stuck, provide:
1. The console logs (copy from DevTools)
2. The backend logs (copy relevant [Auto Deploy] lines)
3. Screenshot of the error message
4. What step you're on in Build Progress

---

**Last Updated:** 2024
**Version:** 2.0 (Enhanced Debugging)
