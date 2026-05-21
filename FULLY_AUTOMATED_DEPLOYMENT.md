# Fully Automated DevOps Deployment Platform

**Status:** ✅ Complete & Ready  
**Version:** 1.0.0  
**Last Updated:** May 21, 2026

## 📋 Overview

This is a **fully automated DevOps deployment platform** that eliminates manual steps in the entire deployment lifecycle. When a developer pushes code to GitHub, the system automatically:

1. ✅ Detects project technology stack
2. ✅ Generates optimized Dockerfile
3. ✅ Generates docker-compose.yml
4. ✅ Generates CI/CD pipeline (Jenkinsfile)
5. ✅ Builds Docker image
6. ✅ Deploys to AWS EC2
7. ✅ Configures Nginx reverse proxy
8. ✅ Performs health checks
9. ✅ Returns deployment URL

**End Result: ONLY deployment URL is returned to the user**

```
http://<EC2_PUBLIC_IP>
```

---

## 🎯 Complete Automated Flow

```
Developer pushes code to GitHub
         ↓
GitHub Webhook triggers DevOps Hub
         ↓
Tech Stack Detector analyzes repository
         ↓
Auto-generates:
  • Dockerfile (optimized)
  • docker-compose.yml
  • Jenkinsfile (CI/CD pipeline)
         ↓
Builds Docker image
         ↓
Pushes to registry (optional)
         ↓
SSH deploys to AWS EC2
         ↓
Starts containers with docker compose
         ↓
Health checks verify service
         ↓
Configures Nginx (if needed)
         ↓
Returns deployment URL

✅ http://13.201.45.22:3000
```

---

## ⚙️ Supported Tech Stacks

### Automatically Detected & Optimized

| Tech Stack | Detection Method | Container Port | Base Image |
|-----------|-----------------|-----------------|-----------|
| **Node.js** | package.json | 3000 | node:18-alpine |
| **React** | package.json + react dep | 3000 | node:18-alpine |
| **Next.js** | package.json + next dep | 3000 | node:18-alpine |
| **MERN** | Express + React + MongoDB | 3000 | node:18-alpine |
| **Python/Django** | setup.py, requirements.txt | 8000 | python:3.11-slim |
| **FastAPI** | requirements.txt + fastapi | 8000 | python:3.11-slim |
| **Flask** | requirements.txt + flask | 5000 | python:3.11-slim |
| **Go** | go.mod | 8080 | golang:1.21-alpine |
| **Java** | pom.xml | 8080 | openjdk:17-jdk-alpine |
| **Ruby on Rails** | Gemfile | 3000 | ruby:3.2-alpine |
| **Static HTML** | index.html | 80 | nginx:alpine |

---

## 🚀 Quick Setup (5 Minutes)

### Step 1: Configure Environment Variables

```bash
cd backend

# Copy example file
cp .env.example .env

# Edit .env with your settings
nano .env
```

### Step 2: Add Required Variables

```env
# Deployment Mode: 'jenkins', 'direct', or 'fully-automated'
WEBHOOK_DEPLOYMENT_MODE=fully-automated

# AWS EC2 Configuration (Required for automated EC2 deployment)
AWS_EC2_HOST=13.201.45.22
AWS_EC2_USER=ubuntu
AWS_EC2_KEY_PATH=/home/user/.ssh/devops-key.pem
AWS_EC2_PORT=22
AWS_REGION=us-east-1

# Enable automated deployment
ENABLE_AUTO_DEPLOYMENT=true

# Docker configuration (Optional)
DOCKER_REGISTRY_URL=registry.example.com
DOCKER_REGISTRY_USERNAME=your-username
DOCKER_REGISTRY_PASSWORD=your-password

# Cleanup (set to 'false' to keep workspace for debugging)
CLEANUP_WORKSPACE=true

# GitHub
GITHUB_TOKEN=your-github-token
```

### Step 3: Restart Backend

```bash
npm start
```

### Step 4: Add GitHub Webhook

Go to: `https://github.com/YOUR_REPO/settings/webhooks`

**Create webhook with:**
- **Payload URL:** `https://your-domain.com/api/webhooks/github`
- **Secret:** Generate one: `openssl rand -hex 32`
- **Events:** Push, Pull request, Release
- **Active:** ✅ Enabled

### Step 5: Test Deployment

```bash
# Make a change and push
git push origin main

# Monitor deployment in real-time via dashboard
# DevOps Hub will automatically:
# 1. Detect tech stack
# 2. Generate Dockerfile
# 3. Build image
# 4. Deploy to EC2
# 5. Return URL
```

---

## 📚 Core Services

### 1. Tech Stack Detector
**File:** `backend/src/services/techStackDetectorService.js`

