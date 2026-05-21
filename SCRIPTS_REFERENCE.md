# 🛠️ DevOps Hub - Scripts & Tools Reference

**Quick access to all automation scripts created**

---

## 📋 Available Scripts

### 1. **Setup Wizard** - Interactive Configuration
**Location:** `backend/setup-wizard.js`  
**Purpose:** Guided setup for AWS EC2 deployment  
**What it does:**
- Prompts for EC2 host IP
- Asks for EC2 username
- Configures SSH key path
- Updates GitHub token if needed
- Saves all settings to .env

**Run:**
```bash
cd backend
node setup-wizard.js
```

**Expected Output:**
```
✅ EC2 host updated
✅ EC2 user set to: ubuntu
✅ SSH key path updated
✅ GitHub token updated
✨ Setup Complete!
```

---

### 2. **Verification Script** - System Health Check
**Location:** `backend/verify-setup.js`  
**Purpose:** Check if all components are properly configured  
**What it checks:**
- Backend files exist (7 services, routes, etc.)
- Dependencies installed
- Environment variables configured
- Server integration complete
- Webhook integration ready
- AWS EC2 configuration
- SSH key accessibility

**Run:**
```bash
cd backend
node verify-setup.js
```

**Expected Output:**
```
✅ Passed: 28
❌ Failed: 0 (or just missing EC2 config)
⚠️  Warnings: 0
```

---

### 3. **Startup Script** - One-Command Launch
**Location:** `backend/start-all.js`  
**Purpose:** Start both backend and frontend services  
**What it does:**
- Starts backend on port 5000
- Starts frontend on port 5173
- Monitors both services
- Shows access points
- Handles graceful shutdown (Ctrl+C)

**Run:**
```bash
node backend/start-all.js
```

**Expected Output:**
```
✅ DevOps Hub is Starting!
📊 Access Points:
   - Backend API: http://localhost:5000
   - Frontend: http://localhost:5173
   - Dashboard: http://localhost:5173/dashboard
```

---

## 🚀 Setup Workflow

### Complete Setup (First Time)

```bash
# Step 1: Navigate to backend
cd backend

# Step 2: Run setup wizard (interactive)
node setup-wizard.js

# Step 3: Verify everything is configured
node verify-setup.js

# Step 4: Start services
npm start
# OR: node start-all.js (for both backend + frontend)
```

---

## 📊 Testing & Verification

### Verify Setup is Complete
```bash
cd backend
node verify-setup.js

# Should see mostly ✅
# If failed: refer to recommendations in output
```

### Test Backend Connection
```bash
# Backend running?
curl http://localhost:5000/health
# Expected: {"status":"ok"}

# EC2 configured?
curl -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:5000/api/automation/ec2-config
```

### Test Frontend Connection
```bash
# Frontend running?
# Open: http://localhost:5173
# Should see DevOps Hub dashboard
```

### Test Webhook Integration
```bash
# Check if routes are registered
curl http://localhost:5000/api/webhooks/github
# Should return 405 (method not allowed) or 200, not 404
```

---

## 🔧 Development Commands

### Backend Development
```bash
# Navigate to backend
cd backend

# Install dependencies
npm install

# Run in development (with auto-reload)
npm run dev

# Run in production
npm start

# Verify setup
node verify-setup.js

# Interactive setup
node setup-wizard.js
```

### Frontend Development
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Both Services
```bash
# From backend directory
node start-all.js

# Press Ctrl+C to stop both services
```

---

## 📈 Monitoring & Debugging

### View Backend Logs
```bash
# If running: npm start
# Logs appear in terminal

# Real-time:
tail -f backend.log
```

### View Frontend Logs
```bash
# Open browser console: F12 or Ctrl+Shift+I
# Look for any red errors

# Or check terminal where npm run dev is running
```

### Check Service Status
```bash
# Is backend running?
netstat -ano | findstr :5000

# Is frontend running?
netstat -ano | findstr :5173

# Is MongoDB connected?
curl http://localhost:5000/health
```

### Clear & Reset
```bash
# Clear npm cache
npm cache clean --force

# Reinstall node_modules
rm -r node_modules package-lock.json
npm install

# Reset environment
cp .env.example .env
# Then update with your values
```

---

## 🐳 Docker & Deployment Commands

