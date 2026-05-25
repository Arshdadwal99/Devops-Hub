# MongoDB Atlas Quick Start (5 Minutes)

## Step 1: Create MongoDB Atlas Cluster (2 min)

```bash
# 1. Go to https://www.mongodb.com/cloud/atlas
# 2. Create free M0 cluster
# 3. Create user: admin / strong-password
# 4. Whitelist IP: 0.0.0.0/0 (or your EC2 IP)
# 5. Get connection string (save it!)
```

## Step 2: Create .env File on EC2

```bash
# On your EC2 instance
cat > /path/to/app/.env << 'EOF'
MONGO_URI=mongodb+srv://admin:password@YOUR-CLUSTER.mongodb.net/devops-dashboard?retryWrites=true&w=majority
NODE_ENV=production
PORT=5000
CLIENT_ORIGIN=http://YOUR-EC2-IP:5000
JWT_SECRET=your-secret-key-min-32-chars
EOF

chmod 600 .env
```

## Step 3: Build Docker Image

```bash
cd /path/to/app
docker build -t devops-dashboard:latest .
```

## Step 4: Run Container

```bash
docker run -d \
  --name devops-dashboard \
  -p 5000:5000 \
  --env-file .env \
  devops-dashboard:latest
```

## Step 5: Verify Connection

```bash
# Check logs
docker logs devops-dashboard | head -20

# Test health
curl http://localhost:5000/api/health

# Expected: {"ok":true,"dbConnected":true}
```

---

## ✅ Expected Output

```
🚀 [Server] Starting backend server...
📍 [Server] Environment: production
🔄 [Server] Attempting MongoDB connection...
✅ [DB] MongoDB connected successfully!
✅ [DB] Database: devops-dashboard
✅ Backend listening on port 5000
📍 API Base: http://localhost:5000/api
🔌 Socket.io: ws://localhost:5000
✅ [Server] All systems ready!
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `MONGO_URI not set` | Add to .env file |
| `authentication failed` | Check password in connection string |
| `ENOTFOUND` | Check cluster address and DNS |
| `buffering timed out` | Check network connectivity to MongoDB Atlas |
| `Cannot connect from Docker` | Whitelist Docker IP in MongoDB Atlas |

---

## Verify Each Component

```bash
# 1. Health check
curl http://localhost:5000/api/health
# Should return: {"ok":true,"dbConnected":true}

# 2. Metrics
curl -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/metrics
# Should return: array of metrics

# 3. Frontend
open http://localhost:5000
# Should load React dashboard

# 4. Socket.io
wscat -c ws://localhost:5000
# Should connect
```

---

## Done! 🎉

Your app is now running with MongoDB Atlas on EC2 with Docker!

For detailed setup, see: [MONGODB_ATLAS_SETUP_GUIDE.md](MONGODB_ATLAS_SETUP_GUIDE.md)
