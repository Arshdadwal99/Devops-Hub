# GitHub Webhook & Jenkins Integration Guide

This guide explains how to set up GitHub webhooks to automatically trigger Jenkins pipelines when code is pushed to your repositories.

## Architecture

```
GitHub Repository
    ↓ (Push Event)
GitHub Webhook
    ↓ (POST request to webhook endpoint)
DevOps Hub Backend (Webhook Receiver)
    ↓ (Verify GitHub signature)
    ↓ (Extract commit/repo data)
    ↓ (Store in MongoDB)
    ↓ (Trigger Jenkins pipeline)
Jenkins CI/CD
    ↓ (Run build/deploy job)
Deployment
```

## Setup Instructions

### Step 1: Configure Jenkins

1. **Create Jenkins API Token**
   - Go to Jenkins → Manage Jenkins → Security → Users → admin
   - Click your username → Configure
   - Scroll to "API Token"
   - Click "Add new Token"
   - Name it: `devops-hub-webhook`
   - Copy the token

2. **Create Jenkins Job**
   - Create a new job (e.g., `devops-hub-deploy`)
   - Configure it to accept parameters:
     - `REPO_NAME` (string)
     - `COMMIT_SHA` (string)
     - `COMMIT_MESSAGE` (string)
     - `AUTHOR` (string)
     - `BRANCH` (string)

3. **Configure Build Trigger**
   - In your Jenkins job: Check "This project is parameterized"
   - Add String Parameters for each parameter above

### Step 2: Configure Backend Environment Variables

Edit `backend/.env`:

```env
# GitHub Webhook
GITHUB_WEBHOOK_SECRET=your-webhook-secret-key
GITHUB_WEBHOOK_URL=http://localhost:5000/api/webhooks/github

# Jenkins Configuration
JENKINS_URL=http://localhost:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=your-jenkins-api-token-here
JENKINS_JOB_NAME=devops-hub-deploy
```

### Step 3: Set Up GitHub Webhook

1. **Go to GitHub Repository**
   - Settings → Webhooks → Add webhook

2. **Configure Webhook**
   - **Payload URL**: `http://your-domain.com/api/webhooks/github`
     - For local development: Use ngrok tunnel or similar
     - Example: `https://abc123.ngrok.io/api/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Enter your webhook secret (must match `GITHUB_WEBHOOK_SECRET`)
   - **Events**: Select specific events:
     - ✅ Push events
     - ✅ Pull requests
     - ✅ Releases
   - ✅ Active: Checked

3. **Test Webhook**
   - In GitHub Webhooks section, click "Recent Deliveries"
   - You should see successful deliveries (status 200)

### Step 4: For Local Development with ngrok

If developing locally, use ngrok to expose your local server:

```bash
# Install ngrok
choco install ngrok  # or download from ngrok.com

# Start ngrok tunnel
ngrok http 5000

# You'll get a URL like: https://abc123.ngrok.io
# Use this as your Payload URL in GitHub webhook settings
```

## API Endpoints

### Webhook Endpoints

#### 1. **Receive GitHub Webhook** (Public)
```
POST /api/webhooks/github
Headers:
  - X-Hub-Signature-256: sha256=hash
  - X-GitHub-Event: push
  - X-GitHub-Delivery: delivery-id

Response:
{
  "success": true,
  "webhookId": "mongodb-id",
  "buildNumber": 42,
  "buildUrl": "http://jenkins:8080/job/devops-hub-deploy/42",
  "message": "Webhook processed successfully..."
}
```

#### 2. **Get Webhook History** (Protected)
```
GET /api/webhooks/history?limit=50&skip=0

Response:
{
  "webhooks": [...],
  "total": 100,
  "limit": 50,
  "skip": 0
}
```

#### 3. **Get Specific Webhook** (Protected)
```
GET /api/webhooks/:webhookId

Response:
{
  "_id": "...",
  "event": "push",
  "repository": {...},
  "commit": {...},
  "branch": "main",
  "status": "success",
  "jenkinsBuildNumber": 42,
  "createdAt": "2026-05-04..."
}
```

#### 4. **Get Repository Webhooks** (Protected)
```
GET /api/webhooks/repo/:repoName?limit=20&skip=0

Response:
{
  "repository": "devops-dashboard",
  "webhooks": [...],
  "total": 25,
  "limit": 20,
  "skip": 0
}
```

#### 5. **Get Webhook Statistics** (Protected)
```
GET /api/webhooks/stats

Response:
{
  "statusStats": [
    {"_id": "success", "count": 87},
    {"_id": "failed", "count": 5}
  ],
  "eventStats": [
    {"_id": "push", "count": 80},
    {"_id": "pull_request", "count": 12}
  ],
  "topRepositories": [
    {"_id": "devops-dashboard", "count": 45},
    {"_id": "another-repo", "count": 20}
  ],
  "total": 92
}
```

#### 6. **Delete Webhook** (Protected)
```
DELETE /api/webhooks/:webhookId

Response:
{
  "success": true,
  "message": "Webhook deleted successfully"
}
```

#### 7. **Webhook Health Check** (Public)
```
GET /api/webhooks/health

