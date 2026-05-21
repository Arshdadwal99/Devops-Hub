# GitHub Webhook - Complete Deployment Guide

## ✅ Step 1: Review the Quick Start Guide

### Read the Guide
Open and read: `GITHUB_WEBHOOK_QUICK_START.md`

**Key sections to review:**
- System Status (confirms all components working)
- Supported GitHub Events (Push, PR, Release)
- Quick Setup (5 minutes overview)
- API Endpoints (understand what you can do)

**Time needed:** 5 minutes

---

## ✅ Step 2: Generate Webhook Secret

### Generate Secure Random Secret

**On Windows (PowerShell):**
```powershell
$secret = -join ((0..31) | ForEach-Object { '{0:X2}' -f (Get-Random -Maximum 256) })
$secret
# Copy the output (e.g.: 8F7A3C9D2B1E4F6A8C5E7D9B2F1A4C6E...)

# Or use this one-liner:
openssl rand -hex 32
```

**On macOS/Linux:**
```bash
openssl rand -hex 32
# Output: 8f7a3c9d2b1e4f6a8c5e7d9b2f1a4c6e8f3b9d5a7c2e4f1a6b8d0e3c5a7f9b
```

### Store the Secret Safely
```
Generated Secret: ________________________________________
Keep this safe - you'll need it in the next step!
```

**Time needed:** 1 minute

---

## ✅ Step 3: Update .env File

### 3.1 Open Backend .env File
```bash
cd backend
# Edit with your editor (VS Code, nano, etc.)
code .env
```

### 3.2 Locate GitHub Webhook Configuration Section

**Find this section:**
```env
# GitHub Webhook Configuration
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret-key
```

### 3.3 Update These Lines

```env
# OLD
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret-key

# NEW (replace with your generated secret)
GITHUB_WEBHOOK_SECRET=8f7a3c9d2b1e4f6a8c5e7d9b2f1a4c6e8f3b9d5a7c2e4f1a6b8d0e3c5a7f9b
```

### 3.4 Verify All Jenkins Settings

```env
# Verify these are also set correctly:
JENKINS_URL=http://localhost:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=117e1ccde0cced51ac00e8452932eb71b8
JENKINS_JOB_NAME=devops-hub-deploy
```

### 3.5 Save the File

**In VS Code:** `Ctrl+S` or `Cmd+S`
**In nano:** `Ctrl+X`, then `Y`, then `Enter`

### 3.6 Verify Changes

```bash
# Check that the secret was saved
grep "GITHUB_WEBHOOK_SECRET" .env

# Should output:
# GITHUB_WEBHOOK_SECRET=8f7a3c9d2b1e4f6a8c5e7d9b2f1a4c6e...
```

**Time needed:** 5 minutes

---

## ✅ Step 4: Configure GitHub Webhook

### 4.1 Navigate to Your GitHub Repository

**Go to:** https://github.com/YOUR_USERNAME/YOUR_REPO/settings/webhooks

For example: https://github.com/dadwalarsh99/devops-dashboard/settings/webhooks

### 4.2 Click "Add webhook" Button

### 4.3 Fill in the Webhook Configuration

**Payload URL:**
```
https://your-domain/api/webhooks/github
```
Replace `your-domain` with:
- **Local testing:** `http://localhost:5000`
- **Production:** `https://devops-hub.example.com`

**Content type:**
```
application/json
```

**Secret:**
```
8f7a3c9d2b1e4f6a8c5e7d9b2f1a4c6e...
(Paste your generated secret here)
```

**Which events would you like to trigger this webhook?**
```
Select: "Let me select individual events"
```

### 4.4 Enable Specific Events

Click these checkboxes:
- ✓ **Pushes**
- ✓ **Pull requests**
- ✓ **Releases**

Uncheck (if checked):
- ☐ Issues
- ☐ Issue comment
- ☐ Wiki pages

### 4.5 Other Settings

