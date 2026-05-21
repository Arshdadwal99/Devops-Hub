# 🚀 DevOps Hub - Complete CI/CD Production Setup Guide

## Executive Summary

This document provides the complete, production-ready setup for your DevOps Hub CI/CD automation system. The system is **100% automated** - from GitHub push to real-time dashboard monitoring.

### System Architecture

```
GitHub Push
    ↓
GitHub Webhook (POST /webhook)
    ↓
Jenkins Pipeline Auto-Trigger
    ↓
1. Clone Latest Code
2. Install Dependencies
3. Build Application
4. Build Docker Image
5. Push to Registry (optional)
    ↓
Old Container Stop & Remove
    ↓
New Container Deploy on AWS EC2
    ↓
Real-Time Dashboard Updates (Socket.io)
    ↓
Logs, Metrics, Alerts, Deployment Status
```

---

## 📋 Prerequisites

### Required Infrastructure
- **GitHub Repository** - Code repository with webhooks enabled
- **Jenkins Server** - Installed on AWS EC2 (or local)
- **Docker** - Installed on deployment host
- **MongoDB Atlas** - Cloud database for logs, deployments, metrics
- **AWS EC2** - Target deployment server (optional, for EC2 deployment)
- **OpenAI API** - For AI log analysis (optional)

### Required Access Credentials
- GitHub personal access token
- Jenkins API token
- MongoDB URI
- AWS credentials (if using EC2 deployment)
- Firebase service account key (for authentication)

---

## 🔧 Part 1: Backend Setup

### 1.1 Environment Configuration

Copy the template and fill in your values:

```bash
cd backend
cp .env.example .env
```

#### Critical .env Variables

**MongoDB**
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/devops-dashboard
```

**Jenkins**
```
JENKINS_URL=http://your-jenkins-server:8080
JENKINS_USER=admin
JENKINS_TOKEN=your-api-token-here
JENKINS_JOB_NAME=devops-hub-deploy
```

**GitHub Webhook**
```
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_TOKEN=ghp_your-personal-access-token
GITHUB_WEBHOOK_URL=http://your-backend-url/api/webhooks/github
```

**AWS EC2 (if deploying to EC2)**
```
AWS_EC2_HOST=ec2-your-public-dns.compute.amazonaws.com
AWS_EC2_USER=ubuntu
AWS_EC2_KEY_PATH=/path/to/your/key.pem
```

**Docker & Deployment**
```
CONTAINER_NAME=devops-hub-app
CONTAINER_PORTS=3000:3000
WEBHOOK_ENVIRONMENT=production
ENABLE_AUTO_DEPLOYMENT=true
```

**AI Analysis (Optional)**
```
OPENAI_API_KEY=sk-your-openai-key
ENABLE_AI_ANALYSIS=true
```

### 1.2 Install Dependencies

```bash
cd backend
npm install
```

### 1.3 Start Backend Server

Development:
```bash
npm run dev
```

Production:
```bash
npm start
```

Server runs on `http://localhost:5000`

---

## 🎨 Part 2: Frontend Setup

### 2.1 Environment Configuration

```bash
cd frontend
cp .env.example .env.local
```

Fill in:
```
VITE_API_URL=http://localhost:5000
VITE_WEBSOCKET_URL=ws://localhost:5000
VITE_FIREBASE_API_KEY=your-firebase-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

### 2.2 Install Dependencies

```bash
cd frontend
npm install
```

### 2.3 Development Server

```bash
npm run dev
```

Frontend runs on `http://localhost:5173`

### 2.4 Production Build

```bash
npm run build
```

Output: `frontend/dist/`

---

## 🔗 Part 3: GitHub Webhook Configuration

### 3.1 Create GitHub Webhook

1. Go to your GitHub repository
2. Settings → Webhooks → Add webhook
3. Configure:
   - **Payload URL**: `https://your-backend-url/api/webhooks/github`
   - **Content type**: `application/json`
   - **Secret**: Use value from `GITHUB_WEBHOOK_SECRET` in .env
   - **Events**: Push events
   - **Active**: ✅ Checked

### 3.2 Test Webhook

```bash
node test-webhook-system.js
```

---

## 🔨 Part 4: Jenkins Pipeline Setup

### 4.1 Create Jenkins Job

1. Go to Jenkins: `http://your-jenkins-server:8080`
2. New Item → Pipeline
3. Configure:
   - **Name**: `devops-hub-deploy` (or your `JENKINS_JOB_NAME`)
   - **Pipeline → Definition**: Pipeline script from SCM
   - **SCM**: Git
   - **Repository URL**: Your GitHub repo URL
   - **Credentials**: GitHub credentials