Response:
{
  "status": "ok",
  "message": "Webhook service is running",
  "timestamp": "2026-05-04T..."
}
```

## Webhook Data Stored

For each webhook event, the following data is stored in MongoDB:

```javascript
{
  "_id": "ObjectId",
  "event": "push", // push, pull_request, release
  "repository": {
    "name": "devops-dashboard",
    "owner": "dadwalarsh99",
    "fullName": "dadwalarsh99/devops-dashboard",
    "url": "https://github.com/..."
  },
  "commit": {
    "sha": "abc123def456...",
    "message": "Fix bug in authentication",
    "author": {
      "name": "John Doe",
      "email": "john@example.com",
      "username": "johndoe"
    },
    "timestamp": "2026-05-04T10:30:00Z",
    "url": "https://github.com/.../commit/abc123..."
  },
  "branch": "main",
  "pusher": {
    "name": "johndoe",
    "email": "john@example.com"
  },
  "jenikinsPipelineTriggered": true,
  "jenkinsBuildNumber": 42,
  "status": "success",
  "createdAt": "2026-05-04T10:30:05Z",
  "updatedAt": "2026-05-04T10:30:05Z"
}
```

## Troubleshooting

### Webhook Not Triggering

1. **Check GitHub Webhook Status**
   - Go to GitHub → Repository Settings → Webhooks
   - Click Recent Deliveries
   - Check if requests show status 200

2. **Verify Secret**
   - Make sure `GITHUB_WEBHOOK_SECRET` matches GitHub webhook secret

3. **Check Backend Logs**
   ```
   ✅ GitHub signature verified
   📝 [Webhook] Processing push event
   🔄 Triggering Jenkins pipeline...
   ✅ Jenkins pipeline triggered successfully
   ```

4. **Verify Jenkins Connection**
   - Test Jenkins URL manually
   - Check Jenkins credentials
   - Verify job name exists

### Jenkins Not Triggering

1. **Verify Jenkins Credentials**
   ```bash
   # Test Jenkins API
   curl -u admin:your-token http://localhost:8080/api/json
   ```

2. **Check Job Exists**
   - Go to Jenkins → Check if job `JENKINS_JOB_NAME` exists

3. **Verify Job Accepts Parameters**
   - In Jenkins Job → Configure → Check "This project is parameterized"

4. **Check Firewall**
   - Ensure backend can connect to Jenkins port 8080

### Signature Verification Failed

1. **Verify Secret Matches**
   - GitHub webhook secret = `GITHUB_WEBHOOK_SECRET`

2. **Check Payload Integrity**
   - Webhook payload not modified in transit

3. **Timing Issues**
   - Ensure server time is accurate (can affect HMAC validation)

## Security Best Practices

1. **Use Strong Webhook Secret**
   - Generate a random, long secret key
   - Example: `openssl rand -hex 32`

2. **Use HTTPS in Production**
   - GitHub webhooks require HTTPS
   - Use certificates from Let's Encrypt or AWS

3. **Rate Limiting**
   - Implement rate limiting on webhook endpoint
   - Prevent abuse from repeated requests

4. **IP Whitelisting**
   - Restrict webhook endpoint to GitHub's IP ranges
   - Current GitHub IPs: https://api.github.com/meta

5. **Audit Logging**
   - Log all webhook activities
   - Monitor failed webhook attempts

6. **Rotate Tokens Regularly**
   - Rotate Jenkins API tokens every 90 days
   - Use a secrets manager in production

## Testing

### Manual Webhook Test

```bash
# Simulate GitHub webhook locally
GITHUB_WEBHOOK_SECRET="your-secret"
PAYLOAD='{"repository":{"name":"test-repo"},"commits":[{"message":"test commit"}]}'

# Calculate signature
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$GITHUB_WEBHOOK_SECRET" | sed 's/^.* //')

# Send test webhook
curl -X POST \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -H "X-GitHub-Event: push" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  http://localhost:5000/api/webhooks/github
```

## Advanced Configuration

### Multiple Repositories

To handle multiple repositories:

1. Create separate Jenkins jobs for each repo
2. In webhook service, route to appropriate job based on repo name

### Conditional Triggers

Only trigger on specific branches:

```javascript
// In webhookVerifier.js
if (webhookData.branch !== "main" && webhookData.branch !== "develop") {
  return null; // Skip webhook processing
}
```

### Notification Integration

Add Slack/Email notifications:

```javascript
// In webhookService.js
await notifySlack({
  repository: webhookData.repository.name,
  branch: webhookData.branch,
  buildNumber: jenkinResult.buildNumber
});
```

## References

- [GitHub Webhooks Documentation](https://docs.github.com/en/developers/webhooks-and-events/webhooks)
- [Jenkins REST API](https://www.jenkins.io/doc/book/using/remote-access-api/)
- [ngrok Documentation](https://ngrok.com/docs)
- [HMAC Signature Verification](https://docs.github.com/en/developers/webhooks-and-events/webhooks/securing-your-webhooks)