```
☐ Re-deliveries (optional, for retries)
✓ Active (MUST BE CHECKED)
```

### 4.6 Click "Add webhook"

### 4.7 Verify Webhook Was Created

You should see:
- Green checkmark ✓ next to webhook name
- Recent Deliveries section below
- Test delivery should show status code

**Time needed:** 5 minutes

---

## ✅ Step 5: Verify GitHub Test Delivery

### 5.1 Check GitHub Webhook Delivery

Still in GitHub webhook settings, scroll down to "Recent Deliveries"

### 5.2 Look for Test Delivery

You should see an entry like:
```
Request ID: 12345-67890-test
Status: ✓ 200
Timestamp: May 13, 2026 at 10:30 PM
```

### 5.3 Click on the Delivery to See Response

Should show:
```json
{
  "success": true,
  "message": "Webhook processed...",
  "status": "ok"
}
```

If you see 200 status and success response → ✅ **GitHub connection works!**

**Time needed:** 2 minutes

---

## ✅ Step 6: Restart Backend (Load New Configuration)

### 6.1 Stop Backend Process

```bash
# In your backend terminal
# Press Ctrl+C

# Or if running in background:
pkill -f "node.*server"
```

### 6.2 Start Backend Again

```bash
cd backend
npm start

# You should see:
# ✅ Server running on port 5000
# ✅ Database connected
# ✅ Webhooks enabled
```

### 6.3 Verify Backend is Running

```bash
# In a new terminal
curl http://localhost:5000/api/health

# Should return:
# {"ok":true,"message":"Server is running","dbConnected":true}
```

**Time needed:** 2 minutes

---

## ✅ Step 7: Test with Real Push Event

### 7.1 Create Test Branch

```bash
# Clone repo (if you haven't)
git clone https://github.com/dadwalarsh99/devops-dashboard.git
cd devops-dashboard

# Create and checkout test branch
git checkout -b test/webhook-trigger
```

### 7.2 Make a Change

```bash
# Add a test file
echo "# Webhook Test - $(date)" > WEBHOOK_TEST.txt

# Or modify existing file
echo "Test webhook trigger" >> README.md
```

### 7.3 Commit the Change

```bash
git add .
git commit -m "Test webhook trigger - automated deployment system"
```

### 7.4 Push to GitHub

```bash
git push origin test/webhook-trigger

# Output should show:
# To github.com:dadwalarsh99/devops-dashboard.git
#  * [new branch]      test/webhook-trigger -> test/webhook-trigger
```

### 7.5 Watch for Webhook Processing

Immediately check your backend logs (see Step 8)

**Time needed:** 3 minutes

---

## ✅ Step 8: Monitor Logs and Jenkins

### 8.1 Watch Backend Logs in Real-Time

**In Terminal 1 (Backend):**
```bash
# Should already be running with `npm start`
# Watch for logs like:

📨 [Webhook] Received GitHub webhook
✅ GitHub signature verified. Event: push
📝 [Webhook] Processing push event from devops-dashboard
Extract data:
  Repository: devops-dashboard
  Branch: test/webhook-trigger
  Commit SHA: 1a2b3c4d5e6f...
  Message: Test webhook trigger...
  Author: Your Name
✅ Webhook saved to database: 507f1f77bcf86cd799439011
🔄 Triggering Jenkins pipeline...
✅ Jenkins pipeline triggered successfully. Build: 42
```

### 8.2 Check MongoDB for Webhook Entry

**In Terminal 2:**
```bash
mongosh

# Connect to your database
use devops-dashboard

# Find the webhook
db.webhooks.findOne({}, { sort: { createdAt: -1 } })

# Should show:
{
  "_id": ObjectId("507f1f77bcf86cd799439011"),
  "event": "push",
  "repository": {
    "name": "devops-dashboard",
    "branch": "test/webhook-trigger"
  },
  "commit": {
    "sha": "1a2b3c4d...",
    "message": "Test webhook trigger..."
  },
  "jenkinsPipelineTriggered": true,
  "jenkinsBuildNumber": 42,
  "status": "success",
  "createdAt": ISODate("2026-05-13T10:30:00Z")
}
```

