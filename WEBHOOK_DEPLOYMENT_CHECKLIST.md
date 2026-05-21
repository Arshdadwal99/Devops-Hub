# GitHub Webhook Deployment - Printable Checklist

**Repository:** devops-dashboard  
**Date Started:** _______________  
**Completion Date:** _______________  
**Deployed By:** _______________  

---

## ✅ PRE-DEPLOYMENT PHASE

### Documentation & Planning
- [ ] Read GITHUB_WEBHOOK_QUICK_START.md
- [ ] Read WEBHOOK_DEPLOYMENT_GUIDE.md
- [ ] Understand architecture
- [ ] Verify environment (local or production)

### Secret Generation
- [ ] Generated webhook secret using: `openssl rand -hex 32`
- [ ] Secret value: ___________________________________________
- [ ] Stored in safe location
- [ ] Backed up secret

---

## ✅ CONFIGURATION PHASE

### Environment Setup

**Backend .env File:**
- [ ] Location: `backend/.env`
- [ ] Opened file successfully
- [ ] Found GITHUB_WEBHOOK_SECRET line

**Updated Values:**
```
GITHUB_WEBHOOK_SECRET: ___________________________________________
JENKINS_URL: ___________________________________________
JENKINS_USERNAME: ___________________________________________
JENKINS_TOKEN: ___________________________________________
JENKINS_JOB_NAME: ___________________________________________
MONGODB_URI: ___________________________________________
```

**File Operations:**
- [ ] Updated all values correctly
- [ ] Saved file (Ctrl+S or Cmd+S)
- [ ] Verified changes: `grep GITHUB_WEBHOOK .env`
- [ ] Confirmed secret is correct

---

## ✅ GITHUB CONFIGURATION PHASE

### Webhook Registration

**Navigate to:**
- [ ] Repository: https://github.com/YOUR_USERNAME/YOUR_REPO/settings/webhooks
- [ ] Logged in to GitHub
- [ ] Have permissions to manage webhooks

**Fill Webhook Form:**
- [ ] Payload URL: `https://your-domain/api/webhooks/github`
  - [ ] Using HTTPS (required for production)
  - [ ] Correct domain entered
  - [ ] Path is exactly: `/api/webhooks/github`

- [ ] Content Type: `application/json`
  - [ ] Selected from dropdown

- [ ] Secret: `[your-generated-secret]`
  - [ ] Copied entire secret
  - [ ] No extra spaces
  - [ ] Matches .env value exactly

**Select Events:**
- [ ] Clicked "Let me select individual events"
- [ ] Checked ✓ Pushes
- [ ] Checked ✓ Pull requests
- [ ] Checked ✓ Releases
- [ ] All other events unchecked

**Settings:**
- [ ] SSL verification: Enabled (default)
- [ ] Active: ✓ Checked

**Final Steps:**
- [ ] Clicked "Add webhook"
- [ ] Webhook appears in list with ✓ check
- [ ] No error messages

---

## ✅ VERIFICATION PHASE (GitHub)

### Test Delivery Check

**In GitHub Webhook Settings:**
- [ ] Scrolled to "Recent Deliveries"
- [ ] Found test delivery entry
- [ ] Status shows: ✓ 200
- [ ] Timestamp is recent
- [ ] Clicked on delivery to see response

**Response Should Show:**
```
{
  "success": true,
  "message": "Webhook processed...",
  "status": "ok"
}
```

**Verification:**
- [ ] Response code is 200
- [ ] Success field is true
- [ ] No error messages

---

## ✅ BACKEND STARTUP PHASE

### Process Management

**Terminal - Backend:**
- [ ] Navigated to: `cd backend`
- [ ] Stopped any running processes: Press Ctrl+C
- [ ] Waited 2 seconds for clean shutdown

**Backend Start:**
- [ ] Ran command: `npm start`
- [ ] Watched for startup messages:
  - [ ] "✅ Server running on port 5000"
  - [ ] "✅ Database connected"
  - [ ] "✅ Webhooks enabled"

**Health Check:**
- [ ] Opened another terminal
- [ ] Ran: `curl http://localhost:5000/api/health`
- [ ] Response shows: `"ok":true,"dbConnected":true`

---

## ✅ LOCAL TESTING PHASE

### Real Push Test

**Git Operations:**
- [ ] Repository cloned locally (if needed)
- [ ] Terminal in repo directory: `pwd`
- [ ] Created test branch: `git checkout -b test/webhook-trigger`
- [ ] Confirmed branch created

**Make Test Change:**
- [ ] Added/modified file (e.g., README.md)
- [ ] Verified file changed: `git status`

**Commit:**
- [ ] Ran: `git add .`
- [ ] Ran: `git commit -m "Test webhook trigger"`
- [ ] Commit successful with hash

**Push to GitHub:**
- [ ] Ran: `git push origin test/webhook-trigger`
- [ ] Push successful
- [ ] No authentication errors

---

## ✅ MONITORING PHASE

### Backend Logs

