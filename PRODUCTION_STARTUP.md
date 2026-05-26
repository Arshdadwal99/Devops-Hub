# Production Startup Configuration

## Complete Production Setup Checklist

### Step 1: EC2 Instance Preparation

```bash
# SSH into EC2 instance
ssh -i /path/to/key.pem ec2-user@your-ec2-ip

# Install Docker
sudo yum update -y
sudo yum install docker -y
sudo systemctl start docker
sudo systemctl enable docker

# Add ec2-user to docker group (optional, for passwordless docker)
sudo usermod -aG docker ec2-user
```

### Step 2: Clone and Verify Repository

```bash
# Clone repository
git clone <your-repo> /opt/devops-hub
cd /opt/devops-hub

# Verify key files exist
test -f Dockerfile && echo "✓ Dockerfile found"
test -f Jenkinsfile && echo "✓ Jenkinsfile found"
test -f backend/src/server.js && echo "✓ Backend server found"
test -f frontend/dist/index.html && echo "✓ Frontend built"
```

### Step 3: Set Environment Variables

Create production `.env.production`:

```bash
cat > .env.production << 'EOF'
# Server (must be 5000)
PORT=5000
NODE_ENV=production

# Database (MongoDB Atlas - leave empty for local MongoDB)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/devops-hub

# Authentication
JWT_SECRET=$(openssl rand -base64 32)

# Jenkins
JENKINS_URL=http://52.204.26.62:8080
JENKINS_USERNAME=arsh
JENKINS_TOKEN=<your-jenkins-token>
JENKINS_JOB_NAME=devops-hub-deploy

# CORS
CLIENT_ORIGIN=http://your-ec2-ip:5000,https://your-domain.com

# Optional: Docker
DOCKER_HOST=unix:///var/run/docker.sock

# Optional: GitHub
GITHUB_WEBHOOK_SECRET=<your-secret>
GITHUB_TOKEN=<your-token>
EOF

# Load variables
export $(cat .env.production | xargs)
```

### Step 4: Build Docker Image

```bash
# Build production image
docker build -t devops-hub:production .

# Verify image
docker images | grep devops-hub
```

### Step 5: Run Container

**Option A: Using Environment File**

```bash
docker run -d \
  --name devops-hub \
  --restart unless-stopped \
  -p 5000:5000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --env-file .env.production \
  devops-hub:production

# Check it's running
docker ps | grep devops-hub
```

**Option B: Using Environment Variables (Explicit)**

```bash
docker run -d \
  --name devops-hub \
  --restart unless-stopped \
  -p 5000:5000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e NODE_ENV=production \
  -e PORT=5000 \
  -e MONGO_URI="mongodb+srv://user:pass@cluster..." \
  -e JENKINS_TOKEN="your-token" \
  -e CLIENT_ORIGIN="http://localhost:5000" \
  devops-hub:production

# Check it's running
docker ps | grep devops-hub
```

### Step 6: Verify Deployment

```bash
# Check container is running
docker ps | grep devops-hub

# Check logs
docker logs -f devops-hub

# Test health endpoint
curl http://localhost:5000/api/health

# Test frontend
curl http://localhost:5000/ | head -20

# Test API
curl http://localhost:5000/api/test

# From local machine (replace IP)
curl http://your-ec2-ip:5000/api/health
```

### Step 7: Security Group Configuration (AWS)

Ensure your EC2 security group allows:
- **Port 5000**: Inbound from anywhere (or restrict to admin IPs)
- **Port 22**: SSH (usually already configured)

```bash
# AWS CLI example
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp \
  --port 5000 \
  --cidr 0.0.0.0/0
```

### Step 8: Monitor Server

```bash
# Watch logs in real-time
docker logs -f devops-hub

# Check container stats
docker stats devops-hub

# Check disk space
df -h

# Check memory
free -h
```

### Step 9: Set Up Auto-Recovery (Optional)

```bash
# Create systemd service to restart Docker if it crashes
sudo tee /etc/systemd/system/docker-devops-hub.service > /dev/null <<EOF
[Unit]
Description=DevOps Hub Docker Container
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/docker run -d \
  --name devops-hub \
  --restart unless-stopped \
  -p 5000:5000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  --env-file /opt/devops-hub/.env.production \
  devops-hub:production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable docker-devops-hub
```

### Step 10: Set Up Log Rotation (Optional)

```bash
# Create log rotation config
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF

# Restart Docker
sudo systemctl restart docker
```

## Jenkins Integration

### Jenkins Pipeline Configuration

The Jenkinsfile automatically:
1. Pulls the latest code from GitHub
2. Installs dependencies
3. Builds frontend React app
4. Builds Docker image
5. Runs container on EC2 with `-p 5000:5000`

### Manual Trigger (if needed)

```bash
# From your local machine
curl -X POST \
  http://jenkins-url:8080/job/devops-hub-deploy/buildWithParameters \
  -H "Authorization: Bearer YOUR_JENKINS_TOKEN"
```