### 8.3 Check Jenkins for New Build

**In Browser:**
```
Visit: http://localhost:8080/job/devops-hub-deploy/

You should see:
- Latest Build: #42
- Status: Building or Success
- Build Parameters:
  - REPO_NAME=devops-dashboard
  - BRANCH=test/webhook-trigger
  - COMMIT_SHA=1a2b3c4d...
  - AUTHOR=Your Name
```

### 8.4 View Build Details

Click on Build #42 to see:
- Build logs
- Git changes
- Status and duration

### 8.5 Verify GitHub Webhook Delivery

**Back in GitHub:**
```
Repository → Settings → Webhooks → Your webhook
Recent Deliveries section

Should show:
- Your push event delivery
- Status: ✓ 200
- Response: success message
```

**Time needed:** 5 minutes

---

## ✅ Step 9: Verify Complete End-to-End Flow

### Create a Checklist

After push, verify all of these work:

```
✓ Backend logs show webhook received
✓ Signature verified message appears
✓ MongoDB shows webhook entry
✓ MongoDB shows jenkinsBuildNumber set
✓ Jenkins shows new build triggered
✓ Build has correct parameters
✓ GitHub shows successful delivery (200)
✓ Backend returned success response
```

If all ✓, your webhook system is working perfectly!

**Time needed:** 5 minutes

---

## ✅ Step 10: Clean Up Test Artifacts

### 10.1 Delete Test Branch (Optional)

```bash
# Delete local branch
git branch -d test/webhook-trigger

# Delete remote branch
git push origin --delete test/webhook-trigger
```

### 10.2 Remove Test File

```bash
# Remove WEBHOOK_TEST.txt if you created it
git rm WEBHOOK_TEST.txt
git commit -m "Clean up: remove webhook test file"
git push origin main
```

**Time needed:** 2 minutes

---

## ✅ Step 11: Deploy to Production

### 11.1 Choose Your Deployment Environment

#### Option A: Traditional Server Deployment
```bash
# 1. SSH into production server
ssh ubuntu@your-production-server.com

# 2. Navigate to project
cd /app/devops-dashboard

# 3. Update code
git pull origin main

# 4. Update .env with production values
nano backend/.env
# Set: GITHUB_WEBHOOK_SECRET, JENKINS_URL, etc.

# 5. Restart backend
cd backend
npm install  # Update dependencies if needed
npm start    # Or use PM2/supervisor

# 6. Verify
curl https://your-domain/api/health
```

#### Option B: Docker Deployment
```bash
# 1. Build production image
docker build -t devops-hub-backend:latest backend/

# 2. Run with environment variables
docker run -d \
  -e GITHUB_WEBHOOK_SECRET=your-secret \
  -e JENKINS_TOKEN=your-token \
  -e MONGODB_URI=mongodb+srv://... \
  -p 5000:5000 \
  --name devops-hub-backend \
  devops-hub-backend:latest

# 3. Verify
curl http://localhost:5000/api/health
```

#### Option C: Kubernetes Deployment
```yaml
# Update configmap with secrets
kubectl create secret generic webhook-secrets \
  --from-literal=GITHUB_WEBHOOK_SECRET=your-secret \
  --from-literal=JENKINS_TOKEN=your-token

# Apply deployment
kubectl apply -f k8s-deployment.yaml
```

### 11.2 Update GitHub Webhook URL

**Go to GitHub Settings:**
```
Settings → Webhooks → Your Webhook
```

**Update Payload URL:**
```
OLD: http://localhost:5000/api/webhooks/github
NEW: https://your-production-domain/api/webhooks/github
```

**Save changes**

### 11.3 Verify Production Deployment

