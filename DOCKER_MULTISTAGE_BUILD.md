# Multi-Stage Docker Build Guide - DevOps Hub

## Overview

The DevOps Hub now uses a **multi-stage Docker build** to optimize the production image:

- **Builder Stage**: Installs all dependencies (including dev tools) and builds the frontend with Vite
- **Production Stage**: Contains only production dependencies and the built frontend

This approach:
- ✅ Keeps final image small (~250MB)
- ✅ Builds frontend with all required tools (Vite)
- ✅ Excludes dev dependencies from production
- ✅ Maintains fast builds with Docker layer caching

---

## Build Process

### Stage 1: Builder
```
1. Start with node:20-alpine
2. Copy ALL package files (including dev dependencies)
3. Run: npm ci (install all dependencies)
4. Copy entire project source
5. Run: npm run build:frontend (Vite builds to frontend/dist)
6. Verify frontend/dist/index.html exists
7. [Builder stage is discarded in final image]
```

### Stage 2: Production
```
1. Start with fresh node:20-alpine
2. Copy package*.json files
3. Run: npm ci --omit=dev (only production dependencies)
4. Copy frontend/dist FROM builder stage
5. Copy backend/ source code
6. Create non-root user
7. Set health check
8. Start with: npm start (Express server)
```

---

## Building the Image

### Basic Build
```bash
# Build image with default tag
docker build -t devops-hub:latest .

# Show build progress
docker build --progress=plain -t devops-hub:latest .

# Build with custom tag
docker build -t devops-hub:v1.0.0 .
```

### Build with BuildKit (Faster, Better Output)
```bash
# Enable Docker BuildKit for better caching
export DOCKER_BUILDKIT=1

# Build with BuildKit
docker build --progress=plain -t devops-hub:latest .

# BuildKit provides:
# - Faster builds
# - Better layer caching
# - Cleaner output
```

### Verify Build Success

```bash
# Check image size
docker images devops-hub

# Inspect image
docker inspect devops-hub:latest

# View layers
docker history devops-hub:latest

# Expected:
# - Stage 1 (builder): ~1GB (includes Vite, dev tools)
# - Stage 2 (production): ~250-350MB
```

---

## Running the Container

### Quick Start
```bash
docker run -d \
  -p 5000:5000 \
  -e NODE_ENV=production \
  devops-hub:latest
```

### Full Production Run
```bash
docker run -d \
  --name devops-hub \
  --restart unless-stopped \
  -p 5000:5000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e MONGO_URI="mongodb+srv://user:pass@cluster..." \
  -e CLIENT_ORIGIN="http://localhost:5000" \
  -e JENKINS_URL="http://jenkins:8080" \
  -e JENKINS_TOKEN="your-token" \
  devops-hub:latest
```

### Run with docker-compose
```bash
docker compose up -d
```

---

## Testing the Build

### Verify Frontend Served
```bash
# Test that frontend loads
curl http://localhost:5000/

# Should return HTML with <head>, <body>, etc
# If error: check that frontend/dist/index.html was copied

# View response headers
curl -I http://localhost:5000/

# Expected:
# HTTP/1.1 200 OK
# Content-Type: text/html; charset=UTF-8
```

### Verify API Working
```bash
# Test health endpoint
curl http://localhost:5000/api/health

# Expected response:
# {"ok":true,"message":"Server is running","dbConnected":false|true}

# Test API
curl -X POST http://localhost:5000/api/test \
  -H "Content-Type: application/json" \
  -d '{"test":"data"}'

# Expected response:
# {"ok":true,"message":"Backend is responding","body":{"test":"data"}}
```

### Check Container Health
```bash
# View health status
docker ps

# Expected STATUS: "Up X seconds (healthy)"

# Check health manually
docker exec <container-id> curl http://localhost:5000/api/health

# View logs
docker logs -f <container-id>
```

---

## Docker Build Layers and Caching

### Layer Caching Strategy

Each `RUN`, `COPY`, and `ADD` instruction creates a new layer. Docker caches layers for faster rebuilds:

```dockerfile
# Layer 1: Base image (node:20-alpine)
FROM node:20-alpine AS builder

# Layer 2: Copy package files (rarely changes)
COPY package*.json ./

# Layer 3: Install dependencies (changes when package.json changes)
RUN npm ci

# Layer 4: Copy source code (changes frequently)
COPY . .

# Layer 5: Build frontend (runs when source changes)
RUN npm run build:frontend
```

**Benefit**: If only source code changes, Docker skips layers 1-3 and reuses cached dependencies

### Force Rebuild Cache
```bash
# Rebuild without using cache (clears all layers)
docker build --no-cache -t devops-hub:latest .

# This is slower but ensures fresh build
```

---

## Image Size Optimization

### Analyze Image Layers
```bash
# See size of each layer
docker history devops-hub:latest

# Example output:
# IMAGE               CREATED        CREATED BY                    SIZE
# abc123              5 minutes ago   CMD ["npm", "start"]          0B
# def456              5 minutes ago   EXPOSE 5000                   0B
# ghi789              5 minutes ago   COPY backend/                 5MB
# jkl012              5 minutes ago   COPY --from=builder...        15MB
# [... more layers ...]
```

