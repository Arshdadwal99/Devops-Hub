# Automatic Docker Hub Workflow - Operations Guide

## Quick Start for Operations Team

### Prerequisites
- Jenkins instance with DevOps Hub plugin
- Docker Hub account with API access token
- AWS EC2 instance ready for deployment
- GitHub repository connected to DevOps Hub

---

## 1. Jenkins Configuration (One-Time Setup)

### Step 1: Create Docker Hub Credentials

1. Go to **Jenkins Dashboard** → **Manage Jenkins** → **Manage Credentials**
2. Select **Jenkins** → **Global Credentials** → **Add Credentials**
3. Choose **Username with password**
4. Fill in:
   - Username: `<docker_hub_username>` (e.g., `arshdadwal99`)
   - Password: `<docker_hub_access_token>` (NOT plain password)
   - ID: `dockerhub-credentials` (EXACT NAME)
5. Click **Create**

✅ **Verify:** Jenkins can now use this credential in pipelines

### Step 2: Create Docker Hub Access Token

If you don't have an access token:
1. Go to Docker Hub: `https://hub.docker.com/settings/personal-access-tokens`
2. Click **Generate New Token**
3. Give it name: "DevOps Hub Jenkins"
4. Select scope: **Read & Write**
5. Copy the token
6. Use this token as the password in Jenkins credential

✅ **Verify:** Token works by logging in: `docker login -u username --password-stdin`

---

## 2. Backend Configuration

### Update `.env` file:

```bash
# Docker Hub Configuration
DOCKER_REGISTRY_USERNAME=<your_docker_hub_username>
DOCKER_REGISTRY_PASSWORD=<your_docker_hub_access_token>
DOCKER_REGISTRY=docker.io
```

✅ **Verify:** No errors in backend logs after restart

---

## 3. Deploy Your First Repository

### Step 1: Connect Repository
1. Open DevOps Hub UI
2. Click **Connect Repository**
3. Select GitHub repository
4. Authorize DevOps Hub

### Step 2: Configure Deployment
1. Select **Target EC2 Instance**
2. Choose **Auto-Deploy on Push**
3. Click **Deploy**

### Step 3: Watch the Pipeline

**In Jenkins:**
1. Go to **Jenkins Dashboard**
2. Find job: `<repository-name>-deploy`
3. Click latest build
4. Watch stages:
   - ✅ Checkout
   - ✅ Build Docker Image
   - ✅ Docker Hub Login
   - ✅ Create Docker Hub Repository
   - ✅ Push Docker Image
   - ✅ Verify Docker Hub Image
   - ✅ Deploy (triggers EC2)

**Expected output:**
```
✅ Docker Hub Login successful
📋 Repository created: <repo-name>
📤 Image pushed to Docker Hub
✅ Image verified in Docker Hub
🚀 Triggering EC2 deployment...
```

### Step 4: Verify Deployment

**Check Docker Hub:**
1. Go to `hub.docker.com`
2. Navigate to your repository
3. Verify tags:
   - `<build_number>` (e.g., `123`)
   - `latest` (points to most recent)

**Check EC2:**
1. SSH into EC2 instance
2. Run: `docker ps`
3. Verify container is running
4. Check logs: `docker logs <container_name>`

---

## 4. Troubleshooting

### Issue: "Docker Hub Login Failed"
**Cause:** Invalid credentials  
**Solution:**
1. Verify `dockerhub-credentials` in Jenkins
2. Test credentials locally: `docker login -u username --password-stdin`
3. Check if token is valid (refresh if needed)

### Issue: "Repository Creation Failed"
**Cause:** Docker Hub API error or permissions  
**Solution:**
1. Check token has "Read & Write" scope
2. Verify repository name is valid (no spaces, lowercase)
3. Check Docker Hub API status

### Issue: "Image Verification Timeout"
**Cause:** Docker Hub indexing delay  
**Solution:**
1. Wait a few minutes and retry
2. Check `https://hub.docker.com/v2/repositories/username/reponame/`
3. Verify image was pushed: `docker pull docker.io/username/repo:tag`

### Issue: "Image Not Found When EC2 Tries to Pull"
**Cause:** Image never pushed or Jenkins credentials failed  
**Solution:**
1. Check Jenkins logs for push failure
2. Check `dockerhub-credentials` are configured correctly
3. Verify network connectivity from Jenkins to Docker Hub
4. Check Docker Hub rate limits (10 pulls/6 hours for anonymous)

### Issue: "EC2 SSH Connection Failed"
**Cause:** EC2 configuration issue (not related to Docker Hub)  
**Solution:**
1. Verify EC2 instance is running
2. Check security group allows port 22
3. Verify SSH key is correct
4. Test manually: `ssh -i key.pem ubuntu@ip_address`

---

## 5. Monitoring and Alerts

### Things to Monitor

| Metric | Expected | Alert If |
|--------|----------|----------|
| Docker Hub Login | ✅ Always succeeds | ❌ Fails (credentials issue) |
| Repository Creation | ✅ Succeeds or skips | ❌ Fails consistently |
| Image Push | ✅ Both tags succeed | ❌ Either tag fails |
| Image Verification | ✅ Verifies within 20s | ⚠️ Takes 20s+ (Docker Hub slow) |
| Image Pull on EC2 | ✅ Succeeds within 30s | ❌ Fails or timeout |
| Health Checks | ✅ Pass within 60s | ❌ Fail (app issue) |

