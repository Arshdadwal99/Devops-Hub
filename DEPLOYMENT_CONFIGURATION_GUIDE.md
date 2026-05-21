# Automatic Deployment Configuration Guide

**Status:** ✅ Complete  
**Version:** 1.0  
**Last Updated:** May 13, 2026

---

## 🔧 Environment Variables Reference

### Quick Setup (Copy & Paste)

```bash
# ===== WEBHOOK & JENKINS SETTINGS (Already Configured) =====
GITHUB_WEBHOOK_SECRET=your-generated-secret-key
JENKINS_URL=http://localhost:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=117e1ccde0cced51ac00e8452932eb71b8
JENKINS_JOB_NAME=devops-hub-deploy

# ===== AUTOMATIC DEPLOYMENT (NEW) =====
ENABLE_AUTO_DEPLOYMENT=true
CONTAINER_NAME=devops-hub-app
CONTAINER_PORT=3000
HOST_PORT=3000
ENVIRONMENT=production
CONTAINER_ENV=NODE_ENV=production,LOG_LEVEL=info
CONTAINER_VOLUMES=
DOCKER_REGISTRY=localhost
DOCKER_REGISTRY_USERNAME=
DOCKER_REGISTRY_PASSWORD=
DEPLOYMENT_TIMEOUT=300000
POLL_INTERVAL=5000

# ===== EXISTING SETTINGS (Keep These) =====
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret
```

---

## 📝 Step-by-Step Configuration

### Step 1: Open backend/.env

```bash
cd backend
nano .env
# or open in VS Code
code .env
```

### Step 2: Add Auto-Deployment Section

Add this section AFTER your existing Jenkins settings:

```bash
# ===== AUTOMATIC DOCKER DEPLOYMENT =====

# Enable automatic deployment after successful Jenkins build
# Set to "false" to disable auto-deployment
ENABLE_AUTO_DEPLOYMENT=true

# Container name (must match what's in your Docker setup)
CONTAINER_NAME=devops-hub-app

# Port configuration
CONTAINER_PORT=3000
HOST_PORT=3000

# Environment (development, staging, production)
ENVIRONMENT=production

# Container environment variables (comma-separated)
# These are passed to the Docker container at runtime
CONTAINER_ENV=NODE_ENV=production,LOG_LEVEL=info

# Container volumes (optional, comma-separated)
# Format: /host/path:/container/path
# Leave empty if not needed
CONTAINER_VOLUMES=

# Docker registry settings
# For local development: DOCKER_REGISTRY=localhost
# For Docker Hub: DOCKER_REGISTRY=docker.io
# For private registry: DOCKER_REGISTRY=registry.example.com
DOCKER_REGISTRY=localhost

# Registry credentials (only needed for private registries)
# For Docker Hub, use your Docker Hub username/password
# For private registries, use your registry credentials
DOCKER_REGISTRY_USERNAME=
DOCKER_REGISTRY_PASSWORD=

# Deployment timing (in milliseconds)
# Maximum time to wait for Jenkins build to complete
DEPLOYMENT_TIMEOUT=300000

# How often to check if Jenkins build is complete
POLL_INTERVAL=5000
```

### Step 3: Configure for Your Environment

#### Local Development
```bash
ENABLE_AUTO_DEPLOYMENT=true
CONTAINER_NAME=devops-hub-app
ENVIRONMENT=development
DOCKER_REGISTRY=localhost
DEPLOYMENT_TIMEOUT=300000
POLL_INTERVAL=5000
```

#### Staging
```bash
ENABLE_AUTO_DEPLOYMENT=true
CONTAINER_NAME=devops-hub-staging
ENVIRONMENT=staging
DOCKER_REGISTRY=registry.staging.example.com
DOCKER_REGISTRY_USERNAME=staging-user
DOCKER_REGISTRY_PASSWORD=staging-password
```

#### Production
```bash
ENABLE_AUTO_DEPLOYMENT=true
CONTAINER_NAME=devops-hub-prod
ENVIRONMENT=production
DOCKER_REGISTRY=registry.example.com
DOCKER_REGISTRY_USERNAME=prod-user
DOCKER_REGISTRY_PASSWORD=prod-password
DEPLOYMENT_TIMEOUT=600000
POLL_INTERVAL=10000
```

### Step 4: Save and Restart Backend

```bash
# Save: Ctrl+S (VS Code) or Ctrl+X → Y (nano)

# Restart backend
npm start

# Watch for:
# ✅ Server running on port 5000
# ✅ Database connected
```

