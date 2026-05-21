# 🚀 Backend Quick Start - 5 Minutes to Production

## Step 1: Install Dependencies (1 min)
```bash
cd backend
npm install
```

## Step 2: Create Environment File (1 min)
```bash
cp .env.example .env
```

## Step 3: Add Minimal Configuration (2 min)

Edit `.env` and add at minimum:

```env
# ✅ REQUIRED - MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/devops-dashboard?retryWrites=true&w=majority

# ✅ REQUIRED - Firebase (get from Firebase Console > Project Settings > Service Accounts)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_ADMIN_KEY={"type":"service_account","project_id":"...","private_key":"..."}

# ⚙️ OPTIONAL - Jenkins (for CI/CD integration)
JENKINS_URL=http://localhost:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=your-jenkins-api-token
JENKINS_JOB_NAME=devops-hub-deploy

# ⚙️ OPTIONAL - GitHub (for webhook auto-trigger)
GITHUB_WEBHOOK_SECRET=your-webhook-secret
GITHUB_TOKEN=ghp_your-personal-access-token

# Frontend
CLIENT_ORIGIN=http://localhost:5173
```

## Step 4: Start Backend (1 min)
```bash
npm run dev
```

Expected output:
```
✅ Backend listening on port 5000
📍 API Base: http://localhost:5000/api
🔌 Socket.io: ws://localhost:5000
✅ Firebase Admin SDK initialized
✅ MongoDB connected successfully
```

## Step 5: Verify It Works
```bash
curl http://localhost:5000/api/health
```

Should return:
```json
{
  "ok": true,
  "message": "Server is running",
  "dbConnected": true
}
```

---

## ✅ Backend is Running!

### Next: Start Frontend
```bash
cd frontend
npm run dev
```

Then open: http://localhost:5173

---

## 🧪 Quick Tests

### Test Dashboard Data
```bash
curl -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  http://localhost:5000/api/dashboard | jq
```

### Test Deployment
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"version":"1.0.0"}' \
  http://localhost:5000/api/deployments/deploy
```

### Test Metrics
```bash
curl -H "Authorization: Bearer YOUR_FIREBASE_TOKEN" \
  http://localhost:5000/api/metrics | jq
```

---

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| MongoDB connection failed | Check connection string, whitelist IP in Atlas |
| Firebase error | Download new service account key, paste full JSON |
| Port 5000 in use | Change PORT in .env or kill process |
| Module not found | Run `npm install` again |

---

## 📖 Full Documentation

- **[BACKEND_PRODUCTION_GUIDE.md](./BACKEND_PRODUCTION_GUIDE.md)** - Complete setup
- **[BACKEND_API_REFERENCE.md](./BACKEND_API_REFERENCE.md)** - All endpoints
- **[BACKEND_INTEGRATION_CHECKLIST.md](./BACKEND_INTEGRATION_CHECKLIST.md)** - Testing
  -H "Authorization: Bearer YOUR_FIREBASE_TOKEN"
```

## 🐛 Troubleshooting

### Port 5000 already in use
```bash
# Find process using port 5000
lsof -i :5000

# Kill it
kill -9 <PID>

# Or use different port
PORT=5001 npm run dev
```

### MongoDB connection failed
```bash
# Start local MongoDB
mongod

# Or use MongoDB Atlas
# Update MONGODB_URI in .env
```

### Docker commands not working
```bash
# Start Docker daemon
sudo systemctl start docker

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### Firebase auth errors
- Verify `serviceAccountKey.json` exists in backend folder
- Or set `FIREBASE_ADMIN_KEY` environment variable

## ✅ What's Running

- ✅ Express API on port 5000
- ✅ Socket.io for real-time updates
- ✅ MongoDB connection
- ✅ Metrics collection (every 10s)
- ✅ Alert generation
- ✅ Webhook listener ready

## 📚 Next Steps

1. **Read API Docs:** [BACKEND_API.md](./BACKEND_API.md)
2. **Learn Architecture:** [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md)
3. **Production Setup:** [BACKEND_PRODUCTION_SETUP.md](./BACKEND_PRODUCTION_SETUP.md)

## 🎯 Features Enabled

- ✅ Metrics monitoring (CPU, Memory, Disk, Network)
- ✅ Container management (Docker)
- ✅ Pipeline status (Jenkins)
- ✅ Deployment control (Deploy, Restart, Rollback)
- ✅ Alert system (Auto-generated)
- ✅ Real-time updates (Socket.io)
- ✅ Log analysis (Pattern-based)
- ✅ Webhook support (GitHub)

## 🔧 Common Commands

```bash
# Start development
npm run dev

# Start production
npm start

# Seed database
npm run seed

# Run lint
npm run lint

# View logs
docker logs devops-hub-backend

# Check health
curl http://localhost:5000/api/health
```

## 📝 Environment Variables

See `.env.example` for all available variables.

**Minimum Required:**
- `MONGODB_URI` - Database connection
- `JWT_SECRET` - Token signing key
- `JENKINS_URL`, `JENKINS_TOKEN` - CI/CD integration
- `GITHUB_WEBHOOK_SECRET` - Webhook verification

**Optional (with fallbacks):**
- `FIREBASE_ADMIN_KEY` - Uses file by default
- `OPENAI_API_KEY` - Falls back to rule-based analysis

## 🎉 You're Ready!

Backend is now running and ready for integration with the frontend. All real data from Docker, Jenkins, and system metrics is flowing in.

**Next:** Connect from React frontend → Enable real-time dashboard!

---

**Questions?** See [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md) or check logs:
```bash
npm run dev 2>&1 | grep -E "(✅|❌|⚠️)"
```
