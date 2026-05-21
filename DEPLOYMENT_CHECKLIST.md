# 🚀 DevOps Hub - Complete Deployment Checklist

Use this checklist to ensure everything is configured correctly before deploying to production.

---

## ✅ Part 1: Prerequisites (Complete Before Starting)

### GitHub
- [ ] Repository created and accessible
- [ ] GitHub personal access token generated
- [ ] Token has `repo` and `webhook` permissions
- [ ] Repository configured for webhooks

### Jenkins
- [ ] Jenkins installed and running
- [ ] Jenkins accessible at configured URL
- [ ] Admin user created
- [ ] API token generated for admin user
- [ ] Jenkins URL and credentials tested
- [ ] Jenkinsfile exists in repository root

### Docker
- [ ] Docker installed on deployment server
- [ ] Docker daemon running
- [ ] Docker commands executable (`docker ps`)
- [ ] Dockerfile in repository root

### MongoDB
- [ ] MongoDB Atlas account created or MongoDB installed locally
- [ ] Database created: `devops-dashboard`
- [ ] Connection string obtained
- [ ] IP whitelist configured (for Atlas)
- [ ] Database accessible from backend

### AWS EC2 (Optional, if deploying to EC2)
- [ ] EC2 instance created and running
- [ ] SSH key pair downloaded
- [ ] SSH accessible: `ssh -i key.pem ubuntu@host`
- [ ] Docker installed on EC2
- [ ] Security group allows port 3000, 5000, 8080

### Firebase (For Authentication)
- [ ] Firebase project created
- [ ] Web app registered
- [ ] Firebase credentials obtained
- [ ] serviceAccountKey.json downloaded
- [ ] Firebase Admin SDK initialized

---

## ✅ Part 2: Backend Configuration

### Environment Setup
- [ ] Backend `.env` file created from `.env.example`
- [ ] All required variables filled in:
  - [ ] `MONGODB_URI`
  - [ ] `JWT_SECRET` (strong, 32+ characters)
  - [ ] `JENKINS_URL`
  - [ ] `JENKINS_USER`
  - [ ] `JENKINS_TOKEN`
  - [ ] `GITHUB_WEBHOOK_SECRET`
  - [ ] `GITHUB_TOKEN`
  - [ ] `AWS_EC2_HOST` (if using EC2)
  - [ ] `AWS_EC2_USER`
  - [ ] `AWS_EC2_KEY_PATH`
  - [ ] `FIREBASE_PROJECT_ID`
  - [ ] `OPENAI_API_KEY` (optional)

### Installation & Build
- [ ] `cd backend && npm install` succeeded
- [ ] No security vulnerabilities: `npm audit` (optional)
- [ ] `npm run build` completed (if applicable)
- [ ] Backend starts without errors: `npm run dev`

### Health Check
- [ ] `curl http://localhost:5000/api/health` returns `{"ok": true}`
- [ ] Database connection successful
- [ ] No errors in console logs

---

## ✅ Part 3: Frontend Configuration

### Environment Setup
- [ ] Frontend `.env.local` file created from `.env.example`
- [ ] All required variables filled in:
  - [ ] `VITE_API_URL` (points to backend)
  - [ ] `VITE_WEBSOCKET_URL` (points to backend)
  - [ ] Firebase configuration variables
  - [ ] All `VITE_FIREBASE_*` variables

### Installation & Build
- [ ] `cd frontend && npm install` succeeded
- [ ] `npm run build` completed successfully
- [ ] `frontend/dist/` directory created
- [ ] Frontend runs: `npm run dev`

### Verification
- [ ] Frontend accessible at `http://localhost:5173`
- [ ] Can log in with Firebase
- [ ] Dashboard loads without errors
- [ ] Console has no critical errors

---

## ✅ Part 4: GitHub Webhook Setup

