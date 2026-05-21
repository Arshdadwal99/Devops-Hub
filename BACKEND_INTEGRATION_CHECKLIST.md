# DevOps Hub Backend - Integration Checklist

## ✅ Pre-Flight Checklist

### Infrastructure Setup
- [ ] MongoDB Atlas cluster created
- [ ] Firebase project created and service account key generated
- [ ] Jenkins instance running and accessible
- [ ] Docker installed and running on your machine
- [ ] GitHub repository created
- [ ] Node.js 16+ installed

### Configuration
- [ ] `.env` file created from `.env.example`
- [ ] All environment variables filled in
- [ ] Firebase credentials verified
- [ ] Jenkins API token generated and working
- [ ] GitHub webhook secret created
- [ ] MongoDB connection tested

### Backend Setup
- [ ] `npm install` completed
- [ ] All dependencies installed
- [ ] Backend starts with `npm run dev`
- [ ] Health check responds: `http://localhost:5000/api/health`

---

## 🔗 Integration Verification

### 1. MongoDB Connection
```bash
# Check connection in logs
npm run dev

# Should see:
# ✅ MongoDB connected successfully
```

### 2. Firebase Authentication
```bash
# Verify in logs
# ✅ Firebase Admin SDK initialized

# Test with valid Firebase token:
curl -H "Authorization: Bearer <FIREBASE_TOKEN>" \
  http://localhost:5000/api/dashboard
```

### 3. Jenkins Integration
```bash
# Verify Jenkins can be reached
curl -u admin:TOKEN \
  http://localhost:8080/job/JENKINS_JOB_NAME/api/json

# Check logs for successful pipeline triggers
# 🚀 [Jenkins] Triggering pipeline
```

### 4. Docker Integration
```bash
# Verify Docker is accessible
docker ps

# Check logs for container detection
# 📊 [Metrics] Gathering system metrics...
```

### 5. GitHub Webhook
```bash
# Make a push to your repository
git add .
git commit -m "Test webhook"
git push origin main

# Check logs for webhook processing
# 📝 [Webhook] Processing push event
# 🔄 [Jenkins] Triggering pipeline
```

---

## 🧪 Testing Workflow

### Test 1: Dashboard Data
**Expected**: Returns real data from all sources

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/dashboard | jq
```

**Should return**:
```json
{
  "metrics": {
    "cpu": 45.2,
    "memory": 62.1,
    "disk": 28.5,
    "latency": 45
  },
  "pipeline": {
    "buildStatus": "success",
    "deploymentStatus": "stable"
  },
  "logs": [...],
  "alerts": [...]
}
```

### Test 2: Deployment
**Expected**: Creates deployment record and triggers Docker/Jenkins

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.1",
    "containerName": "devops-app",
    "image": "my-app:1.0.1"
  }' \
  http://localhost:5000/api/deployments/deploy
```

**Check logs for**:
```
🚀 [Deployment] Starting deployment: 1.0.1
✅ [Deployment] Deployment initiated
```

### Test 3: Rollback
**Expected**: Creates rollback deployment record

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "containerName": "devops-app",
    "previousVersion": "1.0.0",
    "reason": "Critical bug fix needed"
  }' \
  http://localhost:5000/api/deployments/rollback
```

**Check logs for**:
```
⏮️ [Dashboard] Triggering rollback
✅ [Dashboard] Rollback initiated
```

### Test 4: Metrics Collection
**Expected**: Real system metrics are collected

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/metrics | jq
```

### Test 5: Alerts
**Expected**: Alerts are generated for threshold breaches

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/alerts | jq
```

### Test 6: Socket.io Connection
**Expected**: Real-time updates are sent

```javascript
// In browser console or Node.js
const io = require('socket.io-client');
const socket = io('http://localhost:5000', {
  auth: { token: 'YOUR_FIREBASE_TOKEN' }
});

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('subscribe:metrics');
});

socket.on('metrics:update', (data) => {
  console.log('Metrics update:', data);
});
```

---

## 📊 Database Verification

Connect to MongoDB and verify collections:

```bash
# Using MongoDB Compass GUI
mongodb+srv://username:password@cluster.mongodb.net/devops-dashboard

# Or using mongosh CLI
mongosh "mongodb+srv://username:password@cluster.mongodb.net/devops-dashboard"

# Check collections
db.getCollectionNames()

# Expected collections:
# - users
# - deployments
# - logs
# - alerts
# - metrics
# - pipelines
# - webhooks
# - traffic
```

---

## 🐛 Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| `ECONNREFUSED` to MongoDB | Check `MONGODB_URI` in .env, verify IP whitelisting in Atlas |
| Firebase token invalid | Regenerate service account key, verify `FIREBASE_PROJECT_ID` |
| Jenkins not triggering | Check `JENKINS_TOKEN`, verify job name, check firewall |
| Docker commands fail | Ensure Docker daemon is running: `sudo systemctl start docker` |
| Webhook not firing | Verify GitHub webhook in repo settings, check secret matches .env |
| `Cannot find module` | Run `npm install` again, check node_modules directory |

---

## 🚀 Quick Start Commands

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your credentials

# Start backend
npm run dev

# In another terminal, start frontend
cd frontend
npm run dev

# Backend will be available at: http://localhost:5000/api
# Frontend will be available at: http://localhost:5173
```

---

## ✨ Success Indicators

You'll know everything is working when:

1. ✅ Backend starts without errors
2. ✅ `/api/health` returns 200 OK
3. ✅ `/api/dashboard` returns real metrics from Jenkins, Docker, system
4. ✅ Frontend shows real data in dashboard cards
5. ✅ Deploy/Restart/Rollback buttons work
6. ✅ Alerts appear when thresholds are breached
7. ✅ Git push triggers Jenkins build automatically
8. ✅ Real-time updates appear instantly in frontend
9. ✅ MongoDB records are created for deployments, alerts, logs

---

## 📞 Next Steps

1. **Run backend locally** following the Quick Start
2. **Test all integrations** using the verification steps
3. **Monitor logs** for errors or connection issues
4. **Deploy to production** when everything works
5. **Set up monitoring** and alerting rules
6. **Enable backups** for MongoDB

---

**Status**: ✅ Ready for Testing  
**Last Updated**: 2026-05-11