### Log Locations

**Jenkins Build Log:**
```
Stage: Push Docker Image
  └─ docker push docker.io/username/repo:BUILD_NUMBER
  └─ docker push docker.io/username/repo:latest

Stage: Verify Docker Hub Image
  └─ Curl to hub.docker.com/v2/repositories/...
  └─ Retry logic (10 attempts)
```

**EC2 Deployment Log:**
```
Step 3: Verify Docker image exists...
Step 4: Pull Docker image from Docker Hub
Step 5: Start new containers
Step 8: Perform health checks
```

**Docker Hub Activity:**
```
Visit: hub.docker.com/r/username/repository
  └─ Tags tab: See all pushed images
  └─ Activity: See push/pull history
```

---

## 6. Common Scenarios

### Scenario: Push Code Again (New Build)

```bash
git commit -am "Update code"
git push origin main
```

**What happens:**
1. Jenkins triggers automatically
2. New BUILD_NUMBER is generated
3. Docker image built with new BUILD_NUMBER
4. Image pushed to Docker Hub with both tags
5. `latest` tag updated to point to new image
6. EC2 pulls new image and redeploys

**Time:** ~5-10 minutes total

---

### Scenario: Rollback to Previous Build

```bash
# Option 1: Using Docker Hub
docker pull docker.io/username/repo:123  # Previous build number
docker compose up -d

# Option 2: Using Jenkins
# Click "Build Now" on specific build job in Jenkins
```

---

### Scenario: Manual Repository Creation (Emergency Only)

```bash
# If automated creation fails, create manually:
curl -X POST https://hub.docker.com/v2/repositories/ \
  -u username:access_token \
  -H "Content-Type: application/json" \
  -d '{
    "namespace": "username",
    "name": "repository-name",
    "description": "Manual creation",
    "is_private": false
  }'
```

---

## 7. Performance Baseline

### Expected Pipeline Duration

| Stage | Duration | Notes |
|-------|----------|-------|
| Checkout | ~5 sec | GitHub clone |
| Build Dependencies | ~30 sec | npm install, pip install, etc |
| Build Docker Image | ~60 sec | Docker build |
| Docker Hub Login | ~2 sec | curl to Docker Hub |
| Repository Creation | ~3 sec | Non-blocking, may skip |
| Push Docker Image | ~30 sec | Both tags |
| Verify Docker Hub | ~10 sec | Usually 1st try |
| **TOTAL JENKINS** | **~140 sec** | ~2.5 minutes |
| EC2 SSH Setup | ~10 sec | SSH connection |
| EC2 Config | ~10 sec | Create docker-compose |
| Image Pull | ~30 sec | docker pull from Docker Hub |
| Container Start | ~5 sec | docker compose up |
| Health Checks | ~10 sec | curl http://localhost |
| **TOTAL EC2** | **~65 sec** | ~1 minute |
| **TOTAL DEPLOYMENT** | **~3.5 minutes** | From push to running |

---

## 8. Scaling to Multiple Repositories

### To deploy more repositories:

1. **Repeat for each repository:**
   - Connect to DevOps Hub
   - Set target EC2
   - Enable auto-deploy
   - Verify first deployment

2. **No additional Jenkins config needed:**
   - `dockerhub-credentials` is used for all repos
   - Each repo creates own Docker Hub repository
   - Each build gets unique BUILD_NUMBER

3. **Resource considerations:**
   - Docker Hub rate limits (see below)
   - Jenkins executor capacity
   - EC2 instance storage for images
   - Network bandwidth for pulls

### Docker Hub Rate Limits

- **Anonymous users:** 100 pulls / 6 hours
- **Authenticated users:** 200 pulls / 6 hours
- **DevOps Hub:** Uses authenticated pulls (Jenkins credential)
- **Multi-repo impact:** Each repo × builds = pulls

**Example:** 5 repos × 3 builds/day = 15 pulls/day ✅ Well within limits

---

## 9. Security Best Practices

### Do ✅
- Use access token (not plain password)
- Rotate token annually
- Use service account for DevOps Hub
- Restrict token scope (Read & Write only)
- Monitor Docker Hub activity logs
- Update Jenkins regularly

### Don't ❌
- Don't use personal password
- Don't commit credentials to git
- Don't expose token in logs
- Don't use overly permissive token scopes
- Don't reuse token across systems
- Don't hardcode repository names

---

## 10. Support & Escalation

### For Issues:

1. **Check logs first:**
   ```bash
   # Jenkins logs
   tail -f /var/log/jenkins/jenkins.log
   
   # DevOps Hub backend logs
   docker logs devops-hub-backend
   
   # EC2 Docker logs
   ssh ubuntu@ip "docker logs container_name"
   ```

2. **If logs show credential issue:**
   - Regenerate Docker Hub token
   - Update Jenkins credential
   - Run test push manually

3. **If logs show API issue:**
   - Check Docker Hub status: status.docker.com
   - Check network connectivity from Jenkins
   - Check rate limits

4. **If issue persists:**
   - Collect logs from: Jenkins, backend, EC2
   - Check Docker Hub API responses
   - Contact infrastructure team

---

## Summary

✅ **Automatic Docker Hub workflow is enabled**  
✅ **Zero manual Docker Hub steps required**  
✅ **Production-ready and tested**  
✅ **Scales to multiple repositories**  
✅ **Clear error messages for debugging**  

🚀 **Ready to deploy any GitHub repository!**