Analyzes repository to auto-detect:
- Programming language
- Framework
- Package manager
- Port configuration
- Build commands
- Start commands

```javascript
import { detectTechStack } from "./techStackDetectorService.js";

const detection = await detectTechStack(repoPath);
console.log(detection.detection.primaryStack); // "nextjs"
console.log(detection.detection.ports); // [3000]
```

### 2. Dockerfile Generator
**File:** `backend/src/services/dockerfileGeneratorService.js`

Generates optimized, production-ready Dockerfiles with:
- Multi-stage builds
- Health checks
- Environment variables
- Signal handling
- Security best practices

### 3. Docker Compose Generator
**File:** `backend/src/services/dockerComposeGeneratorService.js`

Auto-generates docker-compose.yml with:
- Service configuration
- Port mapping
- Health checks
- Volume mounting
- Network setup
- MongoDB (for MERN stacks)

### 4. Jenkinsfile Generator
**File:** `backend/src/services/jenkinsfileGeneratorService.js`

Creates CI/CD pipelines with stages:
- Checkout
- Install dependencies
- Lint code
- Build application
- Run tests
- Build Docker image
- Push to registry
- Deploy
- Health check

### 5. EC2 Automated Deployment
**File:** `backend/src/services/ec2AutomatedDeploymentService.js`

Handles complete EC2 deployment:
- SSH connection
- Code pull from GitHub
- Docker image pull
- Container startup
- Health verification
- Nginx configuration

### 6. Orchestration Service
**File:** `backend/src/services/deploymentOrchestrationService.js`

Orchestrates entire workflow:
- Repository cloning
- Tech detection
- Code generation
- Image building
- EC2 deployment
- Error handling
- Cleanup

---

## 🔌 API Endpoints

### Automated Deployment

**POST** `/api/automation/deploy`
```bash
curl -X POST https://devops-hub.com/api/automation/deploy \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repositoryUrl": "https://github.com/owner/repo.git",
    "containerName": "my-app",
    "containerPort": 3000
  }'
```

Response:
```json
{
  "success": true,
  "deploymentId": "deploy-1234567890",
  "message": "Deployment started. Monitor progress with deployment ID."
}
```

### Get Deployment Status

**GET** `/api/automation/deployment/:deploymentId`
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://devops-hub.com/api/automation/deployment/deploy-1234567890
```

### Get All Deployments

**GET** `/api/automation/deployments`
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://devops-hub.com/api/automation/deployments
```

### Deployment Statistics

**GET** `/api/automation/deployments/stats`
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://devops-hub.com/api/automation/deployments/stats
```

### Detect Tech Stack

**POST** `/api/automation/detect-stack`
```bash
curl -X POST https://devops-hub.com/api/automation/detect-stack \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"repositoryUrl": "https://github.com/owner/repo.git"}'
```

### Health Check

**POST** `/api/automation/health-check`
```bash
curl -X POST https://devops-hub.com/api/automation/health-check \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"containerName": "my-app", "port": 3000}'
```

### Rollback Deployment

**POST** `/api/automation/rollback/:deploymentId`
```bash
curl -X POST https://devops-hub.com/api/automation/rollback/deploy-1234567890 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 📊 Deployment Workflow

### Step-by-Step Process

```
1. GitHub Webhook Received
   ✓ Webhook signature verified
   ✓ Event type validated

2. Repository Cloning
   ✓ Clone from GitHub
   ✓ Setup workspace

3. Tech Stack Detection
   ✓ Analyze package.json, setup.py, etc.
   ✓ Detect framework & dependencies
   ✓ Determine port & build commands

4. Code Generation
   ✓ Generate optimized Dockerfile
   ✓ Generate docker-compose.yml
   ✓ Generate Jenkinsfile

5. Docker Build
   ✓ Build image from generated Dockerfile
   ✓ Multi-stage build for optimization
   ✓ Tag with build number

6. Registry Push (Optional)
   ✓ Login to Docker registry
   ✓ Push image

7. EC2 Deployment (SSH)
   ✓ Connect via SSH
   ✓ Pull latest code
   ✓ Update docker-compose.yml
   ✓ Stop old containers
   ✓ Start new containers

8. Health Checks
   ✓ Wait for container readiness
   ✓ Check port responsiveness
   ✓ Verify service health

9. Nginx Configuration
   ✓ Setup reverse proxy
   ✓ Configure SSL (optional)

10. Return Deployment URL
    ✓ http://<EC2_PUBLIC_IP>:<PORT>
```

---

## ✅ Environment Variable Reference

### GitHub Configuration
```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
GITHUB_SECRET=your_webhook_secret
```