### Reduce Image Size

**Current approach (Multi-stage):**
- Builder stage: discarded (~1GB)
- Production stage: only what's needed (~250-350MB)

**Additional optimizations (if needed):**
- Remove node_modules (already done with `npm ci --omit=dev`)
- Use `npm ci --omit=dev --omit=optional`
- Use `node:20-slim` instead of alpine (if size acceptable)
- Remove backend source after production use

---

## Jenkins Integration

The Jenkinsfile automatically works with this multi-stage build:

```groovy
stage('Docker Build') {
  sh '''
    docker build -f Dockerfile -t ${IMAGE_TAG} .
  '''
}

stage('Deploy') {
  sh '''
    docker run -d -p 5000:5000 \
      -e NODE_ENV=production \
      ${IMAGE_TAG}
  '''
}
```

**No changes needed** - Jenkinsfile is fully compatible with multi-stage Dockerfile

---

## EC2 Deployment

### On EC2 Instance

```bash
# Clone repository
git clone <repo> /opt/devops-hub
cd /opt/devops-hub

# Build image
docker build -t devops-hub:latest .

# Run container
docker run -d \
  --name devops-hub \
  --restart unless-stopped \
  -p 5000:5000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e NODE_ENV=production \
  devops-hub:latest

# Verify
curl http://localhost:5000/api/health

# View logs
docker logs -f devops-hub
```

---

## Troubleshooting

### Build Fails: "Vite not found"

**Problem**: Vite is not installed during build

**Solution**: Multi-stage Dockerfile solves this by installing all deps in builder stage

```dockerfile
# This MUST come after: RUN npm ci
# Do NOT use: RUN npm ci --omit=dev (this skips Vite)
```

### Build Fails: "frontend/dist/index.html not found"

**Problem**: Frontend build failed during builder stage

**Solutions**:
```bash
# Check build output for errors
docker build --progress=plain -t devops-hub:latest . | grep -i error

# Build frontend locally to verify
npm run build:frontend

# Check frontend/dist exists locally
ls -la frontend/dist/index.html
```

### Container exits immediately

**Problem**: npm start fails

**Solutions**:
```bash
# Check logs
docker logs <container-id>

# Verify backend exists
docker exec <container-id> ls -la backend/src/

# Test npm start manually
npm start  # Run locally to check for errors
```

### Frontend not serving (404)

**Problem**: Express not serving frontend

**Solutions**:
```bash
# Check frontend/dist copied to container
docker exec <container-id> ls -la frontend/dist/

# Check Express static file configuration
docker exec <container-id> cat backend/src/server.js | grep -A5 "express.static"

# Test endpoint directly
docker exec <container-id> curl localhost:5000/
```

---

## Performance Tuning

### Build Speed Optimization

**Current optimizations:**
- Alpine base image (smaller, faster to pull)
- Multi-stage (builder discarded)
- Layer caching (dependencies cached separately)
- .dockerignore (only needed files sent to Docker)

**Additional options:**
```bash
# Use Docker BuildKit for faster builds
export DOCKER_BUILDKIT=1
docker build -t devops-hub:latest .

# Parallel builds (if available)
docker build --build-arg BUILDKIT_INLINE_CACHE=1 -t devops-hub:latest .

# Check build time
time docker build -t devops-hub:latest .
```

### Runtime Performance

**Current optimizations:**
- NODE_ENV=production (no debug logging)
- NODE_OPTIONS memory limit (512MB)
- Health checks (auto-restart on failure)
- Production dependencies only

---

## Best Practices Applied

✅ **Multi-stage build**: Separates build from runtime

✅ **Alpine base**: Lightweight (~150MB vs ~900MB)

✅ **Layer caching**: Dependencies cached, rebuilt only when package.json changes

✅ **Production dependencies only**: npm ci --omit=dev

✅ **Non-root user**: Improved security

✅ **Health checks**: Auto-restart on failure

✅ **Clear EXPOSE**: Only port 5000 exposed

✅ **Proper WORKDIR**: /app for production

✅ **.dockerignore**: Optimized build context

✅ **Docker Compose compatible**: Works with docker-compose up

✅ **Jenkins compatible**: Works with Jenkinsfile unchanged

✅ **EC2 ready**: Tested on Docker with socket mount

---

## Commands Reference

```bash
# Build
docker build -t devops-hub:latest .

# Run
docker run -d -p 5000:5000 devops-hub:latest

# Compose
docker compose up -d

# Test
curl http://localhost:5000/api/health

# Logs
docker logs -f devops-hub

# Shell
docker exec -it devops-hub /bin/sh

# Stop
docker stop devops-hub

# Remove
docker rm devops-hub
```

---

## Summary

The multi-stage Docker build provides:

| Feature | Benefit |
|---------|---------|
| Builder stage with all deps | Vite builds frontend successfully |
| Production stage with prod deps only | Minimal final image (~250MB) |
| Layer caching | Faster rebuilds |
| .dockerignore | Smaller build context |
| Health checks | Auto-restart on failure |
| Alpine base | Lightweight runtime |
| Non-root user | Improved security |

**Result:** Fast builds, small images, reliable production deployment
