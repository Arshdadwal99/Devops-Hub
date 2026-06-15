# EC2 SSH Bootstrap & Docker Installation - Quick Reference

## 🚀 Quick Setup (5 minutes)

### 1. Prepare SSH Key

```bash
# If you don't have an EC2 key, create one in AWS Console
# Download the .pem file

# Set permissions (required)
chmod 600 /path/to/devops-hub-ec2.pem

# Verify it works
ssh -i /path/to/devops-hub-ec2.pem ubuntu@<PUBLIC_IP> "echo connected"
```

### 2. Update .env

Add these REQUIRED variables to `backend/.env`:

```bash
# REQUIRED: SSH Key Configuration (choose one)
AWS_EC2_KEY_PATH=/home/user/.ssh/devops-hub-ec2.pem

# REQUIRED: EC2 User Configuration
AWS_EC2_USER=ubuntu              # or "ec2-user" for Amazon Linux
AWS_EC2_KEY_NAME=devops-hub-ec2 # Key pair name from AWS

# OPTIONAL: Region (defaults to us-east-1)
AWS_REGION=us-east-1
```

### 3. Verify Configuration

```bash
# Start backend - should NOT throw SSH key error
npm run dev

# Check logs for:
# ✅ "EC2 SSH configuration selected"
# ✅ "Server listening on port 5000"
```

### 4. Deploy Application

1. Open DevOps Dashboard
2. Connect AWS account (if not already)
3. Click "One-Click Deploy"
4. Watch progress:
   - ✅ Check Existing Instances
   - ✅ Provision EC2 Instance  
   - ✅ Wait Until EC2 Running
   - ✅ **Install Docker** (NEW: auto-detects OS)
   - ✅ **Install Docker Compose** (NEW: retry logic)
   - ✅ Configure Deployment Environment
   - ... (continues to deployment)

## 📋 What Changed

| Aspect | Before | After |
|--------|--------|-------|
| SSH Retry Logic | None (fails on first timeout) | 10 retries, 30s delay |
| Username Detection | Hard-coded "ubuntu" | Auto-detected (ubuntu/ec2-user) |
| Error Messages | Generic SSH error | Detailed setup instructions |
| Docker Verification | Single attempt | 10 retries with logging |
| Bootstrap Logs | Not accessible | Captured & retrievable |
| Amazon Linux Support | ❌ Broken | ✅ Fully supported |

## 🔧 Troubleshooting

### Problem: "AWS_EC2_PRIVATE_KEY or AWS_EC2_KEY_PATH is required"

**Solution:** Add to `.env`:
```bash
AWS_EC2_KEY_PATH=/absolute/path/to/key.pem
chmod 600 /absolute/path/to/key.pem
```

### Problem: "SSH connection failed" during deployment

**Check:**
1. SSH key file exists: `ls -la /path/to/key.pem`
2. Permissions: `chmod 600 /path/to/key.pem`
3. Manual SSH works: `ssh -i /path/to/key.pem ubuntu@<PUBLIC_IP> "echo ok"`
4. Security group allows port 22

### Problem: "Docker not found" after retry attempts

**Check bootstrap logs:**
```bash
ssh -i /path/to/key.pem ubuntu@<PUBLIC_IP> "tail -100 /var/log/devops-hub-bootstrap.log"
```

**For Amazon Linux, check EC2 username:**
```bash
# Try with ec2-user instead
ssh -i /path/to/key.pem ec2-user@<PUBLIC_IP> "docker --version"
```

## 📊 Deployment Flow

```
Phase 2: Infrastructure
├─ Check Existing Instances ✅
├─ Provision EC2 Instance ✅
├─ Wait Until EC2 Running ✅
├─ Install Docker ✅ (IMPROVED)
│  └─ Auto-detects OS (Ubuntu/Amazon Linux)
│  └─ Uses correct package manager (apt/yum)
│  └─ Installs Docker, Docker Compose, Git, Node.js
├─ Install Docker Compose ✅ (NEW: Retry Logic)
│  └─ 10 retry attempts with 30s delay
│  └─ Displays Docker versions
│  └─ Captures logs on failure
├─ Configure Deployment Environment ✅
```

## 🎯 Key Features

✅ **Auto-Detect OS Type**
- Ubuntu → username: "ubuntu", package manager: "apt-get"
- Amazon Linux → username: "ec2-user", package manager: "yum"

✅ **SSH Connection Retry Logic**
- 10 attempts, 30 seconds between retries
- Total: 5 minutes of retry time
- Handles slow EC2 boot

✅ **Docker Verification with Retry**
- Verifies Docker is running (not just installed)
- Extracts Docker version for logging
- Shows Docker Compose version
- Captures bootstrap logs on failure

✅ **Detailed Error Messages**
- Setup instructions right in error
- Troubleshooting commands included
- Bootstrap logs accessible for debugging

## 📝 Example .env Configuration

```bash
# Backend
PORT=5000
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/db
JWT_SECRET=dev-secret-key-change-in-production

# AWS (Required for EC2 provisioning)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...

# EC2 SSH Configuration (REQUIRED)
AWS_EC2_KEY_PATH=/home/user/.ssh/devops-hub-ec2.pem
AWS_EC2_USER=ubuntu
AWS_EC2_KEY_NAME=devops-hub-ec2
AWS_EC2_PORT=22
AWS_ENABLE_INFRASTRUCTURE_PROVISIONING=true

# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...

# Jenkins
JENKINS_URL=http://jenkins:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=...

# Docker Hub
DOCKER_HUB_USERNAME=...
DOCKER_HUB_ACCESS_TOKEN=dckr_pat_...

# OpenAI (optional)
OPENAI_API_KEY=sk-...
```

## ✅ Validation Checklist

Before starting deployment:

- [ ] SSH key file exists at AWS_EC2_KEY_PATH
- [ ] SSH key permissions: `chmod 600` (read-write by owner only)
- [ ] AWS_EC2_KEY_NAME matches actual EC2 key pair
- [ ] AWS_EC2_USER correct (ubuntu or ec2-user)
- [ ] Manual SSH works: `ssh -i key.pem user@host "echo ok"`
- [ ] Security group allows port 22 inbound
- [ ] Backend restarted after .env changes
- [ ] No SSH key errors in backend startup logs

## 📞 Support

Need help?

1. **Check logs:** `docker logs <backend-container> | grep Install`
2. **SSH into EC2:** `ssh -i key.pem ubuntu@PUBLIC_IP`
3. **Check bootstrap:** `tail -100 /var/log/devops-hub-bootstrap.log`
4. **Check Docker:** `docker --version && docker-compose --version`

---

**Status:** ✅ Production Ready  
**Last Updated:** June 4, 2026  
