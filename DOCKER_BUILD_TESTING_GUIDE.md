# Docker Build & Testing - Step-by-Step Guide

## Part 1: Prepare Your Environment

### Step 1: Verify Docker is installed
```bash
docker --version
docker-compose --version

# Expected output:
# Docker version 20.10+ (any recent version works)
# docker-compose version 2.0+
```

### Step 2: Verify project structure
```bash
ls -la
# Should see: Dockerfile, package.json, backend/, frontend/

ls -la backend/src/server.js
# Should exist

ls -la frontend/src/
# Should have React app files
```

### Step 3: Verify npm scripts
```bash
cat package.json | grep -A2 '"scripts"'

# Should include:
# "build:frontend": "cd frontend && npm run build",
# "start": "node backend/src/server.js",
```

---

## Part 2: Build the Docker Image

### Step 4: Build with standard Docker
```bash
# Build image (takes 2-3 minutes on first build)
docker build -t devops-hub:latest .

# Expected output should show two stages:
# [Stage 1: Builder] - Installing dependencies...
# [Stage 1: Builder] - Building frontend...
# [Stage 2: Production] - Installing production dependencies...
# [Stage 2: Production] - Copying built frontend...
```

**If you see errors, troubleshoot:**

#### Error: "vite: command not found"
```
❌ ERROR: npm run build:frontend failed
```
**Solution:** Check builder stage is running `npm ci` (not `npm ci --omit=dev`)
```bash
grep -A2 "FROM node:20-alpine AS builder" Dockerfile
# Should show: RUN npm ci (without --omit=dev)
```

#### Error: "frontend/dist/index.html not found"
```
❌ ERROR: Frontend build failed
```
**Solution:** 
1. Build frontend locally to verify it works:
   ```bash
   cd frontend && npm install && npm run build && cd ..
   ls -la frontend/dist/index.html
   ```
2. Check Vite config is correct:
   ```bash
   cat frontend/vite.config.js | grep -i "outDir\|build"
   # Should show: outDir: '../dist' or similar
   ```

#### Error: Docker layer cache issues
```bash
# Force rebuild without cache
docker build --no-cache -t devops-hub:latest .
```

---

### Step 5: Enable Docker BuildKit for faster builds (optional)
```bash
# First time only:
export DOCKER_BUILDKIT=1

# Build with BuildKit
docker build --progress=plain -t devops-hub:latest .

# Expected: Cleaner output, faster builds, better caching
```

### Step 6: Verify image was created
```bash
docker images devops-hub

# Expected output:
# REPOSITORY       TAG       IMAGE ID         CREATED        SIZE
# devops-hub       latest    abc123def456    2 minutes ago   287MB
```

**Check the size:**
- ✅ 250-350MB = Good (optimized)
- ⚠️ 700MB+ = Problem (includes dev dependencies)
- ⚠️ <200MB = Problem (frontend might be missing)

---

## Part 3: Run the Container

### Step 7: Stop any existing containers
```bash
# Stop if running
docker stop devops-hub 2>/dev/null || true

# Remove if exists
docker rm devops-hub 2>/dev/null || true

# Verify it's gone
docker ps -a | grep devops-hub
# Should show nothing
```

### Step 8: Run the container
```bash
# Simple run command
docker run -d \
  --name devops-hub \
  -p 5000:5000 \
  devops-hub:latest

# Expected output:
# abc123def456789...  (container ID)
```

### Step 9: Check container is running
```bash
docker ps

# Expected output:
# CONTAINER ID  IMAGE              PORTS              STATUS
# abc123def456  devops-hub:latest  0.0.0.0:5000→5000/tcp  Up 2 seconds (healthy)
```

**Status meanings:**
- ✅ "Up X seconds (healthy)" = Perfect
- ✅ "Up X seconds" = Running (health check not configured or still checking)
- ❌ "Exited" = Container crashed, check logs
- ❌ "Restarting" = Health check failing, too many crashes

### Step 10: Check container health
```bash
# If status shows "health: starting", wait 30 seconds
# If status shows "health: healthy", all good
# If status shows "health: unhealthy", check logs

docker inspect devops-hub --format='{{.State.Health.Status}}'
# Expected: healthy
```

