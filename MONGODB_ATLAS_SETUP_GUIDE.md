# MongoDB Atlas Production Deployment Guide

## ✅ All Changes Complete

### Fixed Issues
- ✅ MongoDB buffering timeout errors
- ✅ metrics.insertOne() failing
- ✅ alerts.findOne() failing
- ✅ Backend cannot connect in Docker
- ✅ Proper connection pooling and heartbeat
- ✅ Graceful error handling
- ✅ Detailed logging for troubleshooting

---

## Quick Start: EC2 + Docker Deployment

### 1. Set Up MongoDB Atlas

**Create a Free MongoDB Atlas Cluster:**

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up / Log in
3. Create a new project
4. Create a cluster (M0 free tier is fine for testing)
5. Create a database user:
   - Click "Database Access" → "Add New Database User"
   - Username: `admin`
   - Password: (auto-generate or create strong one)
   - Built-in Role: `Atlas admin`
   - Add User
6. Whitelist IP addresses:
   - Click "Network Access" → "Add IP Address"
   - For EC2: Add your EC2's IP address
   - For Docker: Add your network CIDR or 0.0.0.0/0 (development only)
7. Get connection string:
   - Click "Clusters" → "Connect" button
   - Select "Drivers"
   - Copy the connection string
   - Replace `<password>` with your database user password

**Example MongoDB Atlas URI:**
```
mongodb+srv://admin:YourPasswordHere@myapp-cluster-abcde.mongodb.net/devops-dashboard?retryWrites=true&w=majority
```

### 2. Set Environment Variables on EC2

**Create .env file:**
```bash
# On EC2 instance
cat > /path/to/app/.env << 'EOF'
# MongoDB Atlas
MONGO_URI=mongodb+srv://admin:YourPassword@cluster.mongodb.net/devops-dashboard?retryWrites=true&w=majority

# Server
PORT=5000
NODE_ENV=production

# CORS - Update with your EC2 IP
CLIENT_ORIGIN=http://EC2-IP:5000

# JWT Secret - Change in production!
JWT_SECRET=your-production-secret-key-min-32-chars

# Other configs
JENKINS_URL=http://jenkins-server:8080
DOCKER_HOST=unix:///var/run/docker.sock
EOF

# Set permissions
chmod 600 .env
```

### 3. Docker Build with MongoDB Support

**Build the Docker image:**
```bash
docker build -t devops-dashboard:latest .
```

**Dockerfile now includes:**
- ✅ Frontend build step
- ✅ Proper production configuration
- ✅ Health check endpoint
- ✅ Optimized layer caching

### 4. Run Container with MongoDB Connection

**Start the container:**
```bash
docker run -d \
  --name devops-dashboard \
  -p 5000:5000 \
  -e MONGO_URI="mongodb+srv://admin:password@cluster.mongodb.net/devops-dashboard?retryWrites=true&w=majority" \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e CLIENT_ORIGIN="http://EC2-IP:5000" \
  devops-dashboard:latest
```

**Check logs:**
```bash
docker logs -f devops-dashboard
```

**Expected output:**
```
🚀 [Server] Starting backend server...
📍 [Server] Environment: production
🔄 [Server] Attempting MongoDB connection...
✅ [DB] MongoDB connected successfully!
✅ Backend listening on port 5000
📍 API Base: http://localhost:5000/api
🔌 Socket.io: ws://localhost:5000
✅ [Server] All systems ready!
```

### 5. Verify the Connection

**Test health endpoint:**
```bash
curl http://localhost:5000/api/health
```

**Expected response:**
```json
{
  "ok": true,
  "message": "Server is running",
  "dbConnected": true
}
```

**Access the frontend:**
```
http://EC2-IP:5000
```

---

## Key Changes Made

### 1. Enhanced Database Connection (db.js)

**Improvements:**
- ✅ Timeouts optimized for MongoDB Atlas (30-45 seconds vs 3 seconds)
- ✅ Connection pooling: 2-10 connections
- ✅ Heartbeat configuration (30 seconds)
- ✅ Buffer control to prevent "buffering timed out" errors
- ✅ Exponential backoff for reconnection attempts
- ✅ Detailed logging for each connection state
- ✅ Better error messages for common issues

**Connection Options:**
```javascript
{
  serverSelectionTimeoutMS: 30000,   // 30 sec (was 3 sec)
  socketTimeoutMS: 45000,             // 45 sec (was 3 sec)
  connectTimeoutMS: 30000,            // 30 sec (was 3 sec)
  maxPoolSize: 10,
  minPoolSize: 2,
  heartbeatFrequencyMS: 30000,
  bufferCommands: false,              // Fail fast if disconnected
  bufferMaxEntries: 0,                // Prevent memory leak
}
```