## Production Deployment Flow

```
GitHub Commit
    ↓
GitHub Webhook → Jenkins
    ↓
Jenkins Pipeline:
  1. Checkout code
  2. Install dependencies
  3. Build frontend (React)
  4. Docker build -t devops-hub:latest .
  5. Docker run -p 5000:5000 ...
    ↓
EC2 Instance:
  Container running on port 5000
  ✓ Frontend served
  ✓ API running
  ✓ WebSocket ready
  ✓ Services available
    ↓
Access: http://ec2-ip:5000
```

## Troubleshooting Production Issues

### Issue: Container exits immediately

```bash
# Check logs
docker logs devops-hub | tail -20

# Common causes:
# - Port 5000 in use: sudo lsof -i :5000
# - Permission issues: check docker socket permissions
# - Memory issues: docker stats devops-hub

# Solution: Stop conflicting process
sudo kill -9 <pid>
docker rm devops-hub  # Remove container
docker run ... # Re-run
```

### Issue: Port already in use

```bash
# Find process on port 5000
sudo lsof -i :5000

# Kill it (if safe)
sudo kill -9 <pid>

# Or change port in docker run
docker run -p 5001:5000 ...  # Map 5001 to 5000 inside container
```

### Issue: Cannot connect from browser

```bash
# Check EC2 security group
aws ec2 describe-security-groups --group-ids sg-xxxxxxxx

# Check if container is listening
docker exec devops-hub curl localhost:5000/api/health

# Check from EC2 itself
curl http://localhost:5000/api/health

# Check firewall
sudo iptables -L | grep 5000
```

### Issue: MongoDB connection failures (OK in production)

```bash
# Check if MongoDB is needed
# (Server runs fine without it, returns empty data)

# If you want MongoDB:
# 1. Set MONGO_URI to MongoDB Atlas
# 2. Restart container
# 3. Check logs: docker logs devops-hub | grep MongoDB

# Verify it reconnects:
docker logs devops-hub | grep "✅ [DB]"
```

### Issue: Slow API responses

```bash
# Check server logs
docker logs devops-hub | grep "slow"

# Check Docker stats
docker stats devops-hub

# Check network to MongoDB
docker exec devops-hub ping -c 3 <mongodb-host>

# Increase Docker memory
docker stop devops-hub
docker run -d --memory 1g ... # Add memory limit
```

## Performance Optimization

### Database Connection Pooling
- Already configured: maxPoolSize=10, minPoolSize=2
- Connection timeout: 30s
- Socket timeout: 45s

### Node.js Optimization
- Use `NODE_ENV=production` (already set)
- Production mode disables debug logging

### Docker Optimization
- Alpine base image: ~100MB vs ~900MB
- Multi-stage builds: (if needed)
- Resource limits: `--memory 1g --cpus 1`

## Monitoring Production

### Health Check
```bash
# Run every 60 seconds
while true; do
  curl -s http://localhost:5000/api/health | jq .
  sleep 60
done
```

### Real-time Logs
```bash
docker logs -f devops-hub

# Or follow specific patterns
docker logs -f devops-hub | grep "ERROR\|✅\|⚠️"
```

### Uptime Monitoring (via AWS CloudWatch)
```bash
# Container health status available in CloudWatch Logs
# Set up alarms for container restart
```

## Rollback Procedure

```bash
# Stop current container
docker stop devops-hub
docker rm devops-hub

# Keep tagged versions
docker tag devops-hub:production devops-hub:v1.0.0
docker tag devops-hub:production devops-hub:stable

# Restore previous version
docker run -d \
  --name devops-hub \
  --restart unless-stopped \
  -p 5000:5000 \
  --env-file .env.production \
  devops-hub:v1.0.0
```

## Production Readiness Checklist

- [ ] Docker image builds successfully
- [ ] Server starts without errors
- [ ] Port 5000 is accessible
- [ ] Frontend loads in browser
- [ ] API endpoints respond
- [ ] Health check passes
- [ ] Container auto-restarts on failure
- [ ] Logs are readable and clean
- [ ] Environment variables are secure
- [ ] MongoDB connection (if used) is stable
- [ ] Docker socket mounted (if Docker monitoring needed)
- [ ] Security groups allow port 5000
- [ ] CORS configured for your domain
- [ ] SSL/TLS certificates ready (if using HTTPS)
- [ ] Monitoring and alerting configured

## Quick Reference

```bash
# Start
docker run -d -p 5000:5000 --env-file .env.production devops-hub:production

# Logs
docker logs -f devops-hub

# Status
docker ps | grep devops-hub

# Stop
docker stop devops-hub

# Restart
docker restart devops-hub

# Shell
docker exec -it devops-hub /bin/sh

# Health
curl http://localhost:5000/api/health
```

---

**Last Updated:** 2026-05-27  
**Version:** Production Ready  
**Status:** All systems operational on port 5000
