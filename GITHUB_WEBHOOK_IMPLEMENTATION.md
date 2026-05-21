# GitHub Webhook Auto-Trigger System - Implementation Guide

## Overview
The DevOps Hub webhook system automatically triggers Jenkins pipelines when GitHub events occur (push, pull requests, releases).

## System Architecture

```
GitHub → Webhook HTTP POST 
  ↓
/api/webhooks/github (Public endpoint)
  ↓
Signature Verification (HMAC-SHA256)
  ↓
Extract Event Data (repository, commit, branch, author, SHA)
  ↓
Save to MongoDB (Webhook collection)
  ↓
Trigger Jenkins Pipeline via Jenkins API
  ↓
Store Build Number & Status
  ↓
Return Response to GitHub
```

## Current Implementation Status

### ✅ Implemented Components

1. **Webhook Routes** (`backend/src/routes/webhookRoutes.js`)
   - Public endpoint: `POST /api/webhooks/github`
   - Protected endpoints for history/stats/management

2. **Webhook Controller** (`backend/src/controllers/webhookController.js`)
   - `handleGitHubWebhook()` - Main webhook handler
   - Signature verification
   - Event type routing (push, PR, release)
   - Error handling

3. **Webhook Service** (`backend/src/services/webhookService.js`)
   - `processWebhookEvent()` - Process and store webhook
   - Triggers Jenkins pipeline
   - Stores build info in database
   - History/stats retrieval

4. **Webhook Model** (`backend/src/models/Webhook.js`)
   - Stores: event type, repository, commit, branch, status
   - Tracks Jenkins build number
   - Stores raw payload for debugging

5. **GitHub Signature Verification** (`backend/src/utils/webhookVerifier.js`)
   - HMAC-SHA256 verification
   - Data extraction for push/PR/release events

6. **Jenkins Integration** (`backend/src/services/jenkinsService.js`)
   - `triggerJenkinsPipeline()` - Triggers Jenkins builds
   - Passes webhook data as build parameters
   - Stores build history in MongoDB

### Environment Variables

```env
# Jenkins Configuration
JENKINS_URL=http://localhost:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=117e1ccde0cced51ac00e8452932eb71b8
JENKINS_JOB_NAME=devops-hub-deploy

# GitHub Webhook Secret
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret-key

# Database
MONGODB_URI=mongodb+srv://...
```

## GitHub Webhook Setup Steps

### 1. Generate GitHub Webhook Secret
```bash
# Generate a secure random string
openssl rand -hex 32
# Output example: abc123def456...
```

### 2. Configure GitHub Webhook
1. Go to Repository → Settings → Webhooks → Add webhook
2. Set Payload URL: `https://your-domain/api/webhooks/github`
3. Set Content type: `application/json`
4. Set Secret: (paste the generated secret)
5. Select events:
   - Push events
   - Pull request events
   - Releases
6. Click "Add webhook"

### 3. Update Backend .env
```env
GITHUB_WEBHOOK_SECRET=abc123def456...
```

### 4. Verify Webhook Connection
GitHub will send a test ping. Check:
- Backend logs for "GitHub webhook signature verified"
- MongoDB for webhook entry in Webhooks collection
- Jenkins for triggered build

## API Endpoints

### 1. GitHub Webhook (Public)
```bash
POST /api/webhooks/github
# No authentication required
# GitHub sends this automatically on configured events
```

**Response on Success:**
```json
{
  "success": true,
  "webhookId": "507f1f77bcf86cd799439011",
  "buildNumber": 42,
  "buildUrl": "http://localhost:8080/job/devops-hub-deploy/42/",
  "message": "Webhook processed successfully. Jenkins build #42 started."
}
```

**Response on Failure:**
```json
{
  "success": false,
  "webhookId": "507f1f77bcf86cd799439011",
  "error": "Jenkins token not configured",
  "message": "Webhook received but Jenkins trigger failed"
}
```

### 2. Get Webhook History (Protected)
```bash
GET /api/webhooks/history?limit=50&skip=0
# Requires: Authorization: Bearer <JWT_TOKEN>
```

### 3. Get Webhook by ID (Protected)
```bash
GET /api/webhooks/:webhookId
# Requires: Authorization: Bearer <JWT_TOKEN>
```

### 4. Get Webhooks by Repository (Protected)
```bash
GET /api/webhooks/repo/:repoName?limit=20&skip=0
# Requires: Authorization: Bearer <JWT_TOKEN>
```

### 5. Get Webhook Statistics (Protected)
```bash
GET /api/webhooks/stats
# Requires: Authorization: Bearer <JWT_TOKEN>
```

## Data Flow Example: GitHub Push Event

### 1. GitHub Sends Push Event
```json
{
  "repository": {
    "name": "devops-dashboard",
    "full_name": "dadwalarsh99/devops-dashboard",
    "html_url": "https://github.com/dadwalarsh99/devops-dashboard"
  },
  "ref": "refs/heads/main",
  "commits": [
    {
      "id": "abc123def456",
      "message": "Fix deployment issue",
      "author": {
        "name": "John Doe",
        "email": "john@example.com"
      },
      "timestamp": "2026-05-12T10:30:00Z"
    }
  ],
  "pusher": {
    "name": "johndoe",
    "email": "john@example.com"
  }
}
```

### 2. Backend Extracts Data
```json
{
  "event": "push",
  "repository": {
    "name": "devops-dashboard",
    "owner": "dadwalarsh99",
    "fullName": "dadwalarsh99/devops-dashboard",
    "url": "https://github.com/dadwalarsh99/devops-dashboard"
  },
  "commit": {
    "sha": "abc123def456",
    "message": "Fix deployment issue",
    "author": {
      "name": "John Doe",
      "email": "john@example.com",
      "username": null
    },
    "timestamp": "2026-05-12T10:30:00Z",
    "url": null
  },
  "branch": "main"
}
```