### 4.2 Add Jenkinsfile

Jenkinsfile already exists in repo root. Jenkins will use it automatically.

**Key Pipeline Stages:**
- Checkout - Clone latest code
- Install Dependencies - npm install
- Build Application - npm run build
- Detect Docker Build File - Find Dockerfile or docker-compose.yml
- Docker Build - Build image
- Deploy Docker Container - Stop old, remove, deploy new

### 4.3 Test Jenkins Trigger

```bash
node test-jenkins-api.js
```

---

## 🐳 Part 5: Docker Configuration

### 5.1 Backend Dockerfile

```dockerfile
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm ci && cd backend && npm ci

# Copy application
COPY . .

# Build frontend
WORKDIR /app/frontend
RUN npm ci && npm run build

# Build backend
WORKDIR /app/backend
RUN npm run build

# Expose port
EXPOSE 5000

# Set environment
ENV NODE_ENV=production

# Start application
CMD ["node", "src/server.js"]
```

### 5.2 Build Docker Image

```bash
docker build -t devops-hub:latest .
```

### 5.3 Test Docker Container Locally

```bash
docker run -d \
  --name devops-hub-app \
  -p 3000:3000 \
  -e MONGODB_URI=your-mongo-uri \
  -e JWT_SECRET=your-secret \
  devops-hub:latest

docker logs -f devops-hub-app
```

---

## ☁️ Part 6: AWS EC2 Deployment (Optional)

### 6.1 Prepare EC2 Instance

```bash
# SSH into EC2
ssh -i your-key.pem ubuntu@your-ec2-dns

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Docker
sudo apt-get install docker.io -y
sudo usermod -aG docker ubuntu
newgrp docker

# Verify Docker
docker --version
```

### 6.2 Configure SSH Key Path

Update .env:
```
AWS_EC2_HOST=ec2-your-public-dns.compute.amazonaws.com
AWS_EC2_USER=ubuntu
AWS_EC2_KEY_PATH=/absolute/path/to/key.pem
```

### 6.3 Test EC2 Connection

```bash
curl -X POST http://localhost:5000/api/deployments/deploy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "devops-hub:latest",
    "containerName": "devops-hub-app",
    "ports": "3000:3000"
  }'
```

---

## 📊 Part 7: Real-Time Monitoring Dashboard

### 7.1 Live Data Connection

Dashboard automatically connects to:
- **Metrics**: CPU, memory, latency, container status
- **Logs**: Jenkins, Docker, deployment, rollback logs
- **Alerts**: Build failures, deployment errors, resource warnings
- **Pipeline Status**: Current Jenkins pipeline status
- **Deployments**: Deployment history and status

### 7.2 Socket.io Subscriptions

Frontend automatically subscribes to:
```javascript
socket.emit('subscribe:metrics');
socket.emit('subscribe:alerts');
socket.emit('subscribe:pipeline');
socket.emit('subscribe:logs');
socket.emit('subscribe:jenkins-status');
socket.emit('subscribe:docker-monitor');
socket.emit('subscribe:docker-stats');
```

---

## 🔐 Part 8: Security Configuration

### 8.1 Environment Variables

Never commit `.env` file to repository!

```bash
# .gitignore
.env
.env.local
*.pem
serviceAccountKey.json
```

### 8.2 Firebase Authentication

- Frontend login/signup uses Firebase
- Backend verifies JWT tokens from Firebase
- No changes needed to existing Firebase setup

### 8.3 Jenkins Security

- Use Jenkins API token (not password)
- Token stored in environment variable
- CSRF protection enabled

### 8.4 MongoDB Security

- Use MongoDB Atlas with IP whitelist
- Database backups enabled
- Authentication required

### 8.5 AWS EC2 Security

- SSH key pairs securely stored
- Security groups configured
- No hardcoded credentials

---

## ✅ Testing & Verification

### 8.1 Health Check

```bash
curl http://localhost:5000/api/health
```

Expected response:
```json
{
  "ok": true,
  "message": "Server is running",
  "dbConnected": true
}
```

### 8.2 End-to-End Test Flow

1. **Make a GitHub commit**
   ```bash
   git add .
   git commit -m "Test CI/CD pipeline"
   git push origin main
   ```

2. **GitHub webhook triggers** → Check backend logs
   ```
   📝 [Webhook] Processing push event from devops-hub
   ✅ Webhook saved to database
   🔄 Triggering Jenkins pipeline...
   ```

3. **Jenkins job starts** → Check Jenkins dashboard
   - View build #X logs
   - See stages: Checkout, Build, Docker Build, Deploy

