# Production Deployment Guide - DevOps Hub

## Quick Start (Single Command)

```bash
# Build and run in Docker on port 5000
docker build -t devops-hub .
docker run -d --restart unless-stopped -p 5000:5000 -v /var/run/docker.sock:/var/run/docker.sock devops-hub

# Test
curl http://localhost:5000/api/health
curl http://localhost:5000/  # Frontend
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Client Browser                                     │
│  http://localhost:5000 (or production domain)      │
└──────────────────────┬──────────────────────────────┘
                       │
                       │ HTTP/WebSocket
                       ▼
┌─────────────────────────────────────────────────────┐
│  Express Server (Port 5000)                         │
│  ┌─────────────────────────────────────────────────┐│
│  │ Frontend Static Files (dist/)                   ││
│  │ ✓ index.html, CSS, JS                          ││
│  │ ✓ Served on GET /                              ││
│  └─────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────┐│
│  │ Backend API (0.0.0.0:5000)                      ││
│  │ ✓ /api/* routes                                ││
│  │ ✓ /api/health (heartbeat)                      ││
│  │ ✓ Socket.io for real-time updates              ││
│  └─────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────┐│
│  │ Service Integrations                            ││
│  │ ✓ MongoDB (graceful fallback if unavailable)   ││
│  │ ✓ Docker daemon (graceful fallback if down)    ││
│  │ ✓ Jenkins (graceful fallback with mock data)   ││
│  │ ✓ GitHub webhooks                              ││
│  └─────────────────────────────────────────────────┘│
└──────────────────┬───────────────────────────────────┘
                   │
       ┌───────────┼───────────┬────────────┐
       │           │           │            │
       ▼           ▼           ▼            ▼
    MongoDB     Docker      Jenkins      GitHub
    (Optional)  daemon      API          API
```

## Port Configuration

| Service | Port | Protocol | Notes |
|---------|------|----------|-------|
| Express Server | 5000 | HTTP/WS | Primary - serves both frontend and API |
| MongoDB | 27017 | TCP | Optional - local only or Atlas |
| Docker Socket | (local) | Unix socket | For Docker monitoring |
| Jenkins | 8080 | HTTP | External - configured via JENKINS_URL |

## Environment Variables (Production)

```bash
# Server
PORT=5000                                    # Must be 5000
NODE_ENV=production                          # Critical for performance

# Database
MONGO_URI=mongodb+srv://user:pass@cluster... # MongoDB Atlas in production
                                             # Leave empty for local MongoDB
                                             # Server runs with or without it

# API Keys & Authentication
JWT_SECRET=<long-random-secret>              # Change in production!
GOOGLE_CLIENT_ID=<from-google-console>
GOOGLE_CLIENT_SECRET=<from-google-console>
FIREBASE_ADMIN_KEY=<json-key-path>
FIREBASE_PROJECT_ID=<project-id>

# Jenkins Integration
JENKINS_URL=http://52.204.26.62:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=<jenkins-token>
JENKINS_JOB_NAME=devops-hub-deploy

# CORS
CLIENT_ORIGIN=http://localhost:5000,https://your-domain.com

# Optional: Docker Monitoring
DOCKER_HOST=unix:///var/run/docker.sock

# Optional: GitHub Webhooks
GITHUB_WEBHOOK_SECRET=<github-secret>
GITHUB_TOKEN=<github-token>
```

## Deployment Options

### Option 1: Docker (Recommended for EC2)

```bash
# Build image
docker build -t devops-hub:latest .

# Run container
docker run -d \
  --name devops-hub \
  --restart unless-stopped \
  -p 5000:5000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e MONGO_URI="mongodb+srv://user:pass@cluster..." \
  -e JENKINS_TOKEN="your-token" \
  devops-hub:latest

# Check logs
docker logs -f devops-hub

# Health check
curl http://localhost:5000/api/health
```

### Option 2: Docker Compose

```bash
# Copy .env.production to .env
cp .env.example .env

# Start services
docker compose up -d

# View logs
docker compose logs -f backend
```

### Option 3: Jenkins Pipeline

Jenkins will automatically:
1. Clone repository
2. Build Docker image
3. Push to registry (optional)
4. Deploy with: `docker run -p 5000:5000 ...`

The Jenkinsfile uses `-p ${PORTS}` (defaults to `5000:5000`)

### Option 4: Direct Node.js (Not Recommended for Production)

```bash
# Install dependencies
npm install

# Build frontend
npm run build:frontend

# Start server
NODE_ENV=production npm start

# Server runs on 0.0.0.0:5000
```

## Graceful Service Degradation

The server is designed to **stay alive** even if optional services fail:

### MongoDB Unavailable
- ✅ Server continues running
- ✅ Frontend loads normally
- ✅ API endpoints return empty data
- ✅ No error messages shown to users
- ⏳ Reconnects automatically when available

### Docker Daemon Unavailable  
- ✅ Server continues running
- ✅ Frontend loads normally
- ✅ Docker monitoring disabled
- ✅ Returns empty container list
- ⏳ Reconnects automatically when available

