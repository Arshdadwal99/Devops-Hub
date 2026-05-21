# DevOps Hub - Complete Backend Setup & Production Guide

## ✅ What's Implemented

Your backend now includes:

### 1. **Real-Time Data Integration**
- ✅ Jenkins CI/CD pipeline integration
- ✅ Docker container monitoring
- ✅ System metrics (CPU, Memory, Disk, Network)
- ✅ Real-time Socket.io updates
- ✅ Live logs and alerts

### 2. **Deployment Management**
- ✅ Deploy new versions
- ✅ Restart containers gracefully
- ✅ Rollback to previous versions
- ✅ Complete deployment history in MongoDB

### 3. **Monitoring & Alerting**
- ✅ Automatic alert generation (CPU, Memory, Disk)
- ✅ Custom alert system
- ✅ Alert resolution tracking
- ✅ Real-time alert notifications via Socket.io

### 4. **Logging System**
- ✅ Collect logs from Jenkins
- ✅ Collect logs from Docker
- ✅ Store deployment logs in MongoDB
- ✅ AI-powered log analysis (with fallback)

### 5. **GitHub Integration**
- ✅ GitHub webhook to auto-trigger Jenkins
- ✅ Webhook history tracking
- ✅ Automatic pipeline triggering on push

### 6. **Authentication**
- ✅ Firebase ID token verification
- ✅ JWT backup authentication
- ✅ Protected API endpoints
- ✅ User extraction from Firebase

---

## 📋 Prerequisites

### Required Services
1. **MongoDB Atlas** - Cloud database
2. **Firebase** - Authentication
3. **Jenkins** - CI/CD pipeline
4. **Docker** - Container runtime
5. **GitHub** - Code repository

### System Requirements
- Node.js 16+
- npm 8+
- Docker installed and running
- Port 5000 available (or configure in .env)

---

## 🚀 Quick Start - Local Development

### Step 1: Clone Repository
```bash
cd backend
npm install
```

### Step 2: Create .env File
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### Step 3: Configure Environment Variables

#### Database (MongoDB Atlas)
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/devops-dashboard?retryWrites=true&w=majority
```

Get your MongoDB URI from [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)

#### Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a project or select existing
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Copy the entire JSON and set:

```env
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_ADMIN_KEY=<paste entire JSON>
```

#### Jenkins Configuration
```env
JENKINS_URL=http://localhost:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=your-jenkins-api-token
JENKINS_JOB_NAME=devops-hub-deploy
```

**To get Jenkins token:**
1. Go to Jenkins: `http://localhost:8080`
2. Click your username → Configure
3. Under "API Token" → Generate new token
4. Copy the token value

#### GitHub Webhook
```env
GITHUB_WEBHOOK_SECRET=your-secret-from-github
GITHUB_TOKEN=ghp_your-personal-access-token
REPO_OWNER=your-github-username
REPO_NAME=your-repo-name
```

**To get GitHub token:**
1. Go to GitHub Settings → Developer settings → Personal access tokens
2. Click "Generate new token"
3. Select scopes: `repo`, `admin:repo_hook`, `admin:org_hook`
4. Copy the token

#### Frontend Configuration
```env
CLIENT_ORIGIN=http://localhost:5173,http://localhost:3000
```

### Step 4: Start Backend
```bash
npm run dev
```

Expected output:
```
✅ Backend listening on port 5000
📍 API Base: http://localhost:5000/api
🔌 Socket.io: ws://localhost:5000
✅ Firebase Admin SDK initialized
```

### Step 5: Test Backend Health
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

---

## 📊 API Endpoints

### Dashboard
```
GET  /api/dashboard           - Get complete dashboard (metrics, pipeline, logs, alerts)
GET  /api/dashboard/metrics   - Get current system metrics
GET  /api/dashboard/logs      - Get recent logs
GET  /api/dashboard/alerts    - Get recent alerts
```

### Deployment Management
```
POST /api/deployments/deploy  - Deploy new version
POST /api/deployments/restart - Restart containers
POST /api/deployments/rollback - Rollback to previous version
GET  /api/deployments         - Get deployment history
```

### Metrics
```
GET  /api/metrics             - Get current metrics
GET  /api/metrics/history     - Get metrics history
```

