# One-Click Deployment - Quick Start Guide

## Prerequisites

Before using one-click deployment, ensure you have connected:

- ✅ **GitHub** - With OAuth configured
- ✅ **Jenkins** - With valid URL and credentials
- ✅ **Docker Hub** - With authentication token
- ✅ **AWS** - With IAM credentials

## Step-by-Step Guide

### 1. Verify Integrations Are Connected

Go to **Settings → Integrations** and confirm:
- GitHub account is linked
- Jenkins instance is connected
- Docker Hub credentials are configured
- AWS credentials are set

### 2. Navigate to One-Click Deployment

Click **Deploy → One-Click CI/CD** in the dashboard sidebar.

### 3. Enter Repository Details

Fill in the form:
- **Repository Owner**: Your GitHub username (e.g., `john-doe`)
- **Repository Name**: Your repo name (e.g., `my-awesome-app`)
- **Branch**: Git branch (default: `main`)

### 4. Click Deploy

Click the **[ Deploy with CI/CD ]** button.

### 5. Monitor Progress

Watch the real-time progress log as the system:
- ✓ Verifies all connections
- ✓ Analyzes your repository
- ✓ Generates deployment files
- ✓ Provisions EC2 instance
- ✓ Creates Jenkins job
- ✓ Configures webhook
- ✓ Builds Docker image
- ✓ Deploys to EC2
- ✓ Runs health checks
- ✓ Enables auto-deploy

### 6. Deployment Complete

Once completed, you'll see:
- **Deployment ID**: For reference
- **EC2 Instance ID**: Your instance ID
- **Public IP**: Access your app at this IP
- **Application URL**: Direct link to your deployed app

### 7. Future Deployments

Push to your GitHub repository and it automatically:
1. Triggers the GitHub webhook
2. Builds a new Docker image
3. Deploys to EC2
4. Updates your running application

**No additional action needed!**

## What Gets Created

### On AWS EC2

- **Instance**: Automatically provisioned EC2 instance
- **Security Group**: SSH, HTTP, HTTPS rules configured
- **Elastic IP**: Static public IP assigned
- **Docker**: Pre-installed and configured

### In Jenkins

- **Job**: Automated deployment job
- **Webhook**: GitHub webhook configured
- **Credentials**: GitHub and Docker Hub tokens stored

### In GitHub

- **Webhook**: Automatic trigger on push

### In Docker Hub

- **Repository**: Your Docker image pushed to registry

## Example Deployment

### Deploy a Node.js App

```bash
# Your GitHub repository structure
my-awesome-app/
├── src/
│   └── index.js
├── package.json
├── package-lock.json
└── README.md
```

**No Dockerfile needed!** The system auto-generates it.

### One-Click Deploy

1. Enter:
   - Owner: `john-doe`
   - Repo: `my-awesome-app`
   - Branch: `main`

2. Click [ Deploy with CI/CD ]

3. Wait for completion (~5-10 minutes)

4. Your app is live at `http://<public-ip>`

### Future Updates

```bash
git push origin main
```

Your app automatically rebuilds and redeploys. **That's it!**

## Monitoring Deployments

### View Deployment Status

Click **Deployments → History** to see:
- All past deployments
- Current deployment status
- Deployment duration
- Success/failure status

### View Application Logs

```bash
# SSH to your EC2 instance
ssh -i your-key.pem ubuntu@<public-ip>

# View Docker logs
docker logs <container-id>

# Or view in dashboard
Deployments → Logs
```

## Common Deployment Scenarios

### Deploying a Python Flask App

```
Repository: github.com/user/flask-app
├── app.py
├── requirements.txt
└── README.md
```

Deploy → One-Click → Wait → Live! ✅

### Deploying a React App

```
Repository: github.com/user/react-app
├── src/
├── package.json
└── Dockerfile (optional)
```

Deploy → One-Click → Wait → Live! ✅

### Deploying a Full-Stack App

```
Repository: github.com/user/fullstack-app
├── frontend/
│   ├── src/
│   └── package.json
├── backend/
│   ├── server.js
│   └── package.json
├── docker-compose.yml (optional)
└── README.md
```

Deploy → One-Click → Wait → Live! ✅

## Troubleshooting

### Deployment Stuck on "Analyzing Repository"

- Check GitHub token is valid
- Verify repository is accessible
- Check internet connection

### Deployment Fails on "Infrastructure Ready"

- Verify AWS credentials
- Check EC2 quota limits
- Ensure IAM permissions allow EC2 creation

### Deployment Fails on "Docker Image Built"

- Check repository has valid `package.json` or equivalent
- Verify dependencies are listed
- Review generated Dockerfile

### Application Not Accessible After Deployment

- Check security group allows port 80
- Verify application is running: `docker logs <container-id>`
- Check health check passed
- Wait a few seconds for app to start

### Health Checks Failed

- Check application startup time
- Verify app listens on port specified
- Review application logs
- Check memory/CPU in EC2 instance

## Best Practices

### 1. Use Meaningful Commit Messages

Good commits help debugging:

```bash
git commit -m "Add user authentication"
```

### 2. Keep Dependencies Updated

```bash
npm update
pip install --upgrade -r requirements.txt
```

### 3. Test Locally First

```bash
npm start
python app.py
```

### 4. Monitor After Deployment

Check logs and metrics after each deployment:

```bash
Deployments → Logs
Monitoring → Metrics
```

### 5. Use Environment Variables

Store sensitive data in GitHub secrets:

```yaml
# GitHub Actions can inject as env vars
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  API_KEY: ${{ secrets.API_KEY }}
```

## Advanced Configuration

### Custom Port Mapping

Modify generated `docker-compose.yml`:

```yaml
services:
  app:
    ports:
      - "8080:3000"  # Access at http://<ip>:8080
```

### Custom Environment Variables

In EC2 instance, add to `.env` file:

```bash
ssh -i key.pem ubuntu@<public-ip>
nano /app/.env
```

### Custom Domain

After deployment, point your domain to the Elastic IP:

```
example.com A record → <elastic-ip>
```

## Performance Tips

1. **Use free-tier instances** - `t2.micro` for small apps
2. **Optimize Docker images** - Use multi-stage builds
3. **Cache dependencies** - Leverage Docker layer caching
4. **Monitor resource usage** - Check CPU/memory metrics

## Cost Estimation

| Instance Type | Monthly Cost* | Best For |
|---|---|---|
| t2.micro | ~$9 | Small apps, free-tier eligible |
| t2.small | ~$20 | Medium apps, testing |
| t2.medium | ~$35 | Larger apps, production |

*AWS pricing varies by region. See aws.amazon.com/ec2/pricing

## Support Resources

- 📖 [Full Documentation](./ONE_CLICK_DEPLOYMENT_GUIDE.md)
- 🔧 [Troubleshooting Guide](./TROUBLESHOOTING.md)
- 💬 [GitHub Issues](https://github.com/devops-hub/issues)
- 📧 Support: support@devops-hub.dev

## Next Steps

1. ✅ Connect all integrations
2. ✅ Deploy your first app with one-click
3. ✅ Push to GitHub and watch it auto-deploy
4. ✅ Monitor your application
5. ✅ Scale as needed

**You're ready to deploy! 🚀**
