# ⚡ Fully Automated Deployment - Quick Start (5 Minutes)

**Get up and running with fully automated deployments in just 5 minutes!**

---

## 📦 What You'll Get

```
GitHub Push
    ↓
DevOps Hub automatically:
    ✅ Detects tech stack
    ✅ Generates Dockerfile
    ✅ Generates docker-compose.yml
    ✅ Generates Jenkinsfile
    ✅ Builds Docker image
    ✅ Deploys to EC2
    ✅ Returns deployment URL
```

**Example Output:**
```
✅ Deployment Successful!
   URL: http://13.201.45.22:3000
```

---

## ⏱️ 5-Minute Setup

### Minute 1: Set Environment Variables

```bash
cd backend
nano .env
```

Add these lines:

```env
# Fully Automated Mode
WEBHOOK_DEPLOYMENT_MODE=fully-automated
ENABLE_AUTO_DEPLOYMENT=true

# AWS EC2 (Get from your EC2 console)
AWS_EC2_HOST=13.201.45.22
AWS_EC2_USER=ubuntu
AWS_EC2_KEY_PATH=/home/user/.ssh/devops-key.pem

# GitHub
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
```

### Minute 2: Test EC2 Connection

```bash
npm start

# In another terminal, test:
curl -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:5000/api/automation/ec2-config
```

Expected response:
```json
{
  "success": true,
  "ready": true
}
```

### Minute 3: Add GitHub Webhook

Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO/settings/webhooks`

Click "Add webhook":
- **Payload URL:** `https://your-domain.com/api/webhooks/github`
- **Secret:** Generate with: `openssl rand -hex 32`
- **Events:** Select "Push events"
- **Active:** ✅

Click "Add webhook"

### Minute 4: Test Deployment

```bash
# Make a small change
echo "# Test" >> README.md

# Commit and push
git add README.md
git commit -m "Test deployment"
git push origin main
```

### Minute 5: Monitor Deployment

Open DevOps Hub dashboard: `http://localhost:5173`

You should see:
```
📥 Cloning repository...
🔍 Detecting tech stack...
🐳 Generating Dockerfile...
📋 Generating docker-compose.yml...
🔨 Building Docker image...
🚀 Deploying to EC2...
❤️ Health checks...
✅ Deployment successful!

URL: http://13.201.45.22:3000
```

---

## ✅ Done! 🎉

Your repository is now **automatically deployed** whenever you push code.

---

## 📊 Supported Technologies

| Tech | Detection | Port | Status |
|------|-----------|------|--------|
| Node.js | ✅ Auto | 3000 | ✅ Ready |
| React | ✅ Auto | 3000 | ✅ Ready |
| Next.js | ✅ Auto | 3000 | ✅ Ready |
| Python | ✅ Auto | 8000 | ✅ Ready |
| Django | ✅ Auto | 8000 | ✅ Ready |
| Flask | ✅ Auto | 5000 | ✅ Ready |
| FastAPI | ✅ Auto | 8000 | ✅ Ready |
| Go | ✅ Auto | 8080 | ✅ Ready |
| Java | ✅ Auto | 8080 | ✅ Ready |
| Ruby | ✅ Auto | 3000 | ✅ Ready |
| Static HTML | ✅ Auto | 80 | ✅ Ready |

---

## 🚀 Example: Deploy a React App

### 1. Push React App to GitHub

```bash
# Create or push existing React app
npx create-react-app my-app
cd my-app

git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/my-app.git
git push -u origin main
```

### 2. DevOps Hub Automatically:

```
✅ Detects React + Node.js
✅ Generates Dockerfile with multi-stage build
✅ Creates docker-compose.yml with port 3000
✅ Builds optimized image
✅ Deploys to EC2
✅ Returns: http://YOUR_EC2_IP:3000
```

### 3. Your App is Live!

Open browser: `http://YOUR_EC2_IP:3000` → Your React app is running! 🎉

---

## 🐍 Example: Deploy a Python Django App

### 1. Push Django App

```bash
# Create Django project
django-admin startproject myproject .
python manage.py startapp myapp

# Create requirements.txt
pip freeze > requirements.txt

# Push to GitHub
git add .
git commit -m "Django app"
git push origin main
```

### 2. DevOps Hub Automatically:

```
✅ Detects Python + Django
✅ Generates Dockerfile with python:3.11-slim
✅ Creates docker-compose.yml with port 8000
✅ Builds image
✅ Deploys to EC2
✅ Returns: http://YOUR_EC2_IP:8000
```

### 3. Your Django App is Live!

Open browser: `http://YOUR_EC2_IP:8000` → Django admin loaded! 🎉

---

## 🔗 View Deployment Status

### Real-time Dashboard
Open `http://localhost:5173/dashboard`

### API Query
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/automation/deployments
```

### Monitor Specific Deployment
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/automation/deployment/deploy-1234567890
```

---

## 🚨 Troubleshooting

### Webhook not triggering?

1. Check GitHub webhook delivery: `Settings → Webhooks → Recent Deliveries`
2. Verify payload URL is correct
3. Ensure DevOps Hub is accessible from GitHub

### Deployment fails at tech detection?

1. Ensure repo has `package.json`, `requirements.txt`, or similar
2. Check git clone permissions

### SSH connection fails?

1. Verify `AWS_EC2_HOST` and `AWS_EC2_KEY_PATH`
2. Test SSH manually:
   ```bash
   ssh -i ~/.ssh/devops-key.pem ubuntu@YOUR_EC2_IP
   ```

### Container won't start?

1. Check logs: `docker logs container-name`
2. Verify Dockerfile syntax in generated file
3. Check port availability

---

## 📚 Full Documentation

For detailed information, see:
- [FULLY_AUTOMATED_DEPLOYMENT.md](./FULLY_AUTOMATED_DEPLOYMENT.md)
- [AWS_EC2_AUTOMATED_SETUP.md](./AWS_EC2_AUTOMATED_SETUP.md)

---

## 🎯 Next Steps

1. ✅ Configure environment variables
2. ✅ Test EC2 connection
3. ✅ Add GitHub webhook
4. ✅ Push code
5. ✅ View deployment
6. ✅ Access your app!

**That's it! 🚀 You're done.**

Every push to GitHub now automatically:
- Detects your tech stack
- Generates deployment files
- Builds and deploys to EC2
- Returns your app URL

No manual configuration needed.
No Dockerfile to maintain.
No CI/CD pipeline to setup.

Just push code and let DevOps Hub handle the rest! 🎉