---

## 🗺️ Environment Variables Explained

### ENABLE_AUTO_DEPLOYMENT

**What it does:** Enables or disables automatic Docker deployment

**Values:**
- `true` - Auto-deploy after successful Jenkins build
- `false` - Only manual deployment with API

**Default:** `true`

**Example:**
```bash
# Enable auto-deployment
ENABLE_AUTO_DEPLOYMENT=true

# Disable (manual only)
ENABLE_AUTO_DEPLOYMENT=false
```

---

### CONTAINER_NAME

**What it does:** The name of the Docker container to deploy

**Format:** Alphanumeric, hyphens, underscores only

**Default:** `devops-hub-app`

**Example:**
```bash
# Simple name
CONTAINER_NAME=devops-hub-app

# Environment-specific
CONTAINER_NAME=devops-hub-prod
CONTAINER_NAME=devops-hub-staging
```

---

### CONTAINER_PORT

**What it does:** The port inside the container where the app listens

**Format:** 1-65535

**Default:** `3000`

**Example:**
```bash
# Node.js app listening on port 3000
CONTAINER_PORT=3000

# Python app listening on port 5000
CONTAINER_PORT=5000

# Java app listening on port 8080
CONTAINER_PORT=8080
```

---

### HOST_PORT

**What it does:** The port on the host machine that maps to container port

**Format:** 1-65535

**Default:** `3000`

**Example:**
```bash
# Map container:3000 to host:3000
CONTAINER_PORT=3000
HOST_PORT=3000

# Map container:3000 to host:8080
CONTAINER_PORT=3000
HOST_PORT=8080
```

---

### ENVIRONMENT

**What it does:** The deployment environment (affects alerts and tags)

**Values:** `development`, `staging`, `production`

**Default:** `production`

**Example:**
```bash
ENVIRONMENT=development
ENVIRONMENT=staging
ENVIRONMENT=production
```

---

### CONTAINER_ENV

**What it does:** Environment variables passed to the container

**Format:** Comma-separated KEY=VALUE pairs

**Default:** Empty

**Example:**
```bash
# Simple
CONTAINER_ENV=NODE_ENV=production

# Multiple
CONTAINER_ENV=NODE_ENV=production,LOG_LEVEL=info,DEBUG=false

# With special values
CONTAINER_ENV=DATABASE_URL=mongodb+srv://user:pass@cluster.mongodb.net,API_KEY=secret123
```

**Common values:**
```bash
# Node.js
NODE_ENV=production
LOG_LEVEL=info
DEBUG=false

# Python
PYTHONUNBUFFERED=1
FLASK_ENV=production

# Java
JAVA_OPTS=-Xmx512m
SPRING_PROFILES_ACTIVE=production
```

---

### CONTAINER_VOLUMES

**What it does:** Persistent storage for the container

**Format:** Comma-separated /host:/container paths

**Default:** Empty (no volumes)

**Example:**
```bash
# Single volume
CONTAINER_VOLUMES=/app/data:/data

# Multiple volumes
CONTAINER_VOLUMES=/app/data:/data,/app/logs:/logs,/app/config:/config

# With read-only
CONTAINER_VOLUMES=/app/config:/config:ro,/app/data:/data:rw
```

**Common patterns:**
```bash
# Data persistence
CONTAINER_VOLUMES=/var/lib/devops/data:/data

# Logs
CONTAINER_VOLUMES=/var/log/devops:/logs

# Configuration
CONTAINER_VOLUMES=/etc/devops/config:/config:ro

# Multiple
CONTAINER_VOLUMES=/var/lib/devops/data:/data,/var/log/devops:/logs,/etc/devops/config:/config:ro
```

---

### DOCKER_REGISTRY

**What it does:** Where to push/pull Docker images

**Values:**
- `localhost` - Local Docker daemon (no push)
- `docker.io` - Docker Hub
- `registry.example.com` - Private registry

**Default:** `localhost`

**Example:**
```bash
# Local (development)
DOCKER_REGISTRY=localhost

# Docker Hub
DOCKER_REGISTRY=docker.io

# Private registry
DOCKER_REGISTRY=registry.example.com
DOCKER_REGISTRY=registry.mycompany.com:5000
```

---

### DOCKER_REGISTRY_USERNAME & PASSWORD

**What it does:** Credentials for private registries

**When needed:** Only for remote/private registries

**Not needed:** When using localhost