### Alerts
```
GET  /api/alerts              - Get all alerts
PUT  /api/alerts/:id/resolve  - Mark alert as resolved
DELETE /api/alerts/:id        - Delete alert
```

### Logs
```
GET  /api/monitoring/logs     - Get system logs
```

### Analysis
```
POST /api/analyze/logs        - Analyze logs with AI
```

### Webhooks
```
POST /api/webhooks/github     - GitHub webhook receiver (public, no auth)
GET  /api/webhooks/history    - Get webhook history
```

---

## 🔌 Socket.io Real-Time Events

### Connect
```javascript
const socket = io('http://localhost:5000', {
  auth: { token: authToken }
});
```

### Subscribe to Updates
```javascript
socket.emit('subscribe:metrics');   // Real-time metrics
socket.emit('subscribe:alerts');    // Real-time alerts
socket.emit('subscribe:pipeline');  // Pipeline status
socket.emit('subscribe:logs');      // Deployment logs
```

### Listen for Updates
```javascript
socket.on('metrics:update', (metrics) => {
  console.log('New metrics:', metrics);
});

socket.on('alerts:new', (alerts) => {
  console.log('New alerts:', alerts);
});
```

---

## 🔧 Integration Guide

### Jenkins Integration

#### 1. Create Jenkins Job
1. Log into Jenkins
2. Create new Freestyle Job: `devops-hub-deploy`
3. Under "Build Parameters", add:
   - `REPO_NAME` (String)
   - `COMMIT_SHA` (String)
   - `COMMIT_MESSAGE` (String)
   - `AUTHOR` (String)
   - `BRANCH` (String)

4. Add build steps (Shell/Batch)

#### 2. Verify Connection
```bash
curl -u admin:TOKEN \
  http://localhost:8080/job/devops-hub-deploy/api/json
```

### GitHub Webhook Setup

#### 1. Add Webhook to Repository
1. Go to GitHub repo → Settings → Webhooks
2. Click "Add webhook"
3. Set Payload URL:
   ```
   https://your-domain.com/api/webhooks/github
   ```
4. Set Secret: (must match `GITHUB_WEBHOOK_SECRET` in .env)
5. Select events: **Push events**
6. Click "Add webhook"

#### 2. Test Webhook
```bash
# Make a test commit and push
git add .
git commit -m "Test webhook"
git push origin main

# Check webhook history:
# GitHub repo → Settings → Webhooks → Recent Deliveries
```

### Docker Integration

The backend automatically detects Docker containers:

```bash
# List all containers
docker ps -a

# Run a test container
docker run -d --name test-app nginx:latest

# Check container in dashboard
curl http://localhost:5000/api/dashboard
```

---

## 📈 Monitoring Dashboard

The frontend will display:

### Metrics Panel
- CPU Usage (%)
- Memory Usage (%)
- Disk Usage (%)
- Active Containers

### Pipeline Status
- Build status from Jenkins
- Deployment status
- Last commit
- Build progress

### Deployment Controls
- **Deploy Now** - Trigger new deployment
- **Restart** - Restart running containers
- **Rollback** - Revert to previous version

### Alerts & Logs
- Real-time alerts (auto-generated)
- Deployment logs
- System logs

---

## 🚀 Production Deployment

### AWS EC2 Deployment

#### 1. Create EC2 Instance
```bash
# Connect to your EC2 instance
ssh -i key.pem ubuntu@your-instance-ip

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install MongoDB CLI
sudo npm install -g mongodb-cli

# Install Docker
sudo apt-get install -y docker.io
sudo usermod -aG docker $USER

# Install PM2 for process management
sudo npm install -g pm2
```

#### 2. Clone Repository
```bash
git clone https://github.com/your-username/your-repo.git
cd your-repo/backend
npm install
```

#### 3. Configure Environment
```bash
nano .env
# Paste production environment variables
```

#### 4. Start with PM2
```bash
pm2 start src/server.js --name "devops-hub-backend"
pm2 save
pm2 startup
```

#### 5. Setup Nginx Reverse Proxy
```bash
sudo apt-get install -y nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/devops-hub
```

