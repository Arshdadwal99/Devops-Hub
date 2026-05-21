# AWS EC2 Setup Guide for Automated Deployments

**Version:** 1.0.0  
**Date:** May 21, 2026

## 📋 Prerequisites

- AWS Account
- EC2 instance running (Ubuntu 20.04+ or similar)
- Public IP address for the instance
- SSH access configured

---

## 🚀 Quick EC2 Setup (10 Minutes)

### Step 1: Launch EC2 Instance (if not already done)

1. Go to AWS Console → EC2 → Launch Instance
2. Select **Ubuntu Server 20.04 LTS** (or latest)
3. Instance type: **t3.medium** (minimum for production)
4. Add storage: **20GB+**
5. Add security groups:
   - Port 22 (SSH) - Your IP
   - Port 80 (HTTP) - Anywhere
   - Port 443 (HTTPS) - Anywhere
   - Port 3000+ (App ports) - Anywhere

### Step 2: Configure Instance

```bash
# SSH into instance
ssh -i your-key.pem ubuntu@<PUBLIC_IP>

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add ubuntu user to docker group
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Nginx
sudo apt install -y nginx

# Start Nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Verify installations
docker --version
docker-compose --version
nginx -v
```

### Step 3: Create Deployment Directory

```bash
# Create app directory
mkdir -p ~/devops-app
cd ~/devops-app

# Create docker-compose.yml template
cat > docker-compose.yml << 'EOF'
version: '3.9'

services:
  app:
    image: myapp:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production

networks:
  default:
    driver: bridge
EOF
```

### Step 4: Configure Nginx as Reverse Proxy

```bash
# Create Nginx config
sudo tee /etc/nginx/sites-available/default << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Test and reload Nginx
sudo nginx -t
sudo systemctl reload nginx
```

### Step 5: Test Docker Deployment

```bash
# Test Docker
docker run -d --name test-nginx -p 3000:80 nginx:alpine

# Check if running
docker ps

# Test from local machine
curl http://<PUBLIC_IP>:3000

# Clean up
docker stop test-nginx
docker rm test-nginx
```

---

## 🔐 Configure SSH Key for DevOps Hub

### Step 1: Create SSH Key Pair (if not already done)

```bash
# On your local machine
ssh-keygen -t rsa -b 4096 -f ~/.ssh/devops-hub-key -N ""

# Copy public key to EC2
ssh-copy-id -i ~/.ssh/devops-hub-key.pub -p 22 ubuntu@<PUBLIC_IP>

# Test connection
ssh -i ~/.ssh/devops-hub-key ubuntu@<PUBLIC_IP> "echo 'SSH working!'"
```

### Step 2: Update DevOps Hub Environment

```bash
# In backend/.env
AWS_EC2_HOST=<YOUR_EC2_PUBLIC_IP>
AWS_EC2_USER=ubuntu
AWS_EC2_KEY_PATH=/home/user/.ssh/devops-hub-key
AWS_EC2_PORT=22
```

### Step 3: Test Connection

```bash
# From DevOps Hub backend
npm start

# Then in another terminal
curl -X POST http://localhost:5000/api/automation/ec2-config \
  -H "Authorization: Bearer YOUR_TOKEN"

# Should return:
# {
#   "success": true,
#   "config": {
#     "host": "configured",
#     "keyPath": "configured",
#     "user": "ubuntu",
#     "region": "us-east-1"
#   },
#   "ready": true
# }
```

---

## 📦 Install Additional Tools (Optional)

### Docker Registry (Optional)

```bash
# For private image storage
docker run -d --name registry \
  -p 5000:5000 \
  -v /data/registry:/var/lib/registry \
  registry:2
```

### Jenkins (Optional)

```bash
# If using Jenkins pipeline
docker run -d --name jenkins \
  -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  jenkins/jenkins:lts
```

### MongoDB (For MERN projects)