**Keep Terminal 1 (Backend) Open:**
- [ ] Backend still running
- [ ] Watch logs for webhook processing
- [ ] Look for these messages:

```
Expected Log Messages:
[ ] 📨 [Webhook] Received GitHub webhook
[ ] ✅ GitHub signature verified. Event: push
[ ] 📝 [Webhook] Processing push event
[ ] Extract data showing:
    [ ] Repository: devops-dashboard
    [ ] Branch: test/webhook-trigger
    [ ] Commit SHA: (some hash)
    [ ] Author: (your name)
[ ] ✅ Webhook saved to database
[ ] 🔄 Triggering Jenkins pipeline...
[ ] ✅ Jenkins pipeline triggered successfully. Build: [number]
```

### MongoDB Verification

**Terminal 2 - MongoDB:**
- [ ] Ran: `mongosh`
- [ ] Connected to database
- [ ] Ran: `use devops-dashboard`
- [ ] Ran: `db.webhooks.findOne({}, { sort: { createdAt: -1 } })`

**Document Should Contain:**
```
Expected Fields:
[ ] _id: (ObjectId)
[ ] event: "push"
[ ] repository.name: "devops-dashboard"
[ ] commit.sha: (matches your push)
[ ] commit.message: "Test webhook trigger"
[ ] branch: "test/webhook-trigger"
[ ] jenkinsPipelineTriggered: true
[ ] jenkinsBuildNumber: (a number)
[ ] status: "success"
[ ] createdAt: (recent timestamp)
```

### Jenkins Verification

**Browser - Jenkins UI:**
- [ ] Navigated to: `http://localhost:8080/job/devops-hub-deploy/`
- [ ] Found latest build (should be high number)
- [ ] Build status: Building or ✓ Success

**Build Details:**
- [ ] Clicked on latest build
- [ ] Verified parameters:
  - [ ] REPO_NAME=devops-dashboard
  - [ ] BRANCH=test/webhook-trigger
  - [ ] COMMIT_SHA=(matches your commit)
  - [ ] AUTHOR=(your name)

### GitHub Webhook Delivery

**Back in GitHub:**
- [ ] Repo → Settings → Webhooks → Your webhook
- [ ] Recent Deliveries section
- [ ] Found your push delivery entry
- [ ] Status: ✓ 200
- [ ] Response shows success message

---

## ✅ VALIDATION PHASE

### End-to-End Checklist

**All Systems Working?**
```
Backend System:
[ ] Backend logs show "GitHub signature verified"
[ ] No signature errors in logs
[ ] No "Database not connected" errors
[ ] No "Jenkins not configured" errors

MongoDB System:
[ ] Webhook entry created
[ ] Repository name correct
[ ] Commit info complete
[ ] Build number populated
[ ] Status is "success"

Jenkins System:
[ ] Build number in webhooks matches Jenkins build
[ ] Build parameters correct
[ ] Build executed successfully
[ ] No build failures

GitHub System:
[ ] Webhook delivery shows 200 status
[ ] Response includes success message
[ ] No failed deliveries

Integration:
[ ] Complete flow from push to build
[ ] All components communicating
[ ] No missing steps
```

**If all are checked: ✅ SYSTEM WORKING PERFECTLY!**

---

## ✅ CLEANUP PHASE

### Local Cleanup

**Delete Test Branch (Optional):**
- [ ] Ran: `git branch -d test/webhook-trigger`
- [ ] Ran: `git push origin --delete test/webhook-trigger`
- [ ] Test branch removed locally and remotely
- [ ] Confirmed on GitHub (branch list)

**Remove Test Files:**
- [ ] Reverted changes: `git checkout README.md`
- [ ] Or remove test file: `git rm WEBHOOK_TEST.txt`
- [ ] Committed: `git commit -m "Clean up webhook test"`
- [ ] Pushed: `git push origin main`

---

## ✅ PRODUCTION DEPLOYMENT PHASE

### Pre-Production Verification

**Documentation Review:**
- [ ] Read: WEBHOOK_DEPLOYMENT_GUIDE.md (Step 11+)
- [ ] Understand production deployment options
- [ ] Have production server access
- [ ] Understand production architecture

**Production Environment Prepared:**
- [ ] SSH access to production server verified
- [ ] Production .env file location known
- [ ] Production MongoDB connection string available
- [ ] Production Jenkins URL known
- [ ] Production domain/HTTPS endpoint ready

### Production Deployment

**SSH to Production Server:**
- [ ] Ran: `ssh user@your-production-server.com`
- [ ] Successfully connected
- [ ] Navigated to project: `cd /app/devops-dashboard`

**Update Code:**
- [ ] Ran: `git pull origin main`
- [ ] Latest code pulled
- [ ] No merge conflicts

**Update Configuration:**
- [ ] Opened: `backend/.env`
- [ ] Updated GITHUB_WEBHOOK_SECRET to production secret
- [ ] Updated JENKINS_URL to production Jenkins
- [ ] Updated JENKINS_TOKEN to production token
- [ ] Updated MONGODB_URI to production database
- [ ] Updated WEBHOOK_URL to production domain
- [ ] Set: NODE_ENV=production
- [ ] Saved file

