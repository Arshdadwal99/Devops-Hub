# Production Backend Setup Guide

## Complete Checklist for Production Deployment

This guide provides step-by-step instructions to set up the DevOps Hub backend for production.

## Phase 1: Prerequisites & Infrastructure

### 1. MongoDB Atlas Setup
```bash
1. Go to https://www.mongodb.com/cloud/atlas
2. Create a free cluster
3. Create database user with strong password
4. Configure IP whitelist (or allow all: 0.0.0.0/0)
5. Copy connection string: mongodb+srv://user:pass@cluster.mongodb.net/devops-dashboard
```

### 2. Firebase Project Setup
```bash
1. Go to https://console.firebase.google.com
2. Create new project
3. Go to Settings → Service Accounts
4. Generate new private key (JSON)
5. Save as `backend/serviceAccountKey.json`
6. Set environment variable: FIREBASE_PROJECT_ID
```

### 3. Jenkins Integration
```bash
1. Access Jenkins: http://jenkins-server:8080
2. Create new Pipeline job: "devops-hub-deploy"
3. Configure to accept parameters:
   - REPO_NAME
   - COMMIT_SHA
   - COMMIT_MESSAGE
   - AUTHOR
   - BRANCH
4. Go to User → Configure → API Token → Generate
5. Copy token to JENKINS_TOKEN env var
```

### 4. GitHub Webhook Setup
```bash
1. Go to Settings → Webhooks → Add webhook
2. Payload URL: https://your-domain/api/webhooks/github
3. Content type: application/json
4. Secret: Generate strong random string
5. Events: Push events
6. Select "Just the push event"
7. Copy secret to GITHUB_WEBHOOK_SECRET
```

### 5. Docker Setup
```bash
# On EC2/deployment server
docker daemon should be running and accessible
- Unix socket: /var/run/docker.sock
- Or TCP: tcp://localhost:2375

# Enable Docker socket access
sudo usermod -aG docker $USER
sudo systemctl restart docker
```

### 6. AWS EC2 Setup (Optional)
```bash
1. Create EC2 instance (Ubuntu 22.04 LTS)
2. Install Docker: https://docs.docker.com/install/
3. Install Docker Compose
4. Configure security groups to allow:
   - Port 22 (SSH)
   - Port 5000 (Backend API)
   - Port 3000 (Frontend)
5. Create IAM user with EC2 access
6. Generate access keys for backend
```

## Phase 2: Environment Configuration

### 1. Create .env File

```bash
cd backend
cp .env.example .env
```

### 2. Edit .env with Production Values

```env
# ============================================
# PRODUCTION CONFIGURATION
# ============================================

# Server
PORT=5000
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/devops-dashboard?retryWrites=true&w=majority

# Frontend Origins
CLIENT_ORIGIN=https://yourdomain.com,https://www.yourdomain.com,http://localhost:3000

# Authentication
JWT_SECRET=$(openssl rand -base64 32)
FIREBASE_ADMIN_KEY=$(cat serviceAccountKey.json | jq -c .)
FIREBASE_PROJECT_ID=your-firebase-project-id

# Jenkins
JENKINS_URL=http://jenkins-internal-ip:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=your-jenkins-api-token
JENKINS_JOB_NAME=devops-hub-deploy

# Docker
DOCKER_HOST=unix:///var/run/docker.sock

# GitHub
GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 32)
GITHUB_TOKEN=ghp_your_github_token

# AWS (if using EC2)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_EC2_INSTANCE_ID=i-1234567890abcdef0

# OpenAI (optional, for AI analysis)
OPENAI_API_KEY=sk-your-openai-key

# Alert Thresholds
ALERT_CPU_HIGH=85
ALERT_MEMORY_HIGH=85
ALERT_DISK_HIGH=90
ALERT_LATENCY_HIGH=500

# Features
ENABLE_AI_ANALYSIS=true
ENABLE_WEBHOOKS=true
ENABLE_METRICS_COLLECTION=true
```

## Phase 3: Installation & Testing

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Database Setup
```bash
# The app will create indexes automatically
# But you can seed initial data:
npm run seed
```

### 3. Local Testing
```bash
npm run dev

# In another terminal, test endpoints:
curl http://localhost:5000/api/health
# Should return: {"ok":true,"message":"Server is running","dbConnected":true}

# Test metrics
curl http://localhost:5000/api/metrics \
  -H "Authorization: Bearer test-token"
```

### 4. Integration Testing

```javascript
// Test Firebase auth
const firebaseToken = await getFirebaseIdToken(); // from frontend
fetch('http://localhost:5000/api/dashboard', {
  headers: { 'Authorization': `Bearer ${firebaseToken}` }
})
.then(r => r.json())
.then(console.log);

// Test deployment
fetch('http://localhost:5000/api/deployments/deploy', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${firebaseToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    containerName: 'test-app',
    image: 'nginx:latest',
    version: 'v1.0.0'
  })
})
.then(r => r.json())
.then(console.log);
```

## Phase 4: Docker Deployment

### 1. Build Docker Image
```bash
cd backend
docker build -t devops-hub-backend:latest .
```