### Build Docker Image
```bash
# Build image for current project
docker build -t devops-hub .

# Build with tag
docker build -t devops-hub:latest .
```

### View Docker Containers
```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# View logs
docker logs container-name

# Follow logs in real-time
docker logs -f container-name

# View container stats
docker stats container-name
```

### SSH to EC2
```bash
# Connect to EC2
ssh -i "path/to/key.pem" ubuntu@YOUR_EC2_IP

# Once connected, view deployments
docker ps
docker logs container-name
```

---

## 🎯 Common Workflows

### Workflow 1: First-Time Setup
```bash
# 1. Configure EC2
cd backend
node setup-wizard.js

# 2. Verify configuration
node verify-setup.js

# 3. Start services
npm start

# 4. Dashboard ready
# Open: http://localhost:5173/dashboard

# 5. Add GitHub webhook
# Go to: github.com/YOUR_REPO/settings/webhooks
# Payload URL: https://your-domain/api/webhooks/github
```

### Workflow 2: Test Deployment
```bash
# 1. Create test repo with code
# 2. Push to GitHub
# 3. Monitor dashboard: http://localhost:5173
# 4. Access deployment URL when ready
```

### Workflow 3: Troubleshoot Deployment
```bash
# 1. Check dashboard logs
# 2. SSH to EC2
ssh -i key.pem ubuntu@EC2_IP

# 3. Check Docker
docker ps
docker logs container-name

# 4. Check Nginx
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log

# 5. Check logs on backend
npm start  # and check output
```

---

## 📝 Environment Setup

### Generate .env Template
```bash
# Backend
cd backend
# Create .env with required variables
# See backend/.env.example for reference

# Frontend  
cd frontend
# Create .env with API URL
VITE_API_URL=http://localhost:5000
```

### Update Configuration
```bash
# Edit backend .env
nano backend/.env
# OR
code backend/.env

# Then restart:
npm start
```

---

## ✅ Pre-Deployment Checklist

Before going live, verify:

- [ ] Backend .env has AWS_EC2_HOST, AWS_EC2_USER, AWS_EC2_KEY_PATH
- [ ] `node verify-setup.js` passes
- [ ] `npm start` runs without errors
- [ ] Dashboard accessible at localhost:5173
- [ ] EC2 instance created and Docker installed
- [ ] SSH key has correct permissions
- [ ] GitHub webhook added to test repo
- [ ] Test deployment completes successfully

---

## 🆘 Troubleshooting Reference

### Port Already in Use
```bash
# Find process on port 5000
netstat -ano | findstr :5000

# Kill it
taskkill /PID <process_id> /F

# Then start again
npm start
```

### Dependency Issues
```bash
# Clear and reinstall
npm cache clean --force
rm -r node_modules package-lock.json
npm install
```

### Webhook Not Receiving
```bash
# Check GitHub deliveries
# Go to: github.com/REPO/settings/webhooks
# Click on webhook
# Check "Recent Deliveries" tab

# Verify server is running
curl http://localhost:5000/health

# For local testing, use ngrok
ngrok http 5000
# Use ngrok URL in webhook
```

### SSH Connection Fails
```bash
# Test SSH connection (verbose)
ssh -i key.pem -v ubuntu@EC2_IP

# Check key permissions
ls -la key.pem
# Should show: -rw------- (only read for owner)

# Fix permissions
chmod 600 key.pem
```

---

## 📚 Script Summary Table

| Script | Purpose | Time | Command |
|--------|---------|------|---------|
| setup-wizard.js | Interactive config | 5 min | `node setup-wizard.js` |
| verify-setup.js | Health check | 1 min | `node verify-setup.js` |
| start-all.js | Launch services | - | `node start-all.js` |

---

## 💡 Pro Tips

1. **Use setup-wizard.js first** - It guides you through everything
2. **Run verify-setup.js before deploying** - Catches configuration errors early
3. **Keep SSH key secure** - Never commit to git, use proper permissions
4. **Use ngrok for local testing** - Test webhooks before deploying to production
5. **Monitor logs during first deployment** - Helps identify issues early

---

## 🎉 You're Ready!

All scripts are in place. Next step:

```bash
cd backend
node setup-wizard.js
```

This will configure everything you need for automated deployment! 🚀
