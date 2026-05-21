# Automatic Deployment Testing Guide

**Status:** ✅ Complete  
**Version:** 1.0  
**Last Updated:** May 13, 2026

---

## 🧪 Testing Automatic Deployment

This guide provides step-by-step tests to verify your automatic deployment system works correctly.

---

## ✅ Pre-Test Checklist

Before running tests:

- [ ] Backend running: `npm start`
- [ ] Docker daemon running: `docker ps`
- [ ] Jenkins accessible: `http://localhost:8080`
- [ ] MongoDB connected
- [ ] `.env` file configured
- [ ] GitHub webhook configured
- [ ] Dockerfile exists in repository

---

## 🧪 Test 1: Configuration Verification

**Objective:** Verify all settings are correct

```bash
# Check auto-deployment is enabled
grep ENABLE_AUTO_DEPLOYMENT backend/.env
# Expected: ENABLE_AUTO_DEPLOYMENT=true

# Check container name
grep CONTAINER_NAME backend/.env
# Expected: CONTAINER_NAME=devops-hub-app

# Check Docker is working
docker ps
# Expected: Shows list of containers (can be empty)

# Check Jenkins is accessible
curl -u admin:117e1ccde0cced51ac00e8452932eb71b8 \
  http://localhost:8080/job/devops-hub-deploy/api/json | jq '.name'
# Expected: "devops-hub-deploy"

# Check MongoDB connection
mongosh --eval "db.version()" devops-dashboard
# Expected: MongoDB version number (not error)
```

**✅ PASS:** All commands return expected results

---

## 🧪 Test 2: Manual Deployment

**Objective:** Verify manual deployment works (prerequisite for auto-deployment)

```bash
# Terminal 1: Watch logs
tail -f logs/backend.log | grep -E "Deployment|Docker"

# Terminal 2: Trigger manual deployment
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "containerName": "test-app",
    "image": "nginx:alpine",
    "version": "test-v1"
  }' \
  http://localhost:5000/api/deployments/deploy

# Expected response:
# {
#   "success": true,
#   "deployment": {...},
#   "logs": [...]
# }
```

**✅ PASS:** Deployment succeeds and container starts

```bash
# Verify container is running
docker ps | grep test-app
# Expected: See running container
```

---

## 🧪 Test 3: Jenkins Build Status Check

**Objective:** Verify Jenkins polling works

```bash
# Get recent build number
curl -u admin:117e1ccde0cced51ac00e8452932eb71b8 \
  http://localhost:8080/job/devops-hub-deploy/lastBuild/api/json | jq '.number'
# Expected: A number (e.g., 123)

# Get build status
curl -u admin:117e1ccde0cced51ac00e8452932eb71b8 \
  http://localhost:8080/job/devops-hub-deploy/lastBuild/api/json | jq '.result'
# Expected: "SUCCESS" or "FAILURE" (if build completed)
```

**✅ PASS:** Can retrieve build information

---

## 🧪 Test 4: Webhook Processing

**Objective:** Verify webhook is received and processed

### 4a: Simulate Webhook

```bash
# Generate test webhook signature
PAYLOAD='{"action":"opened","number":1,"pull_request":{"id":1}}'
SECRET="test-secret"
SIGNATURE="sha256=$(echo -n $PAYLOAD | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)"

# Send webhook
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-Hub-Signature-256: $SIGNATURE" \
  -d $PAYLOAD \
  http://localhost:5000/api/webhooks/github
```

**✅ PASS:** Returns 200 with success message

### 4b: Real GitHub Webhook

```bash
# Configure webhook in GitHub:
# 1. Go to: https://github.com/YOUR_REPO/settings/webhooks
# 2. Add webhook with your server URL
# 3. Make a test delivery
# 4. Check response is 200

# Monitor backend logs
tail -f logs/backend.log | grep "Webhook"
# Expected: [Webhook] Processing push event
```

---

## 🧪 Test 5: Automatic Deployment Trigger

**Objective:** Verify full automatic deployment flow

### 5a: Setup Monitoring

```bash
# Terminal 1: Monitor backend logs
tail -f logs/backend.log | grep -E "Webhook|Jenkins|Deployment|Docker"

# Terminal 2: Monitor Docker containers
watch -n 2 'docker ps --filter="name=devops" --format="table {{.Names}}\t{{.Status}}"'

# Terminal 3: Monitor deployments in MongoDB
mongosh --eval "db.deployments.find({}).limit(1).sort({_id:-1})"
```