**Deploy Backend:**
- [ ] Ran: `cd backend`
- [ ] Ran: `npm install` (if needed)
- [ ] Ran: `npm start` (or your deployment command)
- [ ] Backend running successfully

**Verify Production:**
- [ ] Ran: `curl https://your-production-domain/api/health`
- [ ] Got 200 response
- [ ] Database connected in response

### Update GitHub Webhook

**In GitHub Settings:**
- [ ] Repo → Settings → Webhooks → Your webhook
- [ ] Updated Payload URL to production domain: `https://your-domain/api/webhooks/github`
- [ ] Saved changes
- [ ] No errors

**SSL/HTTPS Configuration:**
- [ ] HTTPS endpoint active
- [ ] Valid SSL certificate
- [ ] No certificate warnings
- [ ] Firewall allows HTTPS (port 443)

---

## ✅ PRODUCTION TESTING PHASE

### First Production Test

**Real Commit:**
- [ ] Made a real commit to repository
- [ ] Pushed to GitHub: `git push origin main`

**Production Monitoring:**
- [ ] SSH to production server
- [ ] Watched production logs
- [ ] Looked for webhook processing messages
- [ ] Verified Jenkins build triggered

**Database Check:**
- [ ] Connected to production MongoDB
- [ ] Ran: `db.webhooks.findOne({}, { sort: { createdAt: -1 } })`
- [ ] Confirmed webhook entry exists
- [ ] Build number populated

**Jenkins Verification:**
- [ ] Visited production Jenkins UI
- [ ] Found latest build triggered by webhook
- [ ] Build executed successfully
- [ ] Parameters correct

**GitHub Delivery:**
- [ ] Checked GitHub webhook deliveries
- [ ] Latest delivery shows 200 status
- [ ] Success message in response

---

## ✅ PRODUCTION MONITORING PHASE

### Alert Setup

- [ ] Set up webhook failure alerts
- [ ] Configured MongoDB watches
- [ ] Set up log aggregation (optional)
- [ ] Created Grafana dashboard (optional)
- [ ] Configured Slack/Email notifications (optional)

### Documentation

- [ ] Created production runbook
- [ ] Documented all production URLs
- [ ] Documented emergency contacts
- [ ] Shared with team
- [ ] Set up on-call rotation

### Team Notification

- [ ] Informed team of webhook deployment
- [ ] Shared quick start guide
- [ ] Provided troubleshooting guide
- [ ] Set up training (if needed)
- [ ] Established support procedure

---

## ✅ HANDOFF CHECKLIST

### Knowledge Transfer

- [ ] Team trained on webhook system
- [ ] Runbook provided to operations
- [ ] Troubleshooting guide available
- [ ] Contact list established
- [ ] Escalation path defined

### Documentation

- [ ] All files committed to repository
- [ ] README updated with webhook info
- [ ] Architecture diagram available
- [ ] API documentation current
- [ ] Troubleshooting guide complete

### Monitoring

- [ ] Dashboards created
- [ ] Alerts configured
- [ ] Logging centralized
- [ ] On-call process established
- [ ] Incident response plan ready

---

## 🎉 FINAL VERIFICATION

### Overall System Status

**Backend:**
- [ ] Running on production
- [ ] Health check passing
- [ ] Database connected
- [ ] GitHub webhook secret configured

**GitHub:**
- [ ] Webhook active
- [ ] Recent deliveries showing 200
- [ ] No failed deliveries
- [ ] Events being received

**Jenkins:**
- [ ] Builds triggered by webhooks
- [ ] Parameters correct
- [ ] Builds executing successfully
- [ ] Build history recorded

**MongoDB:**
- [ ] Webhooks stored
- [ ] Build numbers tracked
- [ ] Status records accurate
- [ ] History queryable

**Production:**
- [ ] HTTPS/SSL working
- [ ] Domain accessible
- [ ] Monitoring active
- [ ] Alerts configured

---

## 📊 DEPLOYMENT SUMMARY

**Deployment Date:** _______________  
**Completion Time:** _______________ minutes  
**Deployed By:** _______________  
**Approved By:** _______________  

**Total Issues Encountered:** _______
**Issues Resolved:** _______
**Escalations:** _______

**System Status:** ☐ GREEN  ☐ YELLOW  ☐ RED

**Notes:**
```
_________________________________________________________________

_________________________________________________________________

_________________________________________________________________

_________________________________________________________________
```

---

## ✅ SIGN-OFF

**Technical Lead:** _______________  Date: _______________

**Operations Lead:** _______________  Date: _______________

**Project Manager:** _______________  Date: _______________

---

**🎉 DEPLOYMENT COMPLETE! 🎉**

This webhook system is now live and ready to automate your deployments!

Next: Monitor logs, respond to alerts, optimize performance.

Questions? Check the documentation files or contact the team.