### Webhook Configuration
- [ ] Go to GitHub repository Settings → Webhooks
- [ ] Click "Add webhook"
- [ ] Configure:
  - [ ] **Payload URL**: `https://your-backend-url/api/webhooks/github`
  - [ ] **Content type**: `application/json`
  - [ ] **Secret**: Matches `GITHUB_WEBHOOK_SECRET` in .env
  - [ ] **Events**: Select "Push events"
  - [ ] **Active**: Checkbox is checked

### Webhook Testing
- [ ] Webhook shows in GitHub Settings
- [ ] Green checkmark (delivered successfully)
- [ ] Recent deliveries shown
- [ ] Can view request/response details

### Manual Webhook Test
- [ ] Run: `node test-webhook-system.js`
- [ ] Test output shows webhook received successfully
- [ ] MongoDB contains webhook entry
- [ ] Backend logs show webhook processing

---

## ✅ Part 5: Jenkins Pipeline Setup

### Job Creation
- [ ] Login to Jenkins: `http://your-jenkins:8080`
- [ ] Create new Job → Pipeline
- [ ] Configure:
  - [ ] **Name**: `devops-hub-deploy` (or configured `JENKINS_JOB_NAME`)
  - [ ] **Definition**: Pipeline script from SCM
  - [ ] **SCM**: Git
  - [ ] **Repository URL**: Your GitHub repo URL
  - [ ] **Credentials**: GitHub credentials

### Jenkinsfile
- [ ] Jenkinsfile exists in repository root
- [ ] All stages present:
  - [ ] Checkout
  - [ ] Install Dependencies
  - [ ] Build Application
  - [ ] Docker Build
  - [ ] Deploy Docker Container

### Manual Trigger Test
- [ ] Run: `node test-jenkins-api.js`
- [ ] Test output shows build triggered
- [ ] Jenkins job starts automatically
- [ ] View build logs without errors

---

## ✅ Part 6: Docker Configuration

### Dockerfile
- [ ] Dockerfile exists in repository root
- [ ] Includes all stages:
  - [ ] Installs dependencies
  - [ ] Builds application
  - [ ] Copies frontend dist
  - [ ] Exposes port 5000
  - [ ] Sets environment variables

### Docker Build Test
- [ ] `docker build -t devops-hub:latest .` succeeds
- [ ] Image created successfully
- [ ] Image is reasonably sized (<1GB)
- [ ] No build warnings or errors

### Docker Run Test
```bash
docker run -d \
  --name devops-hub-test \
  -p 5000:5000 \
  -e MONGODB_URI=$MONGODB_URI \
  -e JWT_SECRET=$JWT_SECRET \
  devops-hub:latest
```
- [ ] Container starts
- [ ] `curl http://localhost:5000/api/health` returns success
- [ ] Container logs show no errors
- [ ] `docker stop devops-hub-test && docker rm devops-hub-test`

---

## ✅ Part 7: AWS EC2 Deployment (Optional)

### EC2 Instance Preparation
- [ ] EC2 instance running Ubuntu
- [ ] SSH key accessible: `ssh -i key.pem ubuntu@host`
- [ ] Docker installed: `docker --version`
- [ ] Security group allows:
  - [ ] Port 22 (SSH)
  - [ ] Port 5000 (Backend)
  - [ ] Port 3000 (Frontend, if needed)

### SSH Deployment Test
- [ ] Update `.env`: `AWS_EC2_KEY_PATH=/path/to/key.pem`
- [ ] SSH command works: `ssh -i key.pem ubuntu@host 'docker ps'`
- [ ] Run test:
  ```bash
  curl -X POST http://localhost:5000/api/deployments/deploy \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"image": "devops-hub:latest", "containerName": "devops-hub-app"}'
  ```
- [ ] Deployment completes successfully
- [ ] Container running on EC2

---

## ✅ Part 8: API Endpoints Verification

### Health & Status
- [ ] `GET /api/health` → `{"ok": true, "dbConnected": true}`
- [ ] `GET /api/dashboard` → Returns dashboard data