### 5b: Trigger Deployment

```bash
# Make a test commit
cd /path/to/your/repo
git checkout -b test/deployment-$(date +%s)
echo "deployment test" >> README.md
git add README.md
git commit -m "Test automatic deployment"
git push origin test/deployment-*
```

### 5c: Monitor Progress

**Expected sequence in logs:**

```
[Webhook] Received GitHub push event
✅ Webhook saved to database
🔄 Triggering Jenkins pipeline...
✅ Jenkins pipeline triggered (Build #123)
🚀 Triggering automatic Docker deployment...

⏳ Waiting for Jenkins build #123 to complete...
✅ Jenkins build #123 completed (SUCCESS)

🔨 Building Docker image: localhost/devops-hub:abc1234
✅ Docker image built

📤 Pushing Docker image to registry...
ℹ️ Registry push skipped (local registry)

[Docker] Stopping old container: xyz789
✅ Old container stopped
🗑️ Removing container: xyz789
✅ Old container removed

🚀 Running new container...
✅ Container started: new123456

✅ Deployment successful (45 seconds)
```

---

## 🧪 Test 6: Database Records

**Objective:** Verify data is stored correctly

```bash
# Connect to MongoDB
mongosh devops-dashboard

# Check webhook record
db.webhooks.findOne({}, {sort: {_id: -1}})
# Expected fields:
# - event: "push"
# - jenkinsPipelineTriggered: true
# - deploymentTriggered: true
# - deploymentStatus: "success"

# Check deployment record
db.deployments.findOne({}, {sort: {_id: -1}})
# Expected fields:
# - status: "success"
# - deploymentType: "auto"
# - environment: "production"
# - containers: [...]
# - logs: [...]
# - duration: (milliseconds)

# Check deployment statistics
db.deployments.aggregate([
  {$group: {_id: "$status", count: {$sum: 1}}},
  {$sort: {_id: 1}}
])
# Expected: success count > 0
```

---

## 🧪 Test 7: API Endpoints

**Objective:** Verify all API endpoints work

### 7a: Get All Deployments

```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/deployments

# Expected: Array of deployments
```

### 7b: Get Auto-Deployments Only

```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/deployments/auto

# Expected: Only deployments with deploymentType: "auto"
```

### 7c: Get Deployment Stats

```bash
curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/deployments/stats | jq '.'

# Expected output:
# {
#   "success": true,
#   "stats": {
#     "total": 5,
#     "success": 5,
#     "failed": 0,
#     "successRate": 100,
#     "byType": {"auto": 5, ...},
#     "avgDuration": 45000,
#     "byEnvironment": [...]
#   }
# }
```

### 7d: Get Specific Deployment

```bash
# Get deployment ID from above
DEPLOYMENT_ID="60d5ec49c1234567890abcde"

curl -H "Authorization: Bearer TOKEN" \
  http://localhost:5000/api/deployments/$DEPLOYMENT_ID

# Expected: Full deployment details
```

---

## 🧪 Test 8: Error Handling

**Objective:** Verify error cases are handled gracefully

### 8a: Jenkins Build Failure

```bash
# Manually trigger failed build in Jenkins
# Then push code to trigger webhook

# Expected:
# - deploymentStatus: "failed"
# - Alert created
# - Logs show error
# - Old container still running
```

### 8b: Docker Build Failure

```bash
# Corrupt Dockerfile
echo "invalid" > Dockerfile
git add Dockerfile
git commit -m "Test error handling"
git push

# Expected:
# - Deployment fails after Docker build step
# - Error recorded in logs
# - Alert sent
# - Old container not stopped
```

### 8c: Port Already in Use

```bash
# Run container on HOST_PORT
# Then trigger deployment

# Expected:
# - Deployment fails with port error
# - Error message clear
# - Alert sent
```

---

## 🧪 Test 9: Rollback

**Objective:** Verify rollback functionality

```bash
# Deploy version 1
# Get deployment ID
# Wait 30 seconds

# Deploy version 2
# Get new deployment ID

# Rollback to version 1
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "containerName": "devops-hub-app",
    "previousVersion": "v1"
  }' \
  http://localhost:5000/api/deployments/rollback

# Expected:
# - Old version container restarted
# - New deployment record created with type: "rollback"
# - Status: "success"
```

