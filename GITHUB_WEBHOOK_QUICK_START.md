# GitHub Webhook Quick Start Guide

## ✅ System Status
- All webhook components implemented and tested
- GitHub signature verification working
- Jenkins pipeline triggering functional
- MongoDB storage operational
- All test cases passing (6/6)

## 📋 Supported GitHub Events

1. **Push Events** - Trigger Jenkins on code push
2. **Pull Request Events** - Trigger on PR creation/update
3. **Release Events** - Trigger on new releases

## 🚀 Quick Setup (5 minutes)

### Step 1: Generate Webhook Secret
```bash
# Generate secure random string
openssl rand -hex 32

# Example output:
# 8f7a3c9d2b1e4f6a8c5e7d9b2f1a4c6e8f3b9d5a7c2e4f1a6b8d0e3c5a7f9b
```

### Step 2: Update Backend .env
```bash
cd backend
nano .env  # or edit with your editor
```

Add/Update these lines:
```env
GITHUB_WEBHOOK_SECRET=8f7a3c9d2b1e4f6a8c5e7d9b2f1a4c6e...
JENKINS_URL=http://localhost:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=117e1ccde0cced51ac00e8452932eb71b8
JENKINS_JOB_NAME=devops-hub-deploy
```

### Step 3: Configure GitHub Webhook
1. Go to your repository on GitHub
2. Settings → Webhooks → Add webhook
3. Fill in the form:
   - **Payload URL:** `https://your-domain/api/webhooks/github`
   - **Content type:** `application/json`
   - **Secret:** (paste your generated secret)
   - **Events:** Select "Let me select individual events"
     - ✓ Pushes
     - ✓ Pull requests
     - ✓ Releases
   - ✓ Active
4. Click "Add webhook"

### Step 4: Verify Connection
GitHub will send a test ping. You should see:

**In Backend Logs:**
```
✅ GitHub signature verified
📝 [Webhook] Processing push event
✅ Webhook saved to database
🔄 Triggering Jenkins pipeline...
✅ Jenkins pipeline triggered successfully. Build: 42
```

**In MongoDB:**
```bash
db.webhooks.findOne()
# Should show webhook entry with status: "success"
```

**In Jenkins:**
```
Visit http://localhost:8080/job/devops-hub-deploy/
Should see new build triggered with webhook parameters
```

## 📡 API Endpoints

### Public Endpoints (No Auth)

**Receive Push Event**
```bash
POST /api/webhooks/github
Headers:
  X-GitHub-Event: push
  X-Hub-Signature-256: sha256=...
  Content-Type: application/json

Response:
{
  "success": true,
  "webhookId": "507f1f77bcf86cd799439011",
  "buildNumber": 42,
  "buildUrl": "http://localhost:8080/job/devops-hub-deploy/42/",
  "message": "Webhook processed successfully..."
}
```

### Protected Endpoints (Require JWT Token)

**Get All Webhooks**
```bash
GET /api/webhooks/history?limit=50&skip=0
Header: Authorization: Bearer <JWT_TOKEN>

Response:
{
  "webhooks": [...],
  "total": 150,
  "limit": 50,
  "skip": 0
}
```

**Get Specific Webhook**
```bash
GET /api/webhooks/:webhookId
Header: Authorization: Bearer <JWT_TOKEN>

Response:
{
  "_id": "507f1f77bcf86cd799439011",
  "event": "push",
  "repository": {...},
  "commit": {...},
  "branch": "main",
  "jenkinsPipelineTriggered": true,
  "jenkinsBuildNumber": 42,
  "status": "success"
}
```

**Get Webhooks by Repository**
```bash
GET /api/webhooks/repo/devops-dashboard?limit=20&skip=0
Header: Authorization: Bearer <JWT_TOKEN>
```

**Get Statistics**
```bash
GET /api/webhooks/stats
Header: Authorization: Bearer <JWT_TOKEN>

Response:
{
  "totalWebhooks": 150,
  "successfulWebhooks": 145,
  "failedWebhooks": 5,
  "averageBuildTime": 45000,
  "repositories": {...}
}
```

**Webhook Health Check** (Public)
```bash
GET /api/webhooks/health

Response:
{
  "status": "ok",
  "message": "Webhook service is running",
  "timestamp": "2026-05-12T10:30:00Z"
}
```

## 🧪 Manual Testing

### Test Without GitHub (Local Testing)

**1. Generate Test Signature**
```bash
node -e "
const crypto = require('crypto');
const secret = 'your-github-webhook-secret-key';
const payload = JSON.stringify({
  repository: { name: 'test', full_name: 'user/test', owner: { login: 'user' }, html_url: 'http://example.com' },
  ref: 'refs/heads/main',
  commits: [{
    id: 'abc123',
    message: 'Test commit',
    author: { name: 'Test User' },
    timestamp: new Date().toISOString()
  }]
});
const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
console.log('Signature: sha256=' + hmac);
console.log('Payload:', payload);
"
```