---

## Part 4: Test the Container

### Step 11: Test frontend (HTTP GET /)
```bash
# Get frontend HTML
curl http://localhost:5000/

# Expected output should start with:
# <!DOCTYPE html>
# <html lang="en">
# ...
# <title>DevOps Hub</title>
# ...

# Or save to file to inspect
curl http://localhost:5000/ > frontend.html
head -20 frontend.html
```

**What this proves:**
- ✅ Frontend was built (frontend/dist exists)
- ✅ Frontend was copied into image
- ✅ Express is serving static files
- ✅ Port 5000 is accessible
- ✅ Container is running

### Step 12: Test API endpoint (HTTP GET /api/health)
```bash
# Test health endpoint
curl http://localhost:5000/api/health

# Expected output (JSON):
# {"ok":true,"message":"Server is running","dbConnected":false}

# Or pretty-printed:
curl http://localhost:5000/api/health | jq .

# Expected:
# {
#   "ok": true,
#   "message": "Server is running",
#   "dbConnected": false
# }
```

**What this proves:**
- ✅ Express API is running
- ✅ Backend is functional
- ✅ REST endpoints work
- ✅ Response timing is good

### Step 13: Test API test endpoint (HTTP POST /api/test)
```bash
# Send test request
curl -X POST http://localhost:5000/api/test \
  -H "Content-Type: application/json" \
  -d '{"test":"hello world"}'

# Expected output:
# {"ok":true,"message":"Backend is responding","body":{"test":"hello world"}}
```

**What this proves:**
- ✅ POST requests work
- ✅ JSON parsing works
- ✅ Request body is processed

### Step 14: Test WebSocket (optional)
```bash
# Install websocat if not already installed
# macOS: brew install websocat
# Linux: apt install websocat
# Windows: download from GitHub

# Connect to WebSocket
websocat ws://localhost:5000

# Try sending a message (if app expects it)
# Type something and press Enter

# Expected:
# Should connect without error
# May receive initial messages from server
# Connection persists until you disconnect
```

---

## Part 5: Check Logs

### Step 15: View container logs
```bash
# View logs (last 100 lines)
docker logs --tail 100 devops-hub

# Expected output:
# ✅ Backend listening on port 5000
# ✅ Frontend: Serving static files from /app/frontend/dist
# (May see database connection info depending on env)

# Follow logs in real-time
docker logs -f devops-hub
# Press Ctrl+C to stop

# View specific time range
docker logs --since 5m devops-hub  # Last 5 minutes
```

**What to look for:**
- ✅ "Backend listening on port 5000" = Server started
- ✅ "Serving static files from" = Frontend path correct
- ❌ "ENOENT" = File not found (frontend/dist missing)
- ❌ "EADDRINUSE" = Port 5000 already in use
- ❌ "Cannot find module" = Missing dependency

### Step 16: Check for errors
```bash
# Check for any errors in logs
docker logs devops-hub | grep -i "error\|failed\|warn"

# Expected: No critical errors

# Check specific error patterns
docker logs devops-hub | grep -i "enoent\|eaddrinuse\|cannot find"
# Expected: Should show nothing
```

---

## Part 6: Advanced Testing

### Step 17: Inspect running container
```bash
# Get detailed container info
docker inspect devops-hub

# Get specific fields
docker inspect devops-hub --format='{{json .Config.Env}}' | jq .
# Shows environment variables

docker inspect devops-hub --format='{{.State.Running}}'
# Shows if running: true

docker inspect devops-hub --format='{{.State.Health.Status}}'
# Shows health: healthy
```

### Step 18: Shell into container (debug)
```bash
# Open interactive shell
docker exec -it devops-hub /bin/sh

# Inside container, you can:
# Test locally from inside container
curl http://localhost:5000/api/health

# Check file system
ls -la backend/src/
ls -la frontend/dist/

# Check environment
env | grep NODE_ENV

# Exit shell
exit
```