---

## 🧪 Test 10: Concurrent Deployments

**Objective:** Verify system handles multiple pushes

```bash
# Terminal 1: Watch logs
tail -f logs/backend.log

# Terminal 2-4: Make multiple pushes concurrently
for i in {1..3}; do
  git checkout -b test-$i
  echo "test $i" >> README.md
  git add README.md
  git commit -m "Test concurrent $i"
  git push origin test-$i &
done
wait

# Expected:
# - Each deployment queued and processed
# - No data corruption
# - All deployments recorded
# - Status tracking accurate
```

---

## ✅ Test Checklist

Copy and use this checklist:

```
TEST RESULTS - Automatic Deployment System
============================================

☐ Test 1: Configuration Verification
  Status: [ ] PASS [ ] FAIL
  Notes: ___________________________________

☐ Test 2: Manual Deployment
  Status: [ ] PASS [ ] FAIL
  Notes: ___________________________________

☐ Test 3: Jenkins Build Status
  Status: [ ] PASS [ ] FAIL
  Notes: ___________________________________

☐ Test 4: Webhook Processing
  Status: [ ] PASS [ ] FAIL
  Notes: ___________________________________

☐ Test 5: Automatic Deployment
  Status: [ ] PASS [ ] FAIL
  Time: _______________ seconds
  Notes: ___________________________________

☐ Test 6: Database Records
  Status: [ ] PASS [ ] FAIL
  Notes: ___________________________________

☐ Test 7: API Endpoints
  Status: [ ] PASS [ ] FAIL
  Notes: ___________________________________

☐ Test 8: Error Handling
  Status: [ ] PASS [ ] FAIL
  Notes: ___________________________________

☐ Test 9: Rollback
  Status: [ ] PASS [ ] FAIL
  Notes: ___________________________________

☐ Test 10: Concurrent Deployments
  Status: [ ] PASS [ ] FAIL
  Notes: ___________________________________

OVERALL RESULT: [ ] ALL PASS [ ] SOME FAILED

Failed Tests (if any):
_____________________________________________________

Tester Name: _________________
Date: _______________________
```

---

## 🐛 Troubleshooting Failed Tests

### If Test 1 Fails (Configuration)
```bash
# Check .env syntax
node -e "require('dotenv').config({path: 'backend/.env'}); console.log('OK')"

# Check values
grep ENABLE_AUTO_DEPLOYMENT backend/.env
grep CONTAINER_NAME backend/.env
```

### If Test 2 Fails (Manual Deployment)
```bash
# Check Docker daemon
docker ps

# Check backend logs
tail -50 logs/backend.log

# Test Docker manually
docker run -d --name test-nginx nginx:alpine
docker ps | grep test-nginx
docker stop test-nginx
docker rm test-nginx
```

### If Test 5 Fails (Automatic Deployment)
```bash
# Check Jenkins build number
curl -u admin:TOKEN http://localhost:8080/job/devops-hub-deploy/lastBuild/number

# Check build result
curl -u admin:TOKEN \
  http://localhost:8080/job/devops-hub-deploy/lastBuild/api/json | jq '.result'

# Check Dockerfile exists
ls -la Dockerfile

# Verify permissions
docker buildx build --help 2>&1 | head -3
```

---

## 📊 Performance Benchmarks

Expected deployment times:

| Step | Time | Notes |
|------|------|-------|
| Webhook receive | <1s | Instant |
| Jenkins trigger | 1-2s | API call |
| Build wait | 5-60s | Depends on build |
| Docker build | 10-60s | Depends on image size |
| Push to registry | 5-30s | Optional, skipped for localhost |
| Container stop | 2-5s | Graceful shutdown |
| Container start | 2-5s | Pull image + start |
| **Total** | **30-180s** | Typically 45-60s |

---

## 🎯 Success Criteria

All tests pass when:

✅ Webhook received and processed  
✅ Jenkins build triggered  
✅ Docker image built  
✅ Old container stopped & removed  
✅ New container started  
✅ Status recorded in MongoDB  
✅ Alerts sent on completion  
✅ No errors in logs  
✅ APIs return correct data  
✅ Concurrent deployments handled  

---

**Testing Complete!** If all tests pass, your automatic deployment system is production-ready. 🚀
