# Automatic Docker Deployment - Quick Start (5 Min)

**Status:** ✅ Ready to Deploy  
**Time:** 5 minutes setup + deployment time  
**Complexity:** Beginner-friendly

---

## ⚡ 5-Minute Setup

### 1. Edit .env File (1 minute)

```bash
cd backend
nano .env
```

**Add these 5 lines** after your Jenkins settings:

```bash
# Auto-deployment
ENABLE_AUTO_DEPLOYMENT=true
CONTAINER_NAME=devops-hub-app
ENVIRONMENT=production
CONTAINER_PORT=3000
HOST_PORT=3000
```

**Save:** `Ctrl+X` → `Y` → Enter (nano) or `Ctrl+S` (VS Code)

### 2. Verify Docker is Running (1 minute)

```bash
# Check Docker
docker ps

# Should show output with CONTAINER ID, IMAGE, etc.
# If error: start Docker Desktop or run: sudo systemctl start docker
```

### 3. Verify Jenkins Connection (1 minute)

```bash
# Check Jenkins
curl -u admin:117e1ccde0cced51ac00e8452932eb71b8 \
  http://localhost:8080/job/devops-hub-deploy/api/json

# Should return job details (not 404)
```

### 4. Restart Backend (1 minute)

```bash
# Kill any running process
pkill -f "node src/server.js"

# Restart
npm start

# Watch for:
# ✅ Server running on port 5000
# ✅ Database connected
```

### 5. Trigger Test Deployment (1 minute)

```bash
# Make a test commit and push
git checkout -b test/auto-deploy
echo "test" >> README.md
git add . && git commit -m "Test auto-deploy"
git push origin test/auto-deploy
```

---

## 🚀 What Happens Automatically

```
You push code
    ↓
GitHub webhook sent to /api/webhooks/github
    ↓
Jenkins build triggered (build #123)
    ↓
✅ BUILD SUCCESS
    ↓
🔨 Docker image built automatically
    ↓
🗑️ Old container stopped & removed
    ↓
🚀 New container started
    ↓
✅ Application updated - No manual steps!
```

---

## ✅ How to Verify It Works

### Check Backend Logs

```bash
# Watch logs during deployment
tail -f logs/backend.log | grep -E "Webhook|Deployment|Docker"

# You'll see:
# [Webhook] Processing push event
# [Deployment] Starting automatic deployment
# [Docker] Building image
# [Deployment] Deployment completed successfully
```

### Check MongoDB

```bash
# View deployment record
mongosh
> use devops-dashboard
> db.deployments.findOne({}, {sort: {createdAt: -1}})

# Shows:
# status: "success"
# deploymentType: "auto"
# version: "[commit-sha]"
```

### Check API

```bash
# View all deployments
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/deployments

# View deployment stats
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/deployments/stats
```

### Check Running Container

```bash
# See new container running
docker ps

# Find your container
docker ps | grep devops-hub

# Check logs
docker logs [CONTAINER_ID]
```

---

## 🔧 Common Issues (& Quick Fixes)

| Issue | Solution |
|-------|----------|
| "Docker not found" | Install Docker or restart Docker Desktop |
| "Jenkins connection failed" | Check `JENKINS_TOKEN` in .env |
| "Deployment didn't trigger" | Check backend logs: `tail -f logs/backend.log` |
| "Build takes too long" | Increase: `DEPLOYMENT_TIMEOUT=600000` |
| "Container won't start" | Check: `docker logs [CONTAINER_ID]` |
| "Port already in use" | Change: `HOST_PORT=3001` instead |

---

## 📊 Monitoring Deployment

### Real-Time Log Monitoring

```bash
# Terminal 1: Watch backend logs
tail -f logs/backend.log | grep -E "Webhook|Deployment"

# Terminal 2: Watch Docker activity
watch -n 1 'docker ps | grep devops-hub'

# Terminal 3: Push code (triggers everything)
git push origin test/auto-deploy
```

### Expected Output Sequence

```
⏱️ T+0s:    [Webhook] Received GitHub push
⏱️ T+1s:    [Jenkins] Build #123 triggered
⏱️ T+5s:    [Deployment] Waiting for Jenkins build...
⏱️ T+15s:   ✅ Jenkins build completed (SUCCESS)
⏱️ T+20s:   [Docker] Building image...
⏱️ T+45s:   ✅ Docker image built
⏱️ T+50s:   [Docker] Stopping old container
⏱️ T+55s:   [Docker] Starting new container
⏱️ T+60s:   ✅ Deployment completed
```

---

## 🎯 Next Steps

1. ✅ **Setup complete** - Automatic deployment is active
2. ✅ **Make a test push** - Code automatically deployed
3. ✅ **Check logs** - Verify deployment steps
4. ✅ **Monitor stats** - View deployments via API
5. ⏭️ **Enable in production** - Update production `.env`
6. ⏭️ **Setup monitoring** - Configure alerts
7. ⏭️ **Team training** - Teach team the new flow

---

## 📚 More Information

- **Full Guide:** [AUTOMATIC_DOCKER_DEPLOYMENT.md](AUTOMATIC_DOCKER_DEPLOYMENT.md)
- **Configuration:** [DEPLOYMENT_CONFIGURATION_GUIDE.md](DEPLOYMENT_CONFIGURATION_GUIDE.md)
- **Troubleshooting:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

---

## 🎉 You're Done!

Your automatic Docker deployment system is now active!

```
┌─────────────────────────────────────────┐
│     AUTOMATIC CI/CD PIPELINE ACTIVE      │
├─────────────────────────────────────────┤
│ GitHub Push → Jenkins Build → Docker    │
│            All Automatic ✅              │
└─────────────────────────────────────────┘
```

**Next deployment:** Just push to GitHub 🚀