### Step 19: Check image layers
```bash
# See size of each layer
docker history devops-hub:latest

# Expected output shows:
# - Base image: node:20-alpine (~150MB)
# - npm dependencies
# - frontend/dist (~10MB)
# - backend source

# Calculate total size
docker inspect devops-hub:latest --format='{{.Size}}' | awk '{printf "%.2f MB\n", $1/1024/1024}'
# Expected: ~250-350MB
```

---

## Part 7: Performance Testing

### Step 20: Measure response time
```bash
# Test endpoint response time
time curl http://localhost:5000/api/health

# Expected:
# real    0m0.050s
# user    0m0.012s
# sys     0m0.008s

# Using curl's built-in timing
curl -w "@curl-format.txt" http://localhost:5000/api/health
# (Or just measure manually with time command)
```

### Step 21: Load test (optional)
```bash
# Simple loop to test multiple requests
for i in {1..10}; do
  echo "Request $i: $(curl -s -w 'HTTP %{http_code} - %{time_total}s\n' http://localhost:5000/api/health)"
done

# Expected: All return HTTP 200, consistent timing
```

### Step 22: Memory usage
```bash
# Check container memory usage
docker stats devops-hub --no-stream

# Expected output:
# CONTAINER       MEM USAGE / LIMIT
# devops-hub      150MiB / 1GiB
```

---

## Part 8: Clean Up

### Step 23: Stop container
```bash
# Stop the running container
docker stop devops-hub

# Verify it's stopped
docker ps | grep devops-hub
# Should show nothing
```

### Step 24: Remove container (optional)
```bash
# Remove container
docker rm devops-hub

# Verify it's gone
docker ps -a | grep devops-hub
# Should show nothing
```

### Step 25: Clean up images (optional)
```bash
# Remove image
docker rmi devops-hub:latest

# Or remove all devops-hub images
docker rmi $(docker images devops-hub -q)

# Verify
docker images | grep devops-hub
# Should show nothing
```

---

## Quick Test Script

If you want to automate all these steps:

```bash
# Use the provided helper script
bash docker-build-test.sh run
bash docker-build-test.sh test
bash docker-build-test.sh clean
```

---

## Troubleshooting Matrix

| Issue | Cause | Solution |
|-------|-------|----------|
| "vite: command not found" | Builder stage using --omit=dev | Check Dockerfile has `RUN npm ci` (not --omit=dev) |
| "frontend/dist not found" | Frontend build failed | Run `npm run build:frontend` locally to verify |
| Port 5000 in use | Another app using port | `lsof -i :5000` and kill process or use different port |
| Container exits | npm start fails | `docker logs devops-hub` to see error |
| Frontend returns 404 | Express not serving static | Verify `frontend/dist/index.html` exists in container |
| Slow response | Database connection hangs | Check MONGO_URI env var or use mock data |
| Health check failing | API not responding | Verify Express listening on port 5000 |
| Image too large (>500MB) | Dev dependencies included | Check production stage uses `npm ci --omit=dev` |

---

## Success Criteria

After completing all steps, you should see:

✅ **Build:** Docker build completes without errors  
✅ **Container:** Docker container runs and stays running  
✅ **Frontend:** `curl http://localhost:5000` returns HTML  
✅ **API:** `curl http://localhost:5000/api/health` returns JSON  
✅ **Health:** Health check shows "healthy"  
✅ **Logs:** No error messages in docker logs  
✅ **Size:** Image is ~250-350MB  

**If all checkmarks, you're ready for production!** 🚀

---

## Summary

This step-by-step guide verifies:
1. ✅ Docker environment is ready
2. ✅ Project structure is correct
3. ✅ Docker build succeeds (both stages)
4. ✅ Image is created with correct size
5. ✅ Container starts and stays running
6. ✅ Frontend loads correctly
7. ✅ API endpoints respond
8. ✅ Health checks work
9. ✅ No errors in logs
10. ✅ Performance is acceptable

**Next Steps:**
- Deploy to EC2 (follow PRODUCTION_STARTUP.md)
- Use with Jenkins (Jenkinsfile unchanged)
- Monitor with docker-compose (docker-compose up -d)
