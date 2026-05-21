# GitHub Webhook & Jenkins Integration - Quick Start

## ⚡ 5-Minute Setup

### 1. Get Jenkins API Token
```
Jenkins → Profile → Configure → API Token → Add new Token
Copy the token
```

### 2. Update backend/.env
```env
GITHUB_WEBHOOK_SECRET=your-secret-key
JENKINS_URL=http://localhost:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=<your-token>
JENKINS_JOB_NAME=devops-hub-deploy
```

### 3. Setup GitHub Webhook
- Go to GitHub Repo → Settings → Webhooks → Add webhook
- **Payload URL**: `http://your-domain/api/webhooks/github`
- **Secret**: `your-secret-key` (from .env)
- **Events**: Push events, Pull requests, Releases
- Click "Add webhook"

### 4. Test Webhook
```bash
# Check webhook delivery in GitHub
Settings → Webhooks → Recent Deliveries → Should show 200 status
```

## 📊 API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/webhooks/github` | ❌ | Receive GitHub webhooks |
| GET | `/api/webhooks/health` | ❌ | Health check |
| GET | `/api/webhooks/history` | ✅ | Webhook history |
| GET | `/api/webhooks/:id` | ✅ | Get webhook details |
| GET | `/api/webhooks/repo/:name` | ✅ | Repository webhooks |
| GET | `/api/webhooks/stats` | ✅ | Statistics |
| DELETE | `/api/webhooks/:id` | ✅ | Delete webhook |

## 🔄 Webhook Flow

1. Developer pushes code to GitHub
2. GitHub sends webhook to `POST /api/webhooks/github`
3. Backend verifies GitHub signature
4. Extracts: repo name, commit message, author
5. Stores in MongoDB
6. Triggers Jenkins pipeline
7. Returns build number to GitHub

## 📝 Example Webhook Data

```javascript
{
  event: "push",
  repository: {
    name: "devops-dashboard",
    owner: "dadwalarsh99",
    fullName: "dadwalarsh99/devops-dashboard"
  },
  commit: {
    sha: "abc123def456",
    message: "Fix authentication bug",
    author: {
      name: "John Doe",
      email: "john@example.com"
    }
  },
  branch: "main",
  status: "success",
  jenkinsBuildNumber: 42
}
```

## 🚨 Troubleshooting

### Webhook Not Received?
1. Check GitHub Recent Deliveries - should show 200 status
2. Verify webhook secret matches `GITHUB_WEBHOOK_SECRET`
3. Check backend logs for errors

### Jenkins Not Triggered?
1. Verify `JENKINS_URL` is correct
2. Test credentials: `curl -u admin:token http://jenkins:8080/api/json`
3. Check Jenkins job exists and accepts parameters
4. Review backend logs for Jenkins errors

### Signature Verification Failed?
1. Verify GitHub secret exactly matches .env
2. Check no whitespace issues in secret
3. Ensure payload not modified in transit

## 🔐 Security

- ✅ GitHub signatures verified with HMAC-SHA256
- ✅ Webhook secret stored in .env
- ✅ Jenkins token stored in .env
- ✅ Protected endpoints require authentication
- ✅ All data logged and auditable

## 📚 Full Documentation

See [WEBHOOK_JENKINS_SETUP.md](WEBHOOK_JENKINS_SETUP.md) for complete setup guide.

## 🧪 Test Webhook Locally

```bash
SIGNATURE=$(echo -n '{"test":"payload"}' | openssl dgst -sha256 -hmac "secret" | sed 's/^.* //')

curl -X POST \
  -H "X-Hub-Signature-256: sha256=$SIGNATURE" \
  -H "X-GitHub-Event: push" \
  -d '{"repository":{"name":"test"},"commits":[{"message":"test"}]}' \
  http://localhost:5000/api/webhooks/github
```

## 📈 Monitor Webhooks

```bash
# Get statistics
curl -H "Authorization: Bearer token" \
  http://localhost:5000/api/webhooks/stats

# Get recent webhooks
curl -H "Authorization: Bearer token" \
  http://localhost:5000/api/webhooks/history?limit=10
```

---

✅ **All set!** Webhooks are now active and ready to trigger builds on every push.