### 3. Jenkins Build Parameters
```
REPO_NAME=devops-dashboard
COMMIT_SHA=abc123def456
COMMIT_MESSAGE=Fix deployment issue
AUTHOR=John Doe
BRANCH=main
ENVIRONMENT=development
```

### 4. MongoDB Storage
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "event": "push",
  "repository": {
    "name": "devops-dashboard",
    "owner": "dadwalarsh99",
    "fullName": "dadwalarsh99/devops-dashboard",
    "url": "https://github.com/dadwalarsh99/devops-dashboard"
  },
  "commit": {
    "sha": "abc123def456",
    "message": "Fix deployment issue",
    "author": {
      "name": "John Doe",
      "email": "john@example.com"
    },
    "timestamp": "2026-05-12T10:30:00Z"
  },
  "branch": "main",
  "jenkinsPipelineTriggered": true,
  "jenkinsBuildNumber": 42,
  "status": "success",
  "createdAt": "2026-05-12T10:30:05Z"
}
```

## Testing the Webhook

### 1. Test with Mock Event
```bash
curl -X POST http://localhost:5000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-GitHub-Delivery: 12345-67890" \
  -H "X-Hub-Signature-256: sha256=your-calculated-hmac" \
  -d '{
    "repository": {
      "name": "test-repo",
      "full_name": "user/test-repo",
      "owner": {"login": "user"},
      "html_url": "https://github.com/user/test-repo"
    },
    "ref": "refs/heads/main",
    "commits": [{
      "id": "abc123",
      "message": "Test commit",
      "author": {"name": "Test User", "email": "test@example.com"}
    }]
  }'
```

### 2. Generate Valid HMAC Signature
```javascript
const crypto = require('crypto');
const secret = "your-github-webhook-secret-key";
const payload = JSON.stringify({...});
const hmac = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');
const signature = 'sha256=' + hmac;
```

### 3. Check MongoDB
```bash
# Connect to MongoDB
mongosh

# Use database
use devops-dashboard

# Find webhooks
db.webhooks.find().pretty()
```

### 4. Verify Jenkins
- Check Jenkins UI: http://localhost:8080/job/devops-hub-deploy/
- Look for new build triggered with webhook data

## Troubleshooting

### Issue: "Invalid GitHub webhook signature"
**Cause:** Secret mismatch
**Solution:** 
- Verify GITHUB_WEBHOOK_SECRET in .env matches GitHub settings
- Check if webhook secret was changed in GitHub but not in .env

### Issue: "Jenkins not configured"
**Cause:** JENKINS_TOKEN not set or empty
**Solution:**
- Verify JENKINS_TOKEN in .env
- Check Jenkins authentication is working: `curl -u admin:$TOKEN http://jenkins:8080/api/json`

### Issue: "Database not connected"
**Cause:** MongoDB connection failure
**Solution:**
- Check MONGODB_URI in .env
- Verify MongoDB Atlas IP whitelist includes server IP
- Test connection: `mongosh $MONGODB_URI`

### Issue: Build not triggered
**Cause:** Multiple possible causes
**Solution:**
- Check backend logs for error messages
- Verify Jenkins job name: JENKINS_JOB_NAME in .env
- Check Jenkins job supports parameterized builds
- Verify Jenkins user has build permissions

## Monitoring & Logging

### Backend Logs
```
✅ GitHub signature verified
📝 [Webhook] Processing push event from devops-dashboard
✅ Webhook saved to database
🔄 Triggering Jenkins pipeline...
✅ Jenkins pipeline triggered successfully. Build: 42
```

### Database Queries
```javascript
// Get all webhooks
db.webhooks.find()

// Get successful webhooks
db.webhooks.find({ status: "success" })

// Get failed webhooks
db.webhooks.find({ status: "failed" })

// Get webhooks for specific repo
db.webhooks.find({ "repository.name": "devops-dashboard" })

// Get recent webhooks with build info
db.webhooks.find({
  jenkinsPipelineTriggered: true
}).sort({ createdAt: -1 }).limit(10)
```

## Security Considerations

1. **Signature Verification:** All GitHub webhooks are verified using HMAC-SHA256
2. **Secret Management:** Never commit GITHUB_WEBHOOK_SECRET or JENKINS_TOKEN to Git
3. **Public Endpoint:** `/api/webhooks/github` is public but protected by signature
4. **Protected Endpoints:** History/stats endpoints require JWT authentication
5. **Rate Limiting:** Consider implementing rate limiting for webhook endpoint
6. **HTTPS:** Always use HTTPS in production for webhooks

## Files Modified/Created

- ✅ `backend/src/controllers/webhookController.js` - Main webhook handler
- ✅ `backend/src/services/webhookService.js` - Webhook processing logic
- ✅ `backend/src/models/Webhook.js` - Webhook MongoDB schema
- ✅ `backend/src/routes/webhookRoutes.js` - Webhook API routes
- ✅ `backend/src/utils/webhookVerifier.js` - GitHub signature verification
- ✅ `backend/src/services/jenkinsService.js` - Jenkins triggering
- ✅ `backend/src/server.js` - Webhook routes registration
- ✅ `backend/.env` - Environment variables

## Next Steps

1. ✅ Test webhook endpoint locally
2. ✅ Verify Jenkins build triggering
3. ✅ Monitor MongoDB for webhook storage
4. ✅ Configure GitHub repository webhook
5. ✅ Test with actual push event
6. ✅ Monitor logs for errors
7. ✅ Set up production HTTPS endpoint