4. **Docker deployment** → Check backend logs
   ```
   🐳 [Docker] Building image: devops-hub:latest
   ✅ [Docker] Image built successfully
   🚀 [Docker] Running container: devops-hub-app
   ```

5. **Dashboard updates** → Check frontend
   - See new deployment in history
   - Check metrics and logs
   - Verify container status

### 8.3 Comprehensive Test Script

Run:
```bash
node test-webhook-system.js
```

This tests:
- ✅ Webhook reception
- ✅ Jenkins trigger
- ✅ Build status polling
- ✅ MongoDB logging
- ✅ Alert generation

---

## 📈 Production Deployment

### 9.1 Production Backend Deployment

Option 1: Docker Container
```bash
docker run -d \
  --name devops-hub-backend \
  --restart always \
  -p 5000:5000 \
  -e MONGODB_URI=$MONGODB_URI \
  -e JWT_SECRET=$JWT_SECRET \
  -e JENKINS_TOKEN=$JENKINS_TOKEN \
  -e NODE_ENV=production \
  devops-hub:latest
```

Option 2: Kubernetes
```bash
kubectl apply -f k8s-deployment.yaml
```

### 9.2 Production Frontend Deployment

Option 1: Static Hosting (Vercel, Netlify)
```bash
npm run build
# Deploy frontend/dist to your hosting
```

Option 2: Serve from Backend
```bash
# Backend serves frontend/dist as static files
# Frontend is already served by backend at /
```

### 9.3 Monitoring & Logging

Enable structured logging:
```bash
export NODE_ENV=production
export LOG_LEVEL=info
npm start
```

View logs in MongoDB:
```javascript
db.logs.find({ source: "deployment" }).limit(10)
```

---

## 🐛 Troubleshooting

### Issue: Webhook not triggering Jenkins

**Solution:**
1. Verify GitHub webhook URL is accessible
2. Check Jenkins API token: `echo $JENKINS_TOKEN`
3. Test manually: `curl -X POST http://jenkins:8080/job/devops-hub-deploy/buildWithParameters`

### Issue: Docker build fails

**Solution:**
1. Check Dockerfile syntax
2. Verify Docker daemon is running: `docker ps`
3. Check logs: `docker logs devops-hub-app`

### Issue: EC2 deployment fails

**Solution:**
1. Verify EC2 SSH connectivity: `ssh -i key.pem ubuntu@host`
2. Check Docker on EC2: `docker ps`
3. Verify key permissions: `chmod 600 key.pem`

### Issue: Frontend not updating in real-time

**Solution:**
1. Check Socket.io connection: `localStorage.getItem('authToken')`
2. Verify WebSocket URL in browser console
3. Check backend Socket.io subscriptions in logs

---

## 🎯 Complete API Endpoints Reference

### Authentication
- `POST /api/auth/login` - Firebase login
- `POST /api/auth/signup` - Firebase signup

### GitHub Webhooks
- `POST /api/webhooks/github` - Receive GitHub push events
- `GET /api/webhooks` - List all webhooks

### Jenkins Integration
- `POST /api/jenkins/trigger` - Trigger build
- `GET /api/jenkins/pipeline/status` - Pipeline status
- `GET /api/jenkins/builds/:buildNumber/status` - Build status
- `GET /api/jenkins/builds/:buildNumber/logs` - Build logs

### Deployments
- `GET /api/deployments` - All deployments
- `POST /api/deployments/deploy` - Manual deployment
- `POST /api/deployments/rollback` - Rollback deployment
- `POST /api/deployments/restart` - Restart service

### Monitoring
- `GET /api/metrics` - System metrics
- `GET /api/containers` - Docker containers
- `GET /api/logs` - Application logs
- `GET /api/alerts` - System alerts

### Analysis
- `POST /api/analyze-logs` - AI log analysis

---

## 📞 Support & Next Steps

1. **Review System Architecture** - Understand data flow
2. **Set Environment Variables** - Configure all .env files
3. **Run End-to-End Test** - Execute test-webhook-system.js
4. **Monitor Dashboard** - Watch real-time updates
5. **Configure Alerts** - Set up email/Slack notifications
6. **Scale Infrastructure** - Add more Jenkins agents if needed

---

## 🎉 You're Ready!

Your DevOps Hub CI/CD system is now production-ready. Every GitHub push will:
- ✅ Trigger webhook
- ✅ Start Jenkins pipeline
- ✅ Build Docker image
- ✅ Deploy to EC2
- ✅ Update dashboard in real-time

Happy deploying! 🚀