### Jenkins APIs
- [ ] `GET /api/jenkins/pipeline/status` → Returns pipeline status
- [ ] `POST /api/jenkins/trigger` → Triggers build
- [ ] `GET /api/jenkins/builds` → Returns build history

### Deployment APIs
- [ ] `GET /api/deployments` → Returns deployments list
- [ ] `POST /api/deployments/deploy` → Triggers deployment
- [ ] `POST /api/deployments/rollback` → Performs rollback

### Monitoring APIs
- [ ] `GET /api/metrics` → Returns metrics
- [ ] `GET /api/docker/containers` → Returns containers
- [ ] `GET /api/logs` → Returns logs
- [ ] `GET /api/alerts` → Returns alerts

### Analysis APIs
- [ ] `POST /api/analyze-logs` → Analyzes logs with AI

---

## ✅ Part 9: Real-Time Features (Socket.io)

### Socket Connection
- [ ] Frontend connects to backend WebSocket
- [ ] No connection errors in browser console
- [ ] Auth token properly passed

### Socket Subscriptions
- [ ] Frontend subscribes to all events:
  - [ ] `subscribe:metrics`
  - [ ] `subscribe:pipeline`
  - [ ] `subscribe:logs`
  - [ ] `subscribe:alerts`
  - [ ] `subscribe:docker-monitor`

### Real-Time Updates
- [ ] Dashboard updates in real-time
- [ ] No page refresh needed
- [ ] Metrics update every 10 seconds
- [ ] Logs appear as they're generated
- [ ] Alerts display instantly

---

## ✅ Part 10: Complete End-to-End Test

### Run Test Suite
```bash
node test-e2e-cicd.js
```

- [ ] All tests pass (or > 80% success rate)
- [ ] No critical failures
- [ ] Check output for any warnings
- [ ] Review failed tests if any

### Manual End-to-End Flow
1. [ ] Make a test commit to GitHub
   ```bash
   git commit --allow-empty -m "Test CI/CD pipeline"
   git push origin main
   ```

2. [ ] GitHub webhook triggers (check backend logs)
3. [ ] Jenkins job starts automatically
4. [ ] View Jenkins build logs (should complete)
5. [ ] Docker image builds successfully
6. [ ] Container deployment succeeds
7. [ ] Dashboard shows new deployment
8. [ ] Check metrics, logs, alerts updated

---

## ✅ Part 11: Security Verification

### Credentials
- [ ] No credentials in code repository
- [ ] All secrets in `.env` files
- [ ] `.env` files in `.gitignore`
- [ ] `node_modules/` in `.gitignore`
- [ ] `dist/` in `.gitignore`

### Authentication
- [ ] Firebase authentication working
- [ ] JWT tokens validated
- [ ] Protected routes require auth
- [ ] Unauthorized access denied

### CORS
- [ ] Frontend can access backend
- [ ] No CORS errors in console
- [ ] Allowed origins configured correctly

### Data Security
- [ ] HTTPS used in production
- [ ] Sensitive data not logged
- [ ] API tokens not exposed
- [ ] Database credentials not in logs

---

## ✅ Part 12: Performance Verification

### Response Times
- [ ] `/api/health` → < 100ms
- [ ] `/api/metrics` → < 500ms
- [ ] `/api/logs` → < 1000ms
- [ ] Dashboard loads → < 2 seconds

### Resource Usage
- [ ] Backend memory < 500MB
- [ ] Frontend bundle < 1MB (gzipped)
- [ ] No memory leaks (run for 1 hour)
- [ ] CPU usage reasonable (< 50% idle)

### Database
- [ ] Queries are indexed
- [ ] No slow queries
- [ ] Connection pooling working
- [ ] Backup enabled

---

## ✅ Part 13: Monitoring & Alerting

### Dashboard Displays
- [ ] System metrics (CPU, memory, disk)
- [ ] Pipeline status
- [ ] Build history
- [ ] Deployment history
- [ ] Container status
- [ ] Recent logs
- [ ] Active alerts