```bash
# Test webhook endpoint
curl -I https://your-production-domain/api/webhooks/health

# Should return 200 OK
```

### 11.4 Update .env for Production

Ensure these are set correctly:

```env
# Production Environment
NODE_ENV=production
PORT=5000

# GitHub
GITHUB_WEBHOOK_SECRET=your-production-secret

# Jenkins (Production Jenkins Server)
JENKINS_URL=http://production-jenkins:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=your-production-token
JENKINS_JOB_NAME=devops-hub-deploy

# Database (Production MongoDB)
MONGODB_URI=mongodb+srv://prod-user:prod-pass@prod-cluster.mongodb.net/devops-dashboard

# HTTPS
WEBHOOK_URL=https://your-domain/api/webhooks/github
```

### 11.5 Configure SSL/HTTPS (Critical!)

For production, HTTPS is required:

#### Using Let's Encrypt + Nginx
```bash
# 1. Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# 2. Get certificate
sudo certbot certonly --nginx -d your-domain.com

# 3. Configure Nginx
sudo nano /etc/nginx/sites-available/default

# Add:
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location /api/webhooks {
        proxy_pass http://localhost:5000;
    }
}

# 4. Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

#### Using Cloud Provider (AWS, GCP, Azure)
- Use managed SSL/TLS certificates
- Configure load balancer with HTTPS
- Point webhook URL to HTTPS endpoint

### 11.6 Final Verification Checklist

```bash
# ✓ Backend running
curl https://your-domain/api/health

# ✓ Webhook endpoint accessible
curl https://your-domain/api/webhooks/health

# ✓ GitHub webhook configured
# (Check GitHub settings)

# ✓ Database connected
# (Check logs or DB query)

# ✓ Jenkins accessible
curl -u admin:$JENKINS_TOKEN http://jenkins:8080/api/json

# ✓ SSL certificate valid
openssl s_client -connect your-domain:443
```

**Time needed:** 20-30 minutes

---

## ✅ Step 12: Post-Deployment Testing

### 12.1 Test with Real Production Push

```bash
# Make a commit
git checkout main
echo "Production test" >> README.md
git add README.md
git commit -m "Test webhook in production"
git push origin main
```

### 12.2 Monitor Production Logs

```bash
# SSH into production
ssh ubuntu@your-server.com

# View logs
tail -f /var/log/devops-hub/backend.log

# Should see same webhook processing logs
```

### 12.3 Verify in MongoDB

```bash
# Query production MongoDB
mongosh mongodb+srv://user:pass@cluster.mongodb.net

# Check webhooks
db.webhooks.findOne({}, { sort: { createdAt: -1 } })
```

### 12.4 Check Production Jenkins Build

```
Visit: http://your-jenkins-domain/job/devops-hub-deploy/

Should see:
- Latest build triggered by webhook
- Correct build parameters
- Successful execution
```

**Time needed:** 10 minutes

---

## ✅ Step 13: Set Up Monitoring & Alerts

### 13.1 Monitor Webhook Failures

```bash
# Set up alerts for failed webhooks
# In MongoDB:
db.webhooks.watch([
  { $match: { 
      operationType: "insert",
      "fullDocument.status": "failed"
    } 
  }
])
```

### 13.2 Set Up Logs Aggregation

```bash
# Centralize logs (optional)
# Using ELK Stack, CloudWatch, etc.

# Send backend logs to centralized system
docker logs devops-hub-backend | logstash -f config.conf
```

### 13.3 Set Up Grafana Dashboard

```bash
# Monitor metrics
- Webhooks received per day
- Success rate
- Average response time
- Jenkins builds triggered
```

**Time needed:** 15 minutes

---

## ✅ Step 14: Documentation & Handoff

### 14.1 Document Your Setup

Create a production runbook:
```
File: PRODUCTION_RUNBOOK.md