### 2. Improved Metrics Service (metricsService.js)

**Enhancements:**
- ✅ Better error handling for database write failures
- ✅ Distinguishes between different error types
- ✅ Continues operation if metrics save fails
- ✅ Detailed logging for buffer timeout issues

**Error Handling:**
```javascript
try {
  const saved = await Metrics.create({...});
  console.log(`💾 [Metrics] Saved to database`);
} catch (err) {
  if (err.message.includes("buffering timed out")) {
    console.warn("⚠️ [Metrics] Database buffer timeout");
  } else if (err.message.includes("connect")) {
    console.warn("⚠️ [Metrics] Database not connected");
  }
  // Still return metrics even if save fails
}
```

### 3. Enhanced Alert Service (alertService.js)

**Improvements:**
- ✅ Checks database connection before operations
- ✅ Still emits alerts via Socket.io even if DB is down
- ✅ Detailed error messages for connection issues
- ✅ Graceful degradation

**Alert Creation with DB Check:**
```javascript
if (!isDbConnected()) {
  console.warn("⚠️ Database not connected - alert will not be persisted");
  emitNewAlert(...); // Still send via Socket.io
  return { success: true, persisted: false };
}
```

### 4. Better Server Startup (server.js)

**Enhancements:**
- ✅ Detailed startup logging
- ✅ Better database connection error messages
- ✅ Graceful shutdown handlers
- ✅ Uncaught exception handlers
- ✅ Connection status display

**Startup Flow:**
```
🚀 Starting server...
🔄 Attempting MongoDB connection...
✅ MongoDB connected (or ⚠️ Connection failed)
✅ Backend listening on port 5000
✅ All systems ready!
```

### 5. Configuration Enhancement (config.js)

**Added:**
- ✅ MongoDB URI validation
- ✅ Helpful error messages if MONGO_URI not set
- ✅ Retry configuration options
- ✅ Additional localhost origin for consistency

---

## Environment Variables Reference

### Required for Production

```bash
# MongoDB Atlas connection string (REQUIRED)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname?retryWrites=true&w=majority

# Server configuration
PORT=5000
NODE_ENV=production

# CORS for frontend
CLIENT_ORIGIN=http://EC2-IP:5000

# JWT secret (change in production!)
JWT_SECRET=your-strong-secret-key
```

### Optional

```bash
# Firebase
FIREBASE_ADMIN_KEY=
FIREBASE_PROJECT_ID=

# Jenkins
JENKINS_URL=http://jenkins:8080
JENKINS_USER=admin
JENKINS_TOKEN=

# Docker
DOCKER_HOST=unix:///var/run/docker.sock

# GitHub
GITHUB_WEBHOOK_SECRET=
GITHUB_TOKEN=

# AWS
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# OpenAI
OPENAI_API_KEY=

# Alert thresholds
ALERT_CPU_HIGH=85
ALERT_MEMORY_HIGH=85
ALERT_DISK_HIGH=90
```

---

## Troubleshooting

### Problem: "MONGO_URI not set"

**Solution:**
```bash
export MONGO_URI="mongodb+srv://admin:password@cluster.mongodb.net/dbname"
# or add to .env file
```

### Problem: "authentication failed"

**Verify:**
1. Username and password in connection string
2. Username exists in MongoDB Atlas
3. Whitelist your IP address in Network Access

**Fix:**
```bash
# In MongoDB Atlas:
# 1. Go to Database Access
# 2. Delete and recreate user with correct password
# 3. Copy new connection string
```

### Problem: "buffering timed out"

**Causes:**
- Network connectivity issue
- MongoDB Atlas cluster overloaded
- Connection pooling exhausted

**Solutions:**
```bash
# 1. Check network connectivity
ping cluster.mongodb.net

# 2. Whitelist Docker container IP
# In MongoDB Atlas → Network Access → Add your Docker network

# 3. Increase timeouts if needed (edit db.js)
serverSelectionTimeoutMS: 60000,  // 60 seconds
socketTimeoutMS: 60000,

# 4. Restart the container
docker restart devops-dashboard
```

### Problem: "Cannot connect from Docker container"

**Causes:**
- Container network isolated from MongoDB Atlas
- IP address not whitelisted
- MongoDB Atlas cluster not running

