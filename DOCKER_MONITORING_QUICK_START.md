# Docker Monitoring - Quick Start (2 Minutes)

## The Problem
Your app is running in a Docker container but can't access Docker commands.
```
❌ docker: not found
❌ Error fetching containers
❌ Container monitoring disabled
```

## The Solution
Mount the host Docker socket into your container.

---

## Step 1: Build Image
```bash
docker build -t devops-dashboard:latest .
```

## Step 2: Run with Docker Socket
```bash
docker run -d \
  --name devops-dashboard \
  -p 5000:5000 \
  --env-file .env \
  -v /var/run/docker.sock:/var/run/docker.sock \
  devops-dashboard:latest
```

**The key line:** `-v /var/run/docker.sock:/var/run/docker.sock`

## Step 3: Verify
```bash
# Check Docker status
docker logs devops-dashboard | grep -i docker

# You should see:
# ✅ [Docker] Docker daemon is ready

# Test API
curl http://localhost:5000/api/docker/info
```

---

## Docker Compose
Add to your `docker-compose.yml`:
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

---

## Expected Output

✅ Good (Docker Available):
```
🔍 [Docker] Checking Docker daemon availability...
✅ [Docker] Docker daemon is ready
📦 [Docker] Fetching containers...
✅ [Docker] Found 3 containers
```

✅ Also OK (Docker Not Available):
```
❌ [Docker] Daemon unavailable: docker: not found
⚠️  [Docker] Docker daemon is not available
→ App still works, just no container monitoring
```

---

## Dashboard
- **With socket:** See running containers, CPU, memory, stats
- **Without socket:** App works fine, container monitoring shows "unavailable"

---

## Jenkins Pipeline Example
```groovy
stage('Deploy') {
  steps {
    sh '''
      docker run -d \
        -p 5000:5000 \
        -v /var/run/docker.sock:/var/run/docker.sock \
        --env-file .env \
        devops-dashboard:latest
    '''
  }
}
```

---

## Done! 🎉
Your Docker monitoring is now working inside the container.

For more details, see: [DOCKER_MONITORING_SETUP.md](DOCKER_MONITORING_SETUP.md)
