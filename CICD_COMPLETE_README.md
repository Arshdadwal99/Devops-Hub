# 🚀 DevOps Hub - Complete Production-Ready CI/CD System

## Overview

This is a **fully automated, production-ready CI/CD automation system** that takes your application from GitHub commit to live deployment in seconds.

### ⚡ Complete Automation Flow

```
Developer commits to GitHub
        ↓
GitHub webhook triggered
        ↓
Jenkins pipeline starts automatically
        ↓
1. Code checkout
2. Dependencies installed
3. Application built
4. Docker image created
        ↓
Old container stopped
Old container removed
        ↓
New container deployed on AWS EC2
        ↓
Real-time dashboard updates
        ↓
Logs, metrics, alerts displayed
```

---

## 🎯 What This System Does

✅ **GitHub Webhook Integration** - Automatic trigger on push
✅ **Jenkins Pipeline Automation** - Builds, tests, deploys
✅ **Docker Containerization** - Consistent environments
✅ **AWS EC2 Deployment** - SSH-based auto-deployment
✅ **Real-Time Monitoring** - Live dashboard with Socket.io
✅ **Comprehensive Logging** - All operations tracked
✅ **Alert System** - Failures and warnings detected
✅ **Metrics Collection** - CPU, memory, latency tracked
✅ **AI Log Analysis** - Smart error detection
✅ **Zero Downtime** - Old container → new container seamlessly

---

## 📋 Prerequisites

### Infrastructure Required
- **GitHub Repository** - Your code with webhook access
- **Jenkins Server** - Running on AWS EC2 or local machine
- **Docker** - Installed on deployment server
- **MongoDB Atlas** - Cloud database (or local MongoDB)
- **AWS EC2** - Target deployment server (optional)
- **OpenAI API** - For AI log analysis (optional)

### Credentials Needed
- GitHub personal access token
- Jenkins API token
- MongoDB connection string
- Firebase service account key
- AWS credentials (optional)

---

## 🚀 Quick Start (5 minutes)

### 1. Clone Repository
```bash
git clone <your-repo-url>
cd devops-dashboard
```

### 2. Set Up Environment Variables

**Backend Configuration:**
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` with your values:
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/devops-dashboard
JENKINS_URL=http://your-jenkins:8080
JENKINS_USER=admin
JENKINS_TOKEN=your-api-token
GITHUB_WEBHOOK_SECRET=your-webhook-secret
AWS_EC2_HOST=your-ec2-public-dns.compute.amazonaws.com
AWS_EC2_USER=ubuntu
AWS_EC2_KEY_PATH=/path/to/key.pem
```

**Frontend Configuration:**
```bash
cd frontend
cp .env.example .env.local
```

Edit `frontend/.env.local`:
```
VITE_API_URL=http://localhost:5000
VITE_WEBSOCKET_URL=ws://localhost:5000
VITE_FIREBASE_API_KEY=your-firebase-key
```

### 3. Install Dependencies
```bash
# Backend
cd backend && npm install

# Frontend
cd frontend && npm install
```

### 4. Start Development Servers
```bash
# Run in different terminals

# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev
```

### 5. Access Dashboard
- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- API Health: http://localhost:5000/api/health

---

## 📚 Complete Documentation

### Setup & Configuration
- [CICD_PRODUCTION_SETUP.md](CICD_PRODUCTION_SETUP.md) - Complete production setup guide
- [FRONTEND_INTEGRATION_GUIDE.md](FRONTEND_INTEGRATION_GUIDE.md) - Frontend integration details
- [backend/.env.example](backend/.env.example) - Backend configuration template

### API Reference
- [BACKEND_API_REFERENCE.md](BACKEND_API_REFERENCE.md) - All API endpoints

### Implementation Guides
- [GITHUB_WEBHOOK_QUICK_START.md](GITHUB_WEBHOOK_QUICK_START.md) - GitHub webhook setup
- [JENKINS_QUICK_START.md](JENKINS_QUICK_START.md) - Jenkins configuration
- [AUTO_DEPLOYMENT_QUICK_START.md](AUTO_DEPLOYMENT_QUICK_START.md) - Auto deployment

### Troubleshooting
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions
- [QUICK_FIX_REFERENCE.md](QUICK_FIX_REFERENCE.md) - Quick fixes

---

## 🧪 Testing

### Run End-to-End Tests
```bash
node test-e2e-cicd.js
```

This tests:
- Backend health
- Webhook functionality
- Jenkins integration
- Docker operations
- Database connectivity
- API endpoints
- Real-time updates