**Example:**
```bash
# Docker Hub
DOCKER_REGISTRY=docker.io
DOCKER_REGISTRY_USERNAME=your-docker-username
DOCKER_REGISTRY_PASSWORD=your-docker-password

# Private registry
DOCKER_REGISTRY=registry.example.com
DOCKER_REGISTRY_USERNAME=registry-user
DOCKER_REGISTRY_PASSWORD=registry-password
```

**Security:**
```bash
# ✅ Use GitHub Secrets in CI/CD
# ❌ Never commit passwords to git
```

---

### DEPLOYMENT_TIMEOUT

**What it does:** Maximum time to wait for Jenkins build

**Format:** Milliseconds

**Default:** `300000` (5 minutes)

**Example:**
```bash
# 3 minutes
DEPLOYMENT_TIMEOUT=180000

# 5 minutes (default)
DEPLOYMENT_TIMEOUT=300000

# 10 minutes (for slow builds)
DEPLOYMENT_TIMEOUT=600000
```

---

### POLL_INTERVAL

**What it does:** How often to check Jenkins build status

**Format:** Milliseconds

**Default:** `5000` (5 seconds)

**Example:**
```bash
# Check every 1 second (aggressive)
POLL_INTERVAL=1000

# Check every 5 seconds (default)
POLL_INTERVAL=5000

# Check every 30 seconds (conservative)
POLL_INTERVAL=30000
```

---

## 🔍 Verification

### Step 1: Check Syntax

```bash
# Load and validate .env file
node -e "require('dotenv').config({path: 'backend/.env'}); console.log('✅ .env loaded successfully')"
```

### Step 2: Verify Required Variables

```bash
# Check if variables are set
grep -E "ENABLE_AUTO_DEPLOYMENT|CONTAINER_NAME|ENVIRONMENT" backend/.env

# Output should show:
# ENABLE_AUTO_DEPLOYMENT=true
# CONTAINER_NAME=devops-hub-app
# ENVIRONMENT=production
```

### Step 3: Test Docker Connection

```bash
# Verify Docker daemon is running
docker ps

# Output should show running containers
```

### Step 4: Test Jenkins Connection

```bash
# Test Jenkins API
curl -u admin:$JENKINS_TOKEN http://localhost:8080/job/devops-hub-deploy/api/json

# Should return job details (no 404 error)
```

### Step 5: Test Backend Startup

```bash
cd backend
npm start

# Watch for:
# ✅ Server running on port 5000
# ✅ Database connected
# ℹ️ Auto-deployment enabled
```

---

## 📋 Configuration Checklist

### Development Setup
- [ ] `ENABLE_AUTO_DEPLOYMENT=true`
- [ ] `CONTAINER_NAME=devops-hub-app`
- [ ] `ENVIRONMENT=development`
- [ ] `DOCKER_REGISTRY=localhost`
- [ ] `CONTAINER_ENV=NODE_ENV=development`
- [ ] Docker daemon running
- [ ] Dockerfile exists
- [ ] Jenkins accessible at http://localhost:8080

### Staging Setup
- [ ] `ENABLE_AUTO_DEPLOYMENT=true`
- [ ] `CONTAINER_NAME=devops-hub-staging`
- [ ] `ENVIRONMENT=staging`
- [ ] `DOCKER_REGISTRY=your-registry`
- [ ] Registry credentials configured
- [ ] CONTAINER_ENV set for staging
- [ ] Staging Jenkins job configured
- [ ] Staging domain configured

### Production Setup
- [ ] `ENABLE_AUTO_DEPLOYMENT=true`
- [ ] `CONTAINER_NAME=devops-hub-prod`
- [ ] `ENVIRONMENT=production`
- [ ] `DOCKER_REGISTRY=your-registry`
- [ ] Registry credentials in GitHub Secrets
- [ ] CONTAINER_ENV set for production
- [ ] Production Jenkins job configured
- [ ] Production domain with HTTPS
- [ ] Monitoring and alerts configured
- [ ] Backup and recovery plan

---

## 🧪 Testing Your Configuration

### Test 1: Manual Deployment

```bash
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "containerName": "devops-hub-app",
    "image": "localhost/devops-hub:test",
    "version": "test"
  }' \
  http://localhost:5000/api/deployments/deploy
```

### Test 2: Check Deployment Status

```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/deployments
```

### Test 3: Trigger Webhook (Simulated)

```bash
# Simulate GitHub webhook
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-Hub-Signature-256: sha256=$(echo -n '...' | openssl dgst -sha256 -hex)" \
  -d '{...webhook payload...}' \
  http://localhost:5000/api/webhooks/github
```