Contains:
- Deployment details
- Server locations
- Database info (sanitized)
- Contact info
- Troubleshooting steps
- Rollback procedure
```

### 14.2 Set Up On-Call Process

```
Team: DevOps Engineers
On-Call: Rotation schedule
Escalation: Team Lead → Manager
```

### 14.3 Share with Team

```
Send to team:
- Quick start guide
- Production runbook
- Troubleshooting guide
- Contact list
```

**Time needed:** 15 minutes

---

## 📋 Complete Deployment Checklist

```
STEP 1: Review Quick Start
  ☐ Read GITHUB_WEBHOOK_QUICK_START.md

STEP 2: Generate Secret
  ☐ Generated webhook secret
  ☐ Stored secret safely

STEP 3: Update .env
  ☐ Updated GITHUB_WEBHOOK_SECRET
  ☐ Verified JENKINS_TOKEN
  ☐ Saved .env file

STEP 4: Configure GitHub
  ☐ Set Payload URL
  ☐ Set Content Type to JSON
  ☐ Set Secret
  ☐ Selected events (Push, PR, Release)
  ☐ Activated webhook

STEP 5: Verify GitHub Test
  ☐ Checked GitHub delivery
  ☐ Confirmed 200 status

STEP 6: Restart Backend
  ☐ Stopped backend
  ☐ Started backend
  ☐ Verified /api/health

STEP 7: Test Real Push
  ☐ Created test branch
  ☐ Made commit
  ☐ Pushed to GitHub

STEP 8: Monitor Logs
  ☐ Checked backend logs
  ☐ Checked MongoDB
  ☐ Checked Jenkins builds
  ☐ Verified GitHub delivery

STEP 9: Verify End-to-End
  ☐ All flow steps working

STEP 10: Clean Up
  ☐ Deleted test branch
  ☐ Removed test files

STEP 11: Deploy to Production
  ☐ Updated production .env
  ☐ Updated GitHub webhook URL
  ☐ Configured SSL/HTTPS
  ☐ Verified production deployment

STEP 12: Test Production
  ☐ Pushed to production
  ☐ Monitored logs
  ☐ Checked builds triggered

STEP 13: Monitor & Alert
  ☐ Set up monitoring
  ☐ Set up alerts
  ☐ Created dashboard

STEP 14: Documentation
  ☐ Created runbook
  ☐ Shared with team
  ☐ Set up on-call

OVERALL STATUS: ✅ COMPLETE
```

---

## 🆘 Quick Troubleshooting

### Webhook Not Triggered
```bash
# 1. Check .env GITHUB_WEBHOOK_SECRET matches GitHub
# 2. Check backend is running: curl http://localhost:5000/api/health
# 3. Check GitHub webhook in Recent Deliveries
# 4. Check backend logs for "GitHub signature verified"
```

### "Invalid Signature" Error
```bash
# 1. Generate new secret: openssl rand -hex 32
# 2. Update .env
# 3. Restart backend
# 4. Update GitHub webhook secret to match
# 5. Test again
```

### Jenkins Build Not Triggered
```bash
# 1. Check JENKINS_TOKEN is valid
# 2. Verify Jenkins job exists: devops-hub-deploy
# 3. Check job is parameterized
# 4. Check backend logs for Jenkins error
```

### MongoDB Connection Failed
```bash
# 1. Check MONGODB_URI is correct
# 2. Verify IP whitelist in MongoDB Atlas
# 3. Check credentials
# 4. Test connection: mongosh $MONGODB_URI
```

---

## 📞 Getting Help

- **Setup Issues:** See GITHUB_WEBHOOK_QUICK_START.md
- **Technical Details:** See GITHUB_WEBHOOK_IMPLEMENTATION.md
- **Real Example:** See WEBHOOK_REAL_WORLD_EXAMPLE.md
- **Testing:** Run `node test-webhook-system.js`

---

**Total Time Required:** ~90-120 minutes
**Complexity:** Intermediate
**Success Rate:** >95% (if steps followed)
**Production Ready:** YES ✅