### Test Specific Features
```bash
# Test webhook
node test-webhook-system.js

# Test Jenkins API
node test-jenkins-api.js
```

---

## 🚢 Production Deployment

### Option 1: Docker Deployment
```bash
# Build Docker image
docker build -t devops-hub:latest .

# Run container
docker run -d \
  --name devops-hub \
  --restart always \
  -p 5000:5000 \
  -e MONGODB_URI=$MONGODB_URI \
  -e JWT_SECRET=$JWT_SECRET \
  devops-hub:latest
```

### Option 2: Docker Compose
```bash
docker-compose up -d
```

### Option 3: Automated Deployment
```bash
# Setup and build
node deploy.js setup

# Deploy
node deploy.js deploy

# Run full pipeline
node deploy.js full
```

---

## 📊 Dashboard Features

### Real-Time Monitoring
- **Metrics** - CPU, memory, disk usage
- **Pipeline Status** - Current Jenkins build status
- **Logs** - All system and deployment logs
- **Alerts** - Build failures, deployment errors
- **Containers** - Docker container status and stats
- **Deployments** - Deployment history and rollback

### Live Updates
- Socket.io real-time streaming
- No refresh needed
- Instant alerts
- Live log streaming
- Container health monitoring

---

## 🔌 API Endpoints

### Authentication
```
POST   /api/auth/login              Login with Firebase
POST   /api/auth/signup             Create account
```

### Webhooks
```
POST   /api/webhooks/github         GitHub webhook endpoint
GET    /api/webhooks                List all webhooks
```

### Jenkins Integration
```
GET    /api/jenkins/pipeline/status Current pipeline status
POST   /api/jenkins/trigger         Trigger new build
GET    /api/jenkins/builds          Build history
GET    /api/jenkins/builds/:number  Build details
```

### Deployments
```
GET    /api/deployments             All deployments
POST   /api/deployments/deploy      Trigger deployment
POST   /api/deployments/rollback    Rollback deployment
```

### Monitoring
```
GET    /api/metrics                 System metrics
GET    /api/docker/containers       Container list
GET    /api/logs                    System logs
GET    /api/alerts                  Active alerts
POST   /api/analyze-logs            AI log analysis
```

---

## 🔒 Security

### Environment Variables
- All credentials in `.env` files
- Never commit `.env` to repository
- Use `.gitignore` to exclude environment files

### Firebase Authentication
- Secure JWT tokens
- Firebase Auth validation
- User isolation

### Database Security
- MongoDB Atlas IP whitelist
- Encrypted connections
- Regular backups

### Docker Security
- Container isolation
- Health checks
- Automatic restart
- Resource limits

---

## ⚙️ Configuration

### Docker & Deployment
```env
CONTAINER_NAME=devops-hub
CONTAINER_PORTS=3000:3000
CONTAINER_ENV=NODE_ENV=production
ENABLE_AUTO_DEPLOYMENT=true
WEBHOOK_ENVIRONMENT=production
```

### Jenkins
```env
JENKINS_URL=http://localhost:8080
JENKINS_USER=admin
JENKINS_TOKEN=your-api-token
JENKINS_JOB_NAME=devops-hub-deploy
```

### GitHub
```env
GITHUB_WEBHOOK_SECRET=your-secret
GITHUB_TOKEN=your-token
GITHUB_WEBHOOK_URL=https://your-backend/api/webhooks/github
```

### AWS EC2
```env
AWS_EC2_HOST=your-ec2-host
AWS_EC2_USER=ubuntu
AWS_EC2_KEY_PATH=/path/to/key.pem
AWS_REGION=us-east-1
```

### Monitoring
```env
ALERT_CPU_HIGH=85
ALERT_MEMORY_HIGH=85
ALERT_DISK_HIGH=90
ALERT_LATENCY_HIGH=500
```

---

## 📈 Metrics & Monitoring

### Collected Metrics
- CPU usage and load
- Memory usage and percentage
- Disk I/O and usage
- Network traffic (in/out)
- Active connections
- Container statistics
- Request latency
- Build duration

### Alerts Generated
- Jenkins build failures
- Docker build failures
- Deployment failures
- Container crashes
- CPU usage high
- Memory usage high
- Disk usage high
- Deployment timeouts

---

## 🤖 AI Log Analysis

Automatic analysis of CI/CD logs for:
- ✅ Error detection
- ✅ Warning identification
- ✅ Deployment issue recognition
- ✅ Root cause analysis
- ✅ Suggested fixes

**Enable with:**
```env
OPENAI_API_KEY=sk-your-key
ENABLE_AI_ANALYSIS=true
```

---