---

## 🆘 Troubleshooting Configuration

### Issue: Changes Not Taking Effect

```bash
# Problem: .env file not reloading
# Solution: Restart backend
npm start

# Or use nodemon for auto-reload
npm install --save-dev nodemon
npx nodemon src/server.js
```

### Issue: Docker Command Not Found

```bash
# Problem: Docker not installed or not in PATH
# Solution: Install Docker
# On macOS:
brew install docker
brew install docker-compose

# On Ubuntu:
sudo apt-get install docker.io docker-compose

# On Windows:
# Download from https://www.docker.com/products/docker-desktop
```

### Issue: Docker Daemon Not Running

```bash
# Problem: Docker daemon stopped
# Solution: Start Docker
# On Linux:
sudo systemctl start docker

# On macOS/Windows:
# Start Docker Desktop application

# Verify:
docker ps
```

### Issue: Invalid Registry URL

```bash
# Problem: DOCKER_REGISTRY format wrong
# Solution: Correct format
DOCKER_REGISTRY=localhost               # ✅ Local
DOCKER_REGISTRY=docker.io              # ✅ Hub
DOCKER_REGISTRY=registry.example.com   # ✅ Private
DOCKER_REGISTRY=registry.example.com:5000  # ✅ With port

# Don't use:
DOCKER_REGISTRY=http://localhost:5000  # ❌ Don't include protocol
DOCKER_REGISTRY=localhost:5000/v2/     # ❌ Don't include path
```

---

## 📚 Example .env Files

### Complete Production .env

```bash
# ===== EXISTING SETTINGS =====
NODE_ENV=production
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/devops-dashboard?retryWrites=true&w=majority
JWT_SECRET=your-secure-jwt-secret-here

# ===== GITHUB WEBHOOK =====
GITHUB_WEBHOOK_SECRET=your-generated-secret-key

# ===== JENKINS SETTINGS =====
JENKINS_URL=http://jenkins.example.com:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=117e1ccde0cced51ac00e8452932eb71b8
JENKINS_JOB_NAME=devops-hub-deploy

# ===== AUTOMATIC DEPLOYMENT =====
ENABLE_AUTO_DEPLOYMENT=true
CONTAINER_NAME=devops-hub-prod
CONTAINER_PORT=3000
HOST_PORT=3000
ENVIRONMENT=production
CONTAINER_ENV=NODE_ENV=production,LOG_LEVEL=warn,DEBUG=false
CONTAINER_VOLUMES=/var/lib/devops/data:/data,/var/log/devops:/logs
DOCKER_REGISTRY=registry.example.com
DOCKER_REGISTRY_USERNAME=prod-deploy-user
DOCKER_REGISTRY_PASSWORD=${DOCKER_REGISTRY_PASSWORD_PROD}
DEPLOYMENT_TIMEOUT=600000
POLL_INTERVAL=10000

# ===== MONITORING =====
ENABLE_MONITORING=true
ALERT_EMAIL=devops-team@example.com
```

### Complete Development .env

```bash
# ===== LOCAL SETTINGS =====
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/devops-dashboard
JWT_SECRET=dev-secret-key-insecure

# ===== GITHUB WEBHOOK =====
GITHUB_WEBHOOK_SECRET=dev-webhook-secret

# ===== JENKINS SETTINGS =====
JENKINS_URL=http://localhost:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=dev-token-123
JENKINS_JOB_NAME=devops-hub-deploy

# ===== AUTOMATIC DEPLOYMENT =====
ENABLE_AUTO_DEPLOYMENT=true
CONTAINER_NAME=devops-hub-app
CONTAINER_PORT=3000
HOST_PORT=3000
ENVIRONMENT=development
CONTAINER_ENV=NODE_ENV=development,LOG_LEVEL=debug,DEBUG=true
CONTAINER_VOLUMES=/app/data:/data
DOCKER_REGISTRY=localhost
DEPLOYMENT_TIMEOUT=300000
POLL_INTERVAL=5000
```

---

## 🚀 Next Steps

1. **Edit backend/.env** with your configuration
2. **Restart backend** with `npm start`
3. **Test with manual deployment** via API
4. **Trigger a test webhook** (push to GitHub)
5. **Monitor deployment** in logs and MongoDB
6. **Verify new container** is running
7. **Check deployment stats** via API

---

**Configuration Complete! Your automatic deployment system is ready.** ✅