**Solutions:**
```bash
# 1. Test from inside container
docker exec devops-dashboard curl http://localhost:5000/api/health

# 2. Check MongoDB Atlas IP whitelist
# Must include Docker container's IP range

# 3. For development, add 0.0.0.0/0 (NOT recommended for production)

# 4. Verify cluster status in MongoDB Atlas console
```

### Problem: "connection timed out"

**Likely causes:**
- Network firewall blocking
- MongoDB Atlas cluster not accessible
- EC2 security group blocking

**Solutions:**
```bash
# 1. Test DNS resolution
nslookup cluster.mongodb.net

# 2. Check EC2 security group
# Allow outbound traffic to port 27017

# 3. Test with nc (netcat)
nc -zv cluster.mongodb.net 27017

# 4. Check MongoDB Atlas status
# Dashboard → Clusters → Verify cluster running
```

---

## Monitoring MongoDB Connection

### View Connection Logs

```bash
# Live logs
docker logs -f devops-dashboard | grep -i "db\|mongo"

# Connection events
docker logs devops-dashboard | grep "✅\|❌\|⚠️"
```

### Health Check Endpoint

```bash
# Should return dbConnected: true
curl http://localhost:5000/api/health | jq '.dbConnected'

# Response when connected:
{
  "ok": true,
  "message": "Server is running",
  "dbConnected": true
}
```

### Metrics and Alerts

**Once connected, verify these work:**

```bash
# Fetch metrics
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/metrics

# Fetch alerts  
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/alerts
```

---

## Production Deployment Checklist

- [ ] MongoDB Atlas cluster created
- [ ] Database user created with strong password
- [ ] IP whitelist includes EC2 security group
- [ ] Connection string copied correctly
- [ ] .env file created with MONGO_URI
- [ ] Docker image built successfully
- [ ] Container starts without errors
- [ ] Health endpoint returns dbConnected: true
- [ ] Frontend loads at http://EC2-IP:5000
- [ ] API endpoints responding
- [ ] Metrics being collected
- [ ] Alerts triggering correctly
- [ ] Socket.io real-time updates working

---

## Performance Tips

1. **Use AWS EC2 instance in same region as MongoDB Atlas cluster**
   - Reduces latency and improves reliability

2. **Enable connection pooling (already configured)**
   - Min: 2, Max: 10 connections
   - Automatically managed by driver

3. **Monitor metrics collection**
   - Currently every 10 seconds
   - Adjust interval in server.js if needed

4. **Database indexing**
   - Ensure userId indexed on metrics and alerts collections
   - Improves query performance

5. **Database backups**
   - MongoDB Atlas handles automatic backups
   - Configure in cluster settings

---

## All 10 Requirements ✅

1. ✅ Add proper MongoDB connection handling
2. ✅ Ensure app exits gracefully if MongoDB fails
3. ✅ Use MONGO_URI environment variable
4. ✅ Load environment variables using dotenv
5. ✅ Add detailed MongoDB connection logs
6. ✅ Ensure mongoose connects correctly in Docker
7. ✅ Add retry mechanism with exponential backoff
8. ✅ Prevent buffering timeout errors
9. ✅ Ensure metrics and alerts work correctly
10. ✅ Keep existing backend APIs unchanged

---

## Testing in Development

### Local Testing with MongoDB Atlas

```bash
# 1. Create .env file
cat > .env << 'EOF'
MONGO_URI=mongodb+srv://admin:password@cluster.mongodb.net/devops-dashboard
NODE_ENV=development
PORT=5000
EOF

# 2. Install dependencies
npm install

# 3. Start backend
npm run dev:backend

# 4. In another terminal, start frontend
npm run dev:frontend

# 5. Test connection
curl http://localhost:5000/api/health
```

### Docker Testing

```bash
# 1. Build image
docker build -t devops-test:latest .

# 2. Run with MongoDB
docker run -d \
  -p 5000:5000 \
  -e MONGO_URI="mongodb+srv://admin:password@cluster.mongodb.net/devops-dashboard" \
  -e NODE_ENV=production \
  devops-test:latest

# 3. Check connection
curl http://localhost:5000/api/health

# 4. View logs
docker logs devops-test
```

---

## Support

**Common Issues:**
- Check [.env.example](.env.example) for all configuration options
- Review logs: `docker logs devops-dashboard`
- Verify MongoDB Atlas status: https://cloud.mongodb.com/
- Check network connectivity: `ping cluster.mongodb.net`

**Documentation:**
- Mongoose: https://mongoosejs.com/
- MongoDB Atlas: https://docs.atlas.mongodb.com/
- Docker: https://docs.docker.com/

✅ **Ready for production deployment!**