### AWS EC2 Configuration
```env
AWS_EC2_HOST=13.201.45.22
AWS_EC2_USER=ubuntu
AWS_EC2_KEY_PATH=/path/to/private/key.pem
AWS_EC2_PORT=22
AWS_REGION=us-east-1
```

### Deployment Configuration
```env
WEBHOOK_DEPLOYMENT_MODE=fully-automated
ENABLE_AUTO_DEPLOYMENT=true
CLEANUP_WORKSPACE=true
```

### Docker Registry
```env
DOCKER_REGISTRY_URL=registry.example.com
DOCKER_REGISTRY_USERNAME=your-username
DOCKER_REGISTRY_PASSWORD=your-password
```

---

## 🐛 Troubleshooting

### Deployment Fails at Tech Detection

**Issue:** Cannot detect tech stack

**Solution:**
1. Ensure repository has package.json, requirements.txt, or similar
2. Check Git clone permissions
3. Verify GITHUB_TOKEN has repo access

### SSH Connection Fails

**Issue:** Cannot connect to EC2

**Solution:**
1. Verify `AWS_EC2_HOST` is correct
2. Check SSH key path: `AWS_EC2_KEY_PATH`
3. Verify key permissions: `chmod 600 ~/.ssh/key.pem`
4. Test SSH manually: `ssh -i ~/.ssh/key.pem ubuntu@<HOST>`

### Health Check Fails

**Issue:** Container is running but health check fails

**Solution:**
1. Check container logs: `docker logs container-name`
2. Verify exposed port in Dockerfile
3. Check service is listening on correct port
4. Increase health check timeout in docker-compose.yml

### Docker Build Fails

**Issue:** Docker image build fails

**Solution:**
1. Check repository has Dockerfile
2. Verify all dependencies are declared
3. Check Docker daemon is running: `docker ps`
4. Review build logs for errors

---

## 📈 Monitoring Real-Time Deployment

### Via WebSocket (Real-time Updates)

```javascript
const socket = io('https://devops-hub.com', {
  auth: {
    token: 'your-jwt-token'
  }
});

// Subscribe to deployment updates
socket.emit('subscribe:deployment', { deploymentId: 'deploy-123' });

// Listen for updates
socket.on('deployment:started', (data) => {
  console.log('Deployment started:', data);
});

socket.on('deployment:progress', (data) => {
  console.log('Progress:', data.message, data.progress);
});

socket.on('deployment:success', (data) => {
  console.log('Deployment successful:', data.deploymentUrl);
});

socket.on('deployment:failed', (data) => {
  console.log('Deployment failed:', data.error);
});
```

### Via REST API (Polling)

```bash
# Check status every 2 seconds
while true; do
  curl -H "Authorization: Bearer TOKEN" \
    https://devops-hub.com/api/automation/deployment/deploy-123
  sleep 2
done
```

---

## 🎉 Example Successful Deployment

```
📨 [Webhook] Received GitHub webhook
✅ GitHub signature verified

📥 Step 1: Cloning repository from GitHub...
✅ Repository cloned successfully

🔍 Step 2: Detecting project technology stack...
✅ Detected: nextjs
   Technologies: nodejs, nextjs, react
   Port: 3000

🐳 Step 3: Generating optimized Dockerfile...
✅ Dockerfile generated successfully

📄 Step 4: Generating .dockerignore...
✅ .dockerignore generated

📋 Step 5: Generating docker-compose.yml...
✅ docker-compose.yml generated

🔨 Step 6: Generating Jenkinsfile for CI/CD...
✅ Jenkinsfile generated

🔨 Step 7: Building Docker image...
✅ Docker image built: my-app:main-1234567890

🚀 Step 9: Deploying to AWS EC2...
🔐 [SSH] ubuntu@13.201.45.22: docker compose up -d
✅ Containers started successfully

❤️ Step 10: Performing health checks...
✅ Application is healthy and responsive

🌐 Deployment successful!
   URL: http://13.201.45.22:3000
```

---

## 📝 Notes

- Fully automated, zero manual intervention required
- Supports multi-technology stacks
- Includes health checks and monitoring
- Automatic rollback capability
- Real-time deployment tracking
- Production-ready configurations
- Secure SSH deployment
- Docker image caching support

---

## 🔗 Related Documentation

- [Tech Stack Detector Guide](./TECH_STACK_GUIDE.md)
- [Dockerfile Generator Reference](./DOCKERFILE_GUIDE.md)
- [Jenkins Integration](./JENKINS_INTEGRATION.md)
- [AWS EC2 Setup](./AWS_EC2_SETUP.md)
- [Health Check System](./HEALTH_CHECK_GUIDE.md)