```bash
# Standalone MongoDB for testing
docker run -d --name mongodb \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=admin \
  -e MONGO_INITDB_ROOT_PASSWORD=password \
  mongo:latest
```

---

## 🔧 Advanced Configuration

### Enable HTTPS with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot certonly --nginx -d your-domain.com

# Update Nginx config
sudo tee /etc/nginx/sites-available/default << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2 default_server;
    listen [::]:443 ssl http2 default_server;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

sudo nginx -t
sudo systemctl reload nginx
```

### Setup Auto-renewal

```bash
# Add to crontab
sudo crontab -e

# Add line:
0 12 * * * /usr/bin/certbot renew --quiet
```

### Enable Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### Setup Monitoring

```bash
# Install CloudWatch agent (for AWS monitoring)
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i -E ./amazon-cloudwatch-agent.deb

# Configure and start
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 \
  -s -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
```

---

## 📊 Verify Setup

### Check All Services Running

```bash
# Docker daemon
docker ps

# Nginx
sudo systemctl status nginx

# Check open ports
sudo netstat -tlnp

# Expected output:
# tcp  0  0 0.0.0.0:22    0.0.0.0:*  LISTEN
# tcp  0  0 0.0.0.0:80    0.0.0.0:*  LISTEN
# tcp  0  0 0.0.0.0:443   0.0.0.0:*  LISTEN
```

### Test Deployment

```bash
# Deploy a test image
docker pull hello-world
docker run hello-world

# Deploy test web server
docker run -d -p 3001:80 --name test nginx:alpine

# Test from local machine
curl http://<PUBLIC_IP>:3001

# Cleanup
docker stop test
docker rm test
```

---

## 🚨 Troubleshooting

### SSH Connection Fails

```bash
# Check SSH service
sudo systemctl status ssh

# Check security group
# AWS Console → EC2 → Security Groups
# Ensure port 22 is open to your IP

# Test SSH manually
ssh -v -i devops-hub-key ubuntu@<PUBLIC_IP>
```

### Docker Commands Fail

```bash
# Check Docker daemon
sudo systemctl status docker

# Restart Docker
sudo systemctl restart docker

# Check user permissions
sudo usermod -aG docker ubuntu
# Then logout and login
```

### Port 80/443 Already in Use

```bash
# Check what's using the port
sudo lsof -i :80
sudo lsof -i :443

# Kill process if needed
sudo kill <PID>

# Or change port in Nginx config
```

### Nginx Not Proxying

```bash
# Check Nginx config
sudo nginx -t

# Check logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log

# Reload configuration
sudo systemctl reload nginx
```

---

## 📋 Pre-deployment Checklist

- [ ] EC2 instance launched
- [ ] Security groups configured (80, 443, 22, app ports)
- [ ] Docker installed
- [ ] Docker Compose installed
- [ ] Nginx installed and running
- [ ] SSH key pair created
- [ ] SSH public key added to EC2
- [ ] SSH connection tested
- [ ] ~/devops-app directory created
- [ ] Docker daemon tested
- [ ] Nginx reverse proxy configured
- [ ] Test deployment successful
- [ ] DevOps Hub environment variables configured
- [ ] EC2 config endpoint returns "ready": true

---

## 🎯 Next Steps

1. Configure DevOps Hub webhook deployment mode to `fully-automated`
2. Add GitHub webhook to your repository
3. Push code to GitHub
4. Monitor deployment in DevOps Hub dashboard
5. Deployment URL will be displayed after success

---

## 📝 Example Deployment

```
GitHub Push
    ↓
DevOps Hub receives webhook
    ↓
Detects tech stack (Node.js + React)
    ↓
Generates Dockerfile, docker-compose.yml, Jenkinsfile
    ↓
Builds Docker image: myapp:main-1234567890
    ↓
SSH to EC2: ubuntu@13.201.45.22
    ↓
docker compose up -d
    ↓
Health check passes
    ↓
Nginx configured
    ↓
✅ http://13.201.45.22:80 (or your domain)
```