**2. Send Test Webhook**
```bash
curl -X POST http://localhost:5000/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-GitHub-Delivery: test-123" \
  -H "X-Hub-Signature-256: sha256=YOUR_CALCULATED_HMAC" \
  -d 'YOUR_PAYLOAD_JSON'
```

**3. Use Provided Test Script**
```bash
node test-webhook-system.js
```

Expected output:
```
🎉 All tests passed!
✅ Passed: 6/6
```

## 📊 Monitoring & Debugging

### Check Webhook Processing
```bash
# Monitor backend logs
tail -f backend.log

# Look for:
✅ GitHub signature verified
📝 [Webhook] Processing push event
🔄 Triggering Jenkins pipeline...
✅ Jenkins pipeline triggered successfully
```

### Query Webhook Database
```bash
mongosh
use devops-dashboard
db.webhooks.find({}).pretty()

# Find successful webhooks
db.webhooks.find({ status: "success" }).pretty()

# Find failed webhooks
db.webhooks.find({ status: "failed" }).pretty()

# Get recent webhooks
db.webhooks.find({}).sort({ createdAt: -1 }).limit(10).pretty()
```

### Verify Jenkins Trigger
```bash
# Check Jenkins job
curl -u admin:$JENKINS_TOKEN http://localhost:8080/job/devops-hub-deploy/api/json | jq '.lastBuild'

# Look for recent builds with webhook parameters
```

## 🔧 Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Invalid GitHub webhook signature" | Secret mismatch | Verify GITHUB_WEBHOOK_SECRET matches GitHub settings |
| "Jenkins not configured" | JENKINS_TOKEN missing | Set JENKINS_TOKEN in .env |
| "Database not connected" | MongoDB connection failed | Check MONGODB_URI, verify IP whitelist |
| Build not triggered | Job doesn't accept parameters | Ensure Jenkins job has parameterized build enabled |
| Webhook not received | GitHub delivery failed | Check GitHub webhook delivery history in repo settings |

## 🔐 Security Checklist

- [ ] GITHUB_WEBHOOK_SECRET is set and kept secret
- [ ] JENKINS_TOKEN is not committed to Git
- [ ] Webhook endpoint is HTTPS in production
- [ ] GitHub IP addresses are whitelisted in firewall
- [ ] Jenkins job is parameterized and secure
- [ ] MongoDB credentials are not exposed
- [ ] Rate limiting is configured (optional)

## 📈 What Happens When You Push Code

```
GitHub Push Event
  ↓ (HTTPS)
/api/webhooks/github (Public endpoint)
  ↓ (Verify HMAC-SHA256 signature)
Signature Valid? → YES
  ↓
Extract event data:
  - Repository name
  - Branch name
  - Commit SHA
  - Commit message
  - Author name & email
  ↓
Save to MongoDB Webhooks collection
  ↓
Trigger Jenkins Pipeline via API:
  POST /job/devops-hub-deploy/buildWithParameters
  Params:
    - REPO_NAME=devops-dashboard
    - BRANCH=main
    - COMMIT_SHA=abc123...
    - COMMIT_MESSAGE=Your message
    - AUTHOR=Your name
  ↓
Jenkins Build Starts
  ↓
Update MongoDB with build number
  ↓
Return 200 OK to GitHub
  ↓
Build runs and logs appear in Jenkins UI
  ↓
Build history stored in MongoDB for dashboard
```

## 📚 Documentation Files

- [GITHUB_WEBHOOK_IMPLEMENTATION.md](GITHUB_WEBHOOK_IMPLEMENTATION.md) - Full technical documentation
- [BACKEND_API_REFERENCE.md](BACKEND_API_REFERENCE.md) - Complete API reference
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions

## 🎯 Next Steps

1. ✅ **Test Locally** - Run `node test-webhook-system.js`
2. ✅ **Setup GitHub** - Configure webhook in repository settings
3. ✅ **Test with Real Event** - Push code to trigger webhook
4. ✅ **Monitor** - Check logs and Jenkins UI
5. ✅ **Deploy** - Move to production with HTTPS

## 📞 Support

If you encounter issues:
1. Check troubleshooting section above
2. Review backend logs for error messages
3. Verify all environment variables are set
4. Run test script to validate setup
5. Check MongoDB for webhook entries

---

**Last Updated:** May 13, 2026
**Status:** ✅ Production Ready
**Tests:** 6/6 Passing