### Alerts Configured
- [ ] Alerts on build failure
- [ ] Alerts on deployment failure
- [ ] Alerts on high CPU usage
- [ ] Alerts on high memory usage
- [ ] Alerts on container crash

### Logging
- [ ] All operations logged
- [ ] Logs searchable by source
- [ ] Logs searchable by type
- [ ] Logs have timestamps

---

## ✅ Part 14: Documentation

### README Files
- [ ] [CICD_COMPLETE_README.md](CICD_COMPLETE_README.md) - Main documentation
- [ ] [CICD_PRODUCTION_SETUP.md](CICD_PRODUCTION_SETUP.md) - Setup guide
- [ ] [FRONTEND_INTEGRATION_GUIDE.md](FRONTEND_INTEGRATION_GUIDE.md) - Frontend guide
- [ ] [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Troubleshooting guide

### Configuration Templates
- [ ] `backend/.env.example` - Backend config template
- [ ] `frontend/.env.example` - Frontend config template
- [ ] `Dockerfile` - Docker container config
- [ ] `docker-compose.yml` - Docker Compose config

### Scripts
- [ ] `test-e2e-cicd.js` - End-to-end tests
- [ ] `deploy.js` - Deployment automation
- [ ] `.github/workflows/cicd.yml` - GitHub Actions workflow

---

## ✅ Part 15: Production Readiness

### Final Checks
- [ ] All checklist items completed
- [ ] All tests passing
- [ ] No console errors
- [ ] No security issues
- [ ] Documentation complete
- [ ] Team trained on usage
- [ ] Backup strategy in place
- [ ] Monitoring configured
- [ ] Incident response plan ready
- [ ] Rollback procedure tested

### Go-Live
- [ ] Schedule deployment window
- [ ] Notify team
- [ ] Perform final backup
- [ ] Execute deployment
- [ ] Run health checks
- [ ] Monitor for issues
- [ ] Confirm success

---

## 🎉 Deployment Complete!

Once all checks are complete:

✅ **Your system is production-ready!**

Every GitHub push will now automatically:
1. Trigger GitHub webhook
2. Start Jenkins pipeline
3. Build Docker image
4. Deploy to production
5. Update dashboard in real-time

---

## 📞 If Something Fails

### Step 1: Check Logs
```bash
# Backend logs
npm --workspace backend run dev

# Docker logs
docker logs container-name

# Jenkins logs
curl http://jenkins:8080/job/devops-hub-deploy/lastBuild/consoleText
```

### Step 2: Review Troubleshooting
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- [QUICK_FIX_REFERENCE.md](QUICK_FIX_REFERENCE.md)

### Step 3: Run Tests
```bash
node test-e2e-cicd.js
node test-webhook-system.js
node test-jenkins-api.js
```

### Step 4: Check Specific Component
- Backend health: `curl http://localhost:5000/api/health`
- Frontend: Open http://localhost:5173 in browser
- Database: Try mongosh or MongoDB Compass
- Docker: `docker ps`, `docker logs`
- Jenkins: Visit http://jenkins:8080

---

## 📊 Monitoring Dashboard Checklist

Once deployed, monitor these metrics:

### Daily
- [ ] Check dashboard health status
- [ ] Review deployment history
- [ ] Check for alerts
- [ ] Review error logs

### Weekly
- [ ] Performance metrics (CPU, memory, latency)
- [ ] Build success rate
- [ ] Deployment frequency
- [ ] System uptime

### Monthly
- [ ] Capacity planning
- [ ] Cost optimization
- [ ] Security updates
- [ ] Backup verification

---

## 🎯 Success Criteria

Your CI/CD system is successful when:

✅ GitHub push → Jenkins build (< 1 second)
✅ Build completes (< 5 minutes typical)
✅ Docker image created successfully
✅ Container deployed in seconds
✅ Dashboard updates in real-time
✅ Logs and metrics visible
✅ Alerts generated on failures
✅ Rollback works smoothly
✅ Zero downtime deployments
✅ All health checks pass

---

You're ready! 🚀