### 2. Run Container
```bash
docker run -d \
  --name devops-hub-backend \
  -p 5000:5000 \
  -e MONGODB_URI="$MONGODB_URI" \
  -e FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID" \
  -e JENKINS_URL="$JENKINS_URL" \
  -e JENKINS_TOKEN="$JENKINS_TOKEN" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd)/serviceAccountKey.json:/app/serviceAccountKey.json \
  --restart unless-stopped \
  devops-hub-backend:latest
```

### 3. Docker Compose (Recommended)
```yaml
# docker-compose.yml
version: '3.9'

services:
  backend:
    build: ./backend
    container_name: devops-hub-backend
    ports:
      - "5000:5000"
    environment:
      PORT: 5000
      NODE_ENV: production
      MONGODB_URI: ${MONGODB_URI}
      FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID}
      JENKINS_URL: ${JENKINS_URL}
      JENKINS_TOKEN: ${JENKINS_TOKEN}
      CLIENT_ORIGIN: ${CLIENT_ORIGIN}
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./backend/serviceAccountKey.json:/app/serviceAccountKey.json
    restart: unless-stopped
    networks:
      - devops-network

networks:
  devops-network:
    driver: bridge
```

```bash
docker-compose up -d
```

## Phase 5: Monitoring & Logging

### 1. Health Checks
```bash
# Regular health check
curl http://localhost:5000/api/health

# Check database
curl http://localhost:5000/api/metrics -H "Authorization: Bearer $(gcloud auth print-identity-token)"
```

### 2. Docker Logs
```bash
# View logs
docker logs devops-hub-backend

# Follow logs
docker logs -f devops-hub-backend

# Last 100 lines
docker logs --tail 100 devops-hub-backend
```

### 3. System Monitoring
```bash
# CPU and memory usage
docker stats devops-hub-backend

# Port monitoring
netstat -tlnp | grep 5000
```

## Phase 6: Nginx Reverse Proxy (Optional but Recommended)

```nginx
# /etc/nginx/sites-available/devops-hub

upstream backend {
    server localhost:5000;
}

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # Gzip compression
    gzip on;
    gzip_types text/plain application/json;
    
    # CORS headers
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
    
    location /api {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_connect_timeout 10s;
    }
}
```

Enable and restart:
```bash
sudo ln -s /etc/nginx/sites-available/devops-hub /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

## Phase 7: SSL/TLS Setup

### Using Let's Encrypt
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d yourdomain.com -d www.yourdomain.com
```

## Phase 8: Backup & Recovery

### Database Backup
```bash
# Backup MongoDB
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/devops-dashboard" \
  --out=./backups/$(date +%Y%m%d)

# Restore MongoDB
mongorestore --uri="mongodb+srv://user:pass@cluster.mongodb.net" \
  ./backups/20260505
```

### Configuration Backup
```bash
# Backup .env and keys
tar -czf backups/config-$(date +%Y%m%d).tar.gz \
  backend/.env \
  backend/serviceAccountKey.json
```

## Phase 9: Performance Tuning

### MongoDB Optimization
```javascript
// Create indexes
db.pipelines.createIndex({ userId: 1, createdAt: -1 });
db.deployments.createIndex({ userId: 1, createdAt: -1 });
db.alerts.createIndex({ userId: 1, resolved: 1 });
db.logs.createIndex({ timestamp: 1 }, { expireAfterSeconds: 7776000 });
```

### Node.js Optimization
```bash
# Enable clustering (in production)
NODE_CLUSTER_SIZE=4 npm start

# Enable heap snapshots
node --max-old-space-size=4096 src/server.js
```

## Phase 10: Verification Checklist

- [ ] MongoDB Atlas connected and indexes created
- [ ] Firebase credentials loaded and verified
- [ ] Jenkins API token working
- [ ] GitHub webhook configured and verified
- [ ] Docker daemon accessible
- [ ] Backend health check returns 200
- [ ] Metrics endpoint returns valid data
- [ ] Pipeline status endpoint working
- [ ] Deployment endpoint tested
- [ ] Alerts endpoint working
- [ ] Socket.io connection working
- [ ] Frontend can authenticate and communicate
- [ ] SSL/TLS certificates valid
- [ ] Nginx reverse proxy working
- [ ] Monitoring and alerting configured

## Troubleshooting

### Backend won't start
```bash
# Check logs
docker logs devops-hub-backend

# Common issues:
# 1. MONGODB_URI not set: Set in .env
# 2. Port 5000 in use: Change PORT or kill process
# 3. Firebase key missing: Copy serviceAccountKey.json

# Test connection
npm run dev
```

### Database not connecting
```bash
# Check MongoDB Atlas
# 1. IP whitelist - add your server IP
# 2. Credentials - verify username/password
# 3. Connection string - copy from Atlas directly

# Test connection
mongo "mongodb+srv://user:pass@cluster.mongodb.net/devops-dashboard"
```

### Docker commands not working
```bash
# Check Docker daemon
sudo systemctl status docker

# Check socket permissions
ls -la /var/run/docker.sock

# Add user to docker group
sudo usermod -aG docker $(whoami)
newgrp docker
```

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more solutions.