Paste this config:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Socket.io
    location /socket.io {
        proxy_pass http://localhost:5000/socket.io;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/devops-hub /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

#### 6. Setup SSL with Let's Encrypt
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 🧪 Testing

### Test Dashboard Endpoint
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/dashboard
```

### Test Deployment
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version": "1.0.0", "containerName": "app"}' \
  http://localhost:5000/api/deployments/deploy
```

### Test Metrics
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/metrics
```

### Test Alerts
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/alerts
```

---

## 🐛 Troubleshooting

### MongoDB Connection Failed
**Error**: `MongoError: authentication failed`

**Solution**:
1. Verify connection string in .env
2. Check credentials are URL-encoded
3. Whitelist your IP in MongoDB Atlas
4. Test connection: `mongosh "mongodb+srv://..."`

### Firebase Token Invalid
**Error**: `Invalid Firebase token`

**Solution**:
1. Verify serviceAccountKey.json is correct
2. Check `FIREBASE_PROJECT_ID` matches your project
3. Regenerate service account key
4. Test token verification

### Jenkins Connection Refused
**Error**: `ECONNREFUSED 127.0.0.1:8080`

**Solution**:
1. Verify Jenkins is running: `curl http://localhost:8080`
2. Check `JENKINS_URL` in .env
3. Verify credentials and API token
4. Check firewall allows port 8080

### Docker Commands Fail
**Error**: `Cannot connect to Docker daemon`

**Solution**:
```bash
# Start Docker
sudo systemctl start docker

# Give user permissions
sudo usermod -aG docker $USER
newgrp docker

# Test Docker
docker ps
```

### Socket.io Connection Failed
**Error**: `WebSocket is closed before the connection is established`

**Solution**:
1. Verify backend is running
2. Check CORS settings in .env
3. Verify frontend URL is in CLIENT_ORIGIN
4. Check WebSocket protocol: `ws://` not `http://`

---

## 📝 Environment Variables Reference

```env
# Server
PORT=5000
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://...

# Firebase
FIREBASE_PROJECT_ID=your-project
FIREBASE_ADMIN_KEY={...}

# Jenkins
JENKINS_URL=http://jenkins-server:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=your-token
JENKINS_JOB_NAME=devops-hub-deploy

# GitHub
GITHUB_WEBHOOK_SECRET=webhook-secret
GITHUB_TOKEN=ghp_token
REPO_OWNER=your-username
REPO_NAME=your-repo

# Frontend
CLIENT_ORIGIN=http://localhost:5173

# Alerts
ALERT_CPU_HIGH=85
ALERT_MEMORY_HIGH=85
ALERT_DISK_HIGH=90
ALERT_LATENCY_HIGH=500

# OpenAI (optional)
OPENAI_API_KEY=sk_...

# Features
ENABLE_AI_ANALYSIS=true
ENABLE_WEBHOOKS=true
ENABLE_METRICS_COLLECTION=true
```

---

## ✨ Next Steps

1. **Configure all environment variables** in `.env`
2. **Start backend**: `npm run dev`
3. **Verify all integrations** are connected
4. **Run frontend**: `npm run dev:frontend`
5. **Test dashboard** and all features
6. **Deploy to production** using PM2 and Nginx
7. **Set up monitoring** and alerts

---

## 🆘 Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify all environment variables are set correctly
3. Check backend console logs for error messages
4. Test individual integrations with curl commands

---

## 📊 Key Features Summary

| Feature | Status | Details |
|---------|--------|---------|
| Jenkins Integration | ✅ | Real-time pipeline status |
| Docker Monitoring | ✅ | Container health & stats |
| System Metrics | ✅ | CPU, Memory, Disk, Network |
| Deployment Control | ✅ | Deploy, Restart, Rollback |
| Alert System | ✅ | Auto-generated + custom |
| Logging | ✅ | Jenkins + Docker logs |
| GitHub Webhook | ✅ | Auto-trigger CI/CD |
| Firebase Auth | ✅ | Secure token verification |
| Real-time Updates | ✅ | Socket.io events |
| AI Analysis | ✅ | Log analysis + predictions |
| Deployment History | ✅ | MongoDB storage |
| Traffic Monitoring | ✅ | Request tracking |

---

**Version**: 1.0.0  
**Last Updated**: 2026-05-11  
**Backend Status**: Production Ready ✅