### Jenkins Unavailable
- ✅ Server continues running
- ✅ Frontend loads normally
- ✅ Build data cached or mocked
- ✅ Returns simulated build data
- ⏳ Reconnects automatically when available

## Production Deployment Checklist

### Pre-Deployment
- [ ] Environment variables configured (.env file or Docker env)
- [ ] MongoDB connection string tested (or accept local fallback)
- [ ] Jenkins credentials verified
- [ ] Docker socket mounted (`-v /var/run/docker.sock:...`)
- [ ] Port 5000 available on host/EC2
- [ ] Security groups allow port 5000 inbound

### Deployment
- [ ] Build Docker image: `docker build -t devops-hub .`
- [ ] Run container with all environment variables
- [ ] Verify server starts without crashes
- [ ] Test health endpoint: `curl http://localhost:5000/api/health`
- [ ] Test frontend loads: `curl http://localhost:5000/`
- [ ] Check Docker logs for errors

### Post-Deployment
- [ ] Frontend loads in browser at `http://localhost:5000`
- [ ] API calls work: `curl http://localhost:5000/api/...`
- [ ] WebSocket connects (check browser console)
- [ ] Build History section shows data (or empty gracefully)
- [ ] Statistics section shows data (or empty gracefully)
- [ ] Docker containers visible (if available)
- [ ] Monitor logs: `docker logs -f <container-id>`

### Production Optimization
- [ ] Enable log aggregation (ELK, CloudWatch, etc.)
- [ ] Set up monitoring/alerting on `/api/health`
- [ ] Configure auto-restart policy: `--restart unless-stopped`
- [ ] Use health checks in orchestration layer
- [ ] Enable HTTPS/SSL on production domain
- [ ] Rotate JWT_SECRET and API keys regularly
- [ ] Monitor database connections
- [ ] Enable Docker resource limits

## Monitoring

### Health Endpoint
```bash
curl http://localhost:5000/api/health
# Returns: { "ok": true, "message": "Server is running", "dbConnected": boolean }
```

### Docker Health Check
```bash
# Built into Dockerfile and docker-compose.yml
# Checks health endpoint every 30 seconds
# Auto-restart after 3 failures
```

### Logs
```bash
# Docker logs
docker logs -f devops-hub

# Look for these patterns:
# ✅ = Success
# ❌ = Errors (non-fatal, server continues)
# ⚠️ = Warnings (service degraded but available)
```

## Troubleshooting

### Container exits immediately
```bash
# Check logs
docker logs devops-hub

# Common causes:
# - Port 5000 in use: sudo lsof -i :5000
# - Missing environment variables: check .env
# - Invalid MONGO_URI: server starts without DB anyway
```

### Frontend doesn't load
```bash
# Check if frontend dist exists
docker exec devops-hub ls -la /app/frontend/dist/

# Rebuild if needed
docker build --no-cache -t devops-hub .
```

### API calls timeout (10s)
```bash
# Ensure DB connection check runs first
# Check service logs: docker logs devops-hub | grep "MongoDB"

# If MongoDB unavailable, should return empty data quickly
# If still slow, check network/firewall to MongoDB
```

### Cannot reach container from EC2
```bash
# Verify port exposed: docker port devops-hub
# Check security group allows 5000 inbound
# Test from EC2: curl http://localhost:5000/api/health
```

## Security Considerations

1. **Secrets Management**
   - Use AWS Secrets Manager or similar
   - Never commit .env with real secrets
   - Rotate JWT_SECRET regularly

2. **CORS Configuration**
   - Set CLIENT_ORIGIN to your domain only
   - Never use `*` in production

3. **Database Security**
   - Use MongoDB Atlas with IP whitelist
   - Enable authentication in connection string
   - Use VPC endpoint if on AWS

4. **Docker Socket**
   - Only mount if Docker monitoring needed
   - Consider using TCP with mTLS for remote Docker
   - Restrict container capabilities if possible

5. **Firewall Rules**
   - Only expose port 5000 to authorized users
   - Use VPN or bastion host for admin access
   - Monitor unauthorized connection attempts

## Rollback Procedure

```bash
# Keep previous image
docker tag devops-hub:latest devops-hub:production-backup

# Stop current container
docker stop devops-hub
docker rm devops-hub

# Restore previous version (if available)
docker run -d \
  --name devops-hub \
  --restart unless-stopped \
  -p 5000:5000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  devops-hub:production-backup
```

## Performance Tuning

### Node.js
```bash
# Set memory limits
NODE_MEMORY_MB=512  # Or higher for large workloads

# Use production flag in Docker
ENV NODE_ENV=production
```

### Database
- Connection pool size: 10 (configured in db.js)
- Query timeout: 45 seconds
- Heartbeat: 30 seconds

### Docker Build
- Alpine base image (small size)
- Multi-stage builds (if needed)
- Cache layers for dependencies

## Support

For issues:
1. Check Docker logs: `docker logs -f devops-hub`
2. Health endpoint: `curl http://localhost:5000/api/health`
3. Test API: `curl http://localhost:5000/api/test`
4. Browser console for frontend errors
