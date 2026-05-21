# ⚡ QUICK REFERENCE CARD - DevOps Hub Automated Deployment

## 🚀 Get Started in 3 Commands

```bash
# 1. Configure (Interactive setup)
cd backend
node setup-wizard.js

# 2. Verify (Check system health)
node verify-setup.js

# 3. Launch (Start services)
npm start
```

**Then:** Push code to GitHub → Automatic deployment! 🎉

---

## 📋 What Each Script Does

| Script | Command | Purpose | Time |
|--------|---------|---------|------|
| **Setup** | `node setup-wizard.js` | Configure AWS EC2 | 5 min |
| **Verify** | `node verify-setup.js` | Check system | 1 min |
| **Launch** | `npm start` or `node start-all.js` | Start services | - |

---

## 🌐 Access Points (After Launching)

| Service | URL | Purpose |
|---------|-----|---------|
| Backend API | `http://localhost:5000` | REST API |
| Frontend | `http://localhost:5173` | Dashboard UI |
| Dashboard | `http://localhost:5173/dashboard` | Monitoring |
| Health Check | `http://localhost:5000/health` | System status |

---

## 🔧 AWS EC2 Quick Setup

```bash
# 1. On your machine (Windows PowerShell)
ssh -i "key.pem" ubuntu@YOUR_EC2_IP

# 2. On EC2 (copy-paste):
sudo apt update && sudo apt install -y docker.io docker-compose nginx
sudo usermod -aG docker ubuntu
sudo systemctl start docker nginx
```

---

## 🐙 GitHub Webhook Setup

1. Go to: `github.com/YOUR_REPO/settings/webhooks`
2. Click "Add webhook"
3. Set:
   - **URL:** `https://your-domain/api/webhooks/github`
   - **Events:** Push
4. Click "Add webhook"

Done! Now pushes trigger deployments. ✨

---

## ✅ Verification Checklist

```bash
# Quick verification
node backend/verify-setup.js

# Expected: ✅ Mostly green checks

# If red X on AWS_EC2_*:
# → Run setup wizard: node setup-wizard.js

# If all green:
# → Ready to launch: npm start
```

---

## 📊 Deployment Flow

```
Your Code Push
    ↓
GitHub Webhook
    ↓
System Detects Stack
    ↓
Generates Dockerfile
    ↓
Builds Image
    ↓
Deploys to EC2
    ↓
Health Checks Pass
    ↓
✅ URL Returned
```

**Total time:** 1-3 minutes ⚡

---

## 🎯 First Deployment (Test It)

```bash
# 1. Create test app
mkdir test-app && cd test-app
npm init -y && npm install express
echo "const express = require('express');
const app = express();
app.get('/', () => res.send('Hello'));
app.listen(3000);" > app.js

# 2. Push to GitHub
git init && git add . && git commit -m "init"
git remote add origin https://github.com/YOUR/test-app.git
git push origin main

# 3. Watch dashboard
# Open: http://localhost:5173/dashboard

# 4. Access deployment
# URL in dashboard → http://YOUR_EC2_IP:3000
```

---

## 🔒 Environment Variables (Key Ones)

```env
# AWS EC2 (Set these!)
AWS_EC2_HOST=13.201.45.22
AWS_EC2_USER=ubuntu
AWS_EC2_KEY_PATH=/path/to/key.pem

# Deployment Mode
WEBHOOK_DEPLOYMENT_MODE=fully-automated

# GitHub
GITHUB_TOKEN=ghp_xxxxx
```

---

## 🆘 Troubleshooting (Quick Fix)

| Issue | Fix |
|-------|-----|
| "Port 5000 in use" | `taskkill /PID xxx /F` then restart |
| "SSH connection fails" | Check key permissions: `chmod 600 key.pem` |
| "Deployment stuck" | Check: `docker logs container-name` |
| "Webhook not received" | Verify GitHub "Recent Deliveries" |
| "Can't connect to MongoDB" | Check .env has valid MONGODB_URI |

---

## 📚 Documentation (Quick Links)

- **New to this?** → [MASTER_SUMMARY.md](./MASTER_SUMMARY.md)
- **Step-by-step?** → [DEPLOYMENT_READINESS_CHECKLIST.md](./DEPLOYMENT_READINESS_CHECKLIST.md)
- **All commands?** → [SCRIPTS_REFERENCE.md](./SCRIPTS_REFERENCE.md)
- **Quick start?** → [FULLY_AUTOMATED_QUICK_START.md](./FULLY_AUTOMATED_QUICK_START.md)
- **Full reference?** → [FULLY_AUTOMATED_DEPLOYMENT.md](./FULLY_AUTOMATED_DEPLOYMENT.md)

---

## 💡 Pro Tips

✅ Run `verify-setup.js` before troubleshooting  
✅ Use setup-wizard.js first time (very helpful)  
✅ Monitor dashboard during first deployment  
✅ Check EC2 logs if deployment fails  
✅ Use ngrok for local testing  

---

## 🎉 You're Set!

Everything is ready. Just:

```bash
cd backend
node setup-wizard.js
```

Then push code and watch magic happen! ✨

---

**Questions?** Check [MASTER_SUMMARY.md](./MASTER_SUMMARY.md)  
**Issues?** Run `node verify-setup.js` to diagnose  
**Ready?** Push code to GitHub!

🚀 **Happy automating!**