## 📱 Real-Time Features

### Socket.io Events

**Subscribe to:**
```javascript
socket.emit('subscribe:metrics');
socket.emit('subscribe:pipeline');
socket.emit('subscribe:logs');
socket.emit('subscribe:alerts');
socket.emit('subscribe:docker-monitor');
```

**Receive Events:**
```javascript
socket.on('metrics:update', (data) => {});
socket.on('pipeline:update', (data) => {});
socket.on('log:new', (log) => {});
socket.on('alert:new', (alert) => {});
socket.on('docker:container-update', (data) => {});
```

---

## 🔧 Troubleshooting

### Backend not starting?
```bash
# Check port 5000
lsof -i :5000

# Check environment
cat backend/.env

# Check logs
npm --workspace backend run dev
```

### Frontend not connecting?
```bash
# Check API URL
echo $VITE_API_URL

# Check WebSocket
Check browser DevTools → Network
```

### Docker build failing?
```bash
# Check Docker
docker ps

# Check logs
docker logs container-name

# Rebuild
docker build -t devops-hub:latest --no-cache .
```

### Jenkins not triggering?
```bash
# Check token
echo $JENKINS_TOKEN

# Test Jenkins
curl http://jenkins:8080/api/json -u admin:token

# Check webhook logs
npm --workspace backend run dev (check console)
```

---

## 📞 Support

For issues or questions:
1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. Review test output: `node test-e2e-cicd.js`
3. Check logs: `curl http://localhost:5000/api/logs?limit=50`
4. Review alerts: `curl http://localhost:5000/api/alerts`

---

## 📦 Project Structure

```
devops-dashboard/
├── backend/                    # Express.js backend
│   ├── src/
│   │   ├── controllers/       # API handlers
│   │   ├── routes/            # API routes
│   │   ├── services/          # Business logic
│   │   ├── models/            # MongoDB schemas
│   │   └── middleware/        # Express middleware
│   ├── .env.example           # Environment template
│   └── package.json
├── frontend/                   # React dashboard
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── pages/             # Pages
│   │   ├── lib/               # Utilities
│   │   └── hooks/             # Custom hooks
│   ├── .env.example
│   └── package.json
├── Dockerfile                  # Docker image
├── docker-compose.yml          # Docker Compose
├── Jenkinsfile                 # Jenkins pipeline
├── test-e2e-cicd.js           # End-to-end tests
├── deploy.js                   # Deployment automation
└── README.md                   # This file
```

---

## 🎯 Key Features

✨ **Automatic Triggers**
- GitHub webhook auto-triggers Jenkins
- Jenkins auto-builds and deploys
- Container auto-restarts on failure

🔄 **CI/CD Pipeline**
- Checkout code
- Install dependencies
- Build application
- Build Docker image
- Deploy container

📊 **Real-Time Dashboard**
- Live metrics and stats
- Pipeline status updates
- Log streaming
- Alert notifications
- Container monitoring

🚀 **Production Ready**
- Error handling
- Logging
- Monitoring
- Alerting
- Rollback support

---

## 🎉 Getting Started

1. **Clone repo** - `git clone <url>`
2. **Set environment** - Fill in `.env` files
3. **Install deps** - `npm install` (both dirs)
4. **Start servers** - `npm run dev` (both terminals)
5. **Open dashboard** - http://localhost:5173
6. **Configure GitHub webhook** - See GITHUB_WEBHOOK_QUICK_START.md
7. **Configure Jenkins** - See JENKINS_QUICK_START.md
8. **Test pipeline** - `node test-e2e-cicd.js`

---

## 📄 License

This project is provided as-is for your DevOps Hub implementation.

---

## ✅ What's Included

- ✅ Complete backend implementation
- ✅ React frontend dashboard
- ✅ Docker containerization
- ✅ Jenkins pipeline (Jenkinsfile)
- ✅ GitHub webhook system
- ✅ Real-time monitoring (Socket.io)
- ✅ Comprehensive logging
- ✅ Alert system
- ✅ Metrics collection
- ✅ AI log analysis
- ✅ MongoDB integration
- ✅ Firebase authentication
- ✅ AWS EC2 deployment
- ✅ Deployment automation
- ✅ End-to-end tests
- ✅ Production deployment guides
- ✅ Troubleshooting guides

---

## 🚀 You're Ready!

Your complete CI/CD automation system is ready. Every GitHub push will automatically:
1. Trigger Jenkins pipeline
2. Build and test application
3. Build Docker image
4. Deploy to production
5. Update dashboard in real-time
6. Generate alerts on failures

Happy deploying! 🎉
