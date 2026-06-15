# AWS Infrastructure Provisioning - Quick Start Guide

## 5-Minute Setup

### Step 1: Prepare AWS Account (2 min)

1. **Login to AWS Console**
   - Go to https://console.aws.amazon.com
   - Sign in with your credentials

2. **Create IAM User**
   - Navigate to IAM → Users → Create user
   - Enter username: `devops-hub`
   - Click "Create user"

3. **Attach Permissions**
   - Click the user you just created
   - Click "Add permissions" → "Attach policies directly"
   - Search and select: `AmazonEC2FullAccess`
   - Click "Attach policies"

4. **Create Access Keys**
   - Go to "Security credentials" tab
   - Click "Create access key"
   - Select "Application running outside AWS"
   - Click "Next"
   - Download CSV with credentials
   - Save securely!

### Step 2: Connect to DevOps Hub (2 min)

1. **Open DevOps Hub Dashboard**
   - Go to http://localhost:5173
   - Log in to your account

2. **Navigate to Integrations**
   - Click "Integrations" in the sidebar
   - Find "AWS" section
   - Click "Connect"

3. **Enter AWS Credentials**
   - **Connection Name:** "My AWS Account"
   - **AWS Region:** "us-east-1" (or your preferred region)
   - **Access Key ID:** Paste from CSV
   - **Secret Access Key:** Paste from CSV
   - Click "Connect to AWS"

4. **Verify Connection**
   - You should see "✅ Connected to AWS account" message
   - Account ID displayed
   - Status shows "Connected"

### Step 3: Provision Infrastructure (1 min)

1. **Click "Manage Infrastructure"**
   - Shows your connection details

2. **Click "Create Infrastructure"**
   - This opens the provisioning wizard

3. **Configure Instance**
   - **Instance Name:** "my-devops-app"
   - **Region:** "us-east-1"
   - **Instance Type:** "t3.micro" (cheapest)
   - **OS:** "Ubuntu 22.04 LTS"
   - **Storage:** "30" GB
   - Click "Create Infrastructure"

4. **Wait for Provisioning**
   - Progress bar shows creation steps
   - 2-3 minutes total time
   - Bootstrap installs Docker, Git, Curl automatically

5. **View Infrastructure**
   - See "Infrastructure Ready ✅" message
   - Copy the **Public IP** address
   - Instance ID, Region, Type displayed

## What Gets Created

### Security Group
- Auto-created with open ports:
  - 22 (SSH) - for administration
  - 80 (HTTP) - for web traffic
  - 443 (HTTPS) - for encrypted traffic
  - 3000 (App) - for DevOps Hub app
  - 5000 (API) - for backend API
  - 8080 (Jenkins) - for CI/CD

### EC2 Instance
- Runs Docker and Docker Compose
- Has Git pre-installed
- Ready for application deployment
- Monitoring enabled with CloudWatch

### Bootstrap Services
- ✅ Docker - Container runtime
- ✅ Docker Compose - Multi-container orchestration
- ✅ Git - Version control
- ✅ Curl - HTTP client

## Next Steps

### Deploy Your Application

1. **Get Public IP**
   - From infrastructure dashboard
   - Example: `54.XXX.XXX.XXX`

2. **SSH into Instance**
   ```bash
   ssh -i /path/to/key.pem ubuntu@54.XXX.XXX.XXX
   ```

3. **Deploy Docker App**
   ```bash
   # Clone your repo
   git clone https://github.com/your-repo/your-app.git
   cd your-app
   
   # Start with Docker Compose
   docker-compose up -d
   ```

4. **Access Your App**
   - Go to http://54.XXX.XXX.XXX:3000
   - Or http://54.XXX.XXX.XXX:80

### Integrate with GitHub

1. **Create GitHub Webhook**
   - Go to your repository
   - Settings → Webhooks → Add webhook
   - Payload URL: `http://your-domain/api/webhooks/github`
   - Content type: `application/json`
   - Events: Push events
   - Click "Add webhook"

2. **Auto-Deploy on Push**
   - Jenkins pipeline auto-triggers
   - Builds your Docker image
   - Deploys to EC2 instance
   - Health check validates deployment

## Cost Management

### Monthly Estimate
- t3.micro: $7.60
- 30 GB storage: $3.00
- Data transfer: ~$1.00
- **Total: ~$11.60/month**

### Cost Optimization Tips
1. Use t3.micro for development
2. Terminate unused instances
3. Use Spot instances for non-critical workloads
4. Schedule auto-shutdown outside business hours
5. Use S3 for long-term storage instead of EBS

## Troubleshooting

### Can't connect to AWS?
```bash
# Check credentials
echo $AWS_ACCESS_KEY_ID
echo $AWS_SECRET_ACCESS_KEY

# Verify permissions in IAM console
# Ensure user has EC2FullAccess policy
```

### Instance won't start?
1. Check AWS account hasn't hit EC2 limit
2. Verify selected region has availability
3. Check IAM user has permissions in that region

### SSH connection times out?
1. Verify security group allows port 22
2. Wait 60 seconds for instance to fully boot
3. Check your internet allows SSH outbound

### Docker not working?
```bash
# SSH into instance and check
ssh -i key.pem ubuntu@public-ip
docker --version
docker-compose --version
systemctl status docker
```

## Common Commands

### Access Instance
```bash
ssh -i /path/to/key.pem ubuntu@public-ip
```

### Check Bootstrap Status
```bash
# On instance
tail -f /var/log/devops-hub-bootstrap.log
```

### Stop Instance (cheaper)
```bash
# From dashboard: Click instance → Stop
# Or via AWS Console
```

### Terminate Instance (delete)
```bash
# From dashboard: Click instance → Terminate Infrastructure
# Click "Confirm"
# Note: This cannot be undone!
```

## Security Best Practices

1. **Keep AWS Credentials Secret**
   - Never commit to GitHub
   - Never share with others
   - Rotate every 90 days

2. **Use Security Groups**
   - Only open necessary ports
   - Restrict SSH to your IP
   - Use HTTPS/TLS for data in transit

3. **Monitor Your Instances**
   - Check CloudWatch metrics
   - Review instance logs
   - Set up billing alerts

4. **Backup Data**
   - Create snapshots of important volumes
   - Use S3 for persistent data
   - Test restore procedures

## Performance Tips

1. **For Web Apps:** Use t3.small ($15/month)
2. **For CI/CD:** Use t3.medium ($30/month)
3. **For Databases:** Use dedicated database service
4. **For Storage:** Use S3 instead of EBS volumes

## Support

**Documentation:** See AWS_INFRASTRUCTURE_PROVISIONING.md
**Issues:** Create GitHub issue with logs
**Logs:** Check `/var/log/devops-hub-bootstrap.log` on instance

---

**Ready to deploy?** Start at Integrations → AWS → Connect
