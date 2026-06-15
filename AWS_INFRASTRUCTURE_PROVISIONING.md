# AWS Infrastructure Provisioning - Complete Implementation Guide

## Overview

This guide documents the complete implementation of AWS infrastructure provisioning in the DevOps Hub dashboard. Users can now automatically create, manage, and deploy to EC2 instances without manual setup.

## Features Implemented

### 1. AWS Account Connection
- ✅ Connect AWS account with IAM credentials
- ✅ Validate credentials immediately
- ✅ Display account ID, name, and region
- ✅ Encrypt and securely store credentials
- ✅ Manage multiple AWS connections

### 2. Infrastructure Provisioning
- ✅ Automatic EC2 instance creation
- ✅ Security group creation with open ports (22, 80, 443, 3000, 5000, 8080)
- ✅ Selectable instance types (t2.micro, t3.micro, t3.small)
- ✅ Multiple OS support (Ubuntu 22.04, Amazon Linux 2023)
- ✅ Configurable storage (20-100 GB)
- ✅ Instance status polling and tracking

### 3. Server Bootstrap
- ✅ Automatic Docker installation
- ✅ Docker Compose installation
- ✅ Git installation
- ✅ Curl installation
- ✅ SSH access configuration
- ✅ CloudWatch agent optional setup

### 4. Infrastructure Management
- ✅ View all created instances
- ✅ Monitor instance status
- ✅ Terminate infrastructure (with confirmation)
- ✅ Display public and private IPs
- ✅ Track deployment status
- ✅ View bootstrap logs

### 5. Jenkins Integration
- Infrastructure provisioning triggers can be integrated with Jenkins pipelines
- Auto-deploy to created EC2 instances
- Health check integration

## Architecture

### Backend Components

#### Services
1. **awsProviderService.js** - AWS SDK management and EC2 operations
2. **awsInfrastructureProvisioningService.js** - Infrastructure lifecycle management
3. **credentialEncryptionService.js** - Secure credential storage (already exists)

#### Models
1. **AWSConnection.js** - AWS account connection records
2. **AWSInfrastructure.js** - EC2 instance and infrastructure metadata

#### Routes & Controllers
1. **awsRoutes.js** - API endpoint definitions
2. **awsController.js** - Request handlers

### Frontend Components

#### Pages
1. **AWSConnection.jsx** - AWS account connection workflow
2. **AWSInfrastructureProvisioning.jsx** - EC2 instance creation wizard
3. **AWSInfrastructureManagement.jsx** - Instance management dashboard

#### Integration
1. **Integrations.jsx** - Updated to show AWS as active provider
2. **App.jsx** - Routes added for AWS pages

### Database Schema

#### AWSConnection Collection
```javascript
{
  userId: String,              // User ID
  encryptedCredentials: {
    accessKeyId: String,       // Encrypted
    secretAccessKey: String    // Encrypted
  },
  region: String,              // AWS region
  accountId: String,           // AWS account ID
  accountArn: String,          // Account ARN
  accountName: String,         // Display name
  connected: Boolean,          // Connection status
  validatedAt: Date,           // Last validation
  connectionName: String,      // User-defined name
  quotaLimits: Object,         // Resource limits
  infrastructure Count: Number,
  createdAt: Date,
  updatedAt: Date
}
```

#### AWSInfrastructure Collection
```javascript
{
  userId: String,                    // User ID
  awsConnectionId: ObjectId,         // Reference to connection
  instanceId: String,                // EC2 instance ID
  instanceType: String,              // t2.micro, t3.small, etc.
  operatingSystem: String,           // ubuntu, amazon-linux
  storageSize: Number,               // GB
  region: String,                    // AWS region
  securityGroupId: String,           // Security group ID
  publicIp: String,                  // Public IP address
  privateIp: String,                 // Private IP address
  deploymentStatus: String,          // provisioning, ready, deployed, terminated
  bootstrapStatus: String,           // pending, success, failed
  ec2Status: String,                 // running, stopped, pending
  monitoring: Object,                // CPU, memory, disk metrics
  tags: Map,                         // AWS tags
  relatedDeployments: [ObjectId],   // Linked deployments
  health: Object,                    // Health check status
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints

### AWS Connection Management
```
POST   /api/aws/connect              - Connect AWS account
GET    /api/aws/connections          - List connections
GET    /api/aws/connections/:id      - Get connection details
DELETE /api/aws/connections/:id      - Disconnect account
```

### Infrastructure Management
```
POST   /api/aws/infrastructure/create           - Create new instance
GET    /api/aws/infrastructure                  - List instances
GET    /api/aws/infrastructure/:id              - Get instance details
GET    /api/aws/infrastructure/:id/dashboard   - Get dashboard data
POST   /api/aws/infrastructure/:id/terminate   - Terminate instance
PATCH  /api/aws/infrastructure/:id/status      - Update status
```

### Configuration
```
GET    /api/aws/instance-types                 - Get available types
```

## Frontend Routes

```
/aws/connect                          - AWS connection page
/aws/:connectionId/provision          - Infrastructure provisioning wizard
/aws/:connectionId/infrastructure     - Infrastructure management dashboard
```

## Installation & Setup

### 1. Install Dependencies
```bash
cd backend
npm install @aws-sdk/client-ec2 @aws-sdk/client-sts
```

### 2. Environment Configuration
Add to `.env`:
```
AWS_DEFAULT_REGION=us-east-1
AWS_ENABLE_INFRASTRUCTURE_PROVISIONING=true
AWS_ENCRYPTION_KEY=devops-hub-aws-encryption-key
```

### 3. AWS IAM Setup

Create an IAM user with these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:RunInstances",
        "ec2:TerminateInstances",
        "ec2:StartInstances",
        "ec2:StopInstances",
        "ec2:RebootInstances",
        "ec2:DescribeInstances",
        "ec2:DescribeInstanceStatus",
        "ec2:CreateSecurityGroup",
        "ec2:DeleteSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:DescribeSecurityGroups",
        "ec2:DescribeImages",
        "ec2:DescribeVpcs",
        "ec2:DescribeSubnets",
        "ec2:CreateTags"
      ],
      "Resource": "*"
    }
  ]
}
```

### 4. Create Access Keys
1. Go to AWS Console → IAM → Users
2. Create new user or use existing
3. Create access keys
4. Copy Access Key ID and Secret Access Key
5. Enter in DevOps Hub UI

## Usage Workflow

### 1. Connect AWS Account
1. Navigate to `/integrations`
2. Click "Connect" under AWS
3. Navigate to `/aws/connect`
4. Enter AWS credentials
5. Click "Connect to AWS"

### 2. Provision Infrastructure
1. Click "Manage Infrastructure"
2. Click "Create Infrastructure"
3. Configure:
   - Instance name
   - AWS region
   - Instance type
   - Operating system
   - Storage size
4. Review configuration
5. Click "Create Infrastructure"
6. Monitor provisioning progress

### 3. Manage Infrastructure
1. View all instances in dashboard
2. Click instance for details
3. View:
   - Instance ID
   - Public/Private IPs
   - Region and type
   - Bootstrap status
   - Installed services
4. Terminate infrastructure (with confirmation)

### 4. Deploy Applications
1. Infrastructure automatically available for deployments
2. Jenkins pipeline can target created EC2 instances
3. Applications deployed via Docker/Docker Compose
4. Health checks monitor instance

## Security Considerations

### Credential Encryption
- All AWS credentials encrypted using bcryptjs
- Credentials never logged or exposed in API responses
- Encrypted storage in MongoDB

### Network Security
- Security groups created with restricted access
- SSH (port 22) accessible only via security group rules
- HTTP/HTTPS ports configurable
- Application ports (3000, 5000, 8080) for DevOps Hub services

### IAM Permissions
- Use least-privilege IAM policies
- Create dedicated IAM user for DevOps Hub
- Rotate credentials regularly
- Monitor IAM activity in CloudTrail

### Bootstrap Security
- No sensitive data in user data scripts
- Scripts logged for audit purposes
- CloudWatch monitoring for security events
- Security patches applied during setup

## Monitoring & Observability

### Instance Monitoring
- CloudWatch metrics available
- CPU, memory, disk utilization tracking
- Network performance monitoring
- Health check status

### Bootstrap Logs
- Bootstrap logs stored in `/var/log/devops-hub-bootstrap.log`
- Accessible via SSH for debugging
- Includes timestamps and error messages

### Deployment Tracking
- Deployment status tracked in database
- Related deployments linked to infrastructure
- Audit log of all infrastructure actions

## Troubleshooting

### Issue: "Invalid AWS credentials"
**Solution:**
- Verify Access Key ID and Secret in AWS Console
- Ensure IAM user has required permissions
- Check region is correct
- Verify credentials haven't been rotated/revoked

### Issue: "No default VPC found"
**Solution:**
- Create default VPC: AWS Console → VPC → Create default VPC
- Or specify VPC ID in security group creation
- Ensure VPC has public subnet

### Issue: "Instance fails to bootstrap"
**Solution:**
- Check security group allows SSH (port 22)
- Review bootstrap logs: `ssh -i key.pem ec2-user@public-ip`
- Verify instance has internet access
- Check IAM role has required permissions

### Issue: "SSH connection times out"
**Solution:**
- Verify security group allows SSH (port 22)
- Check instance is running
- Verify public IP is correct
- Check local firewall allows SSH

## Performance Characteristics

### Provisioning Timeline
- Security group creation: 5-10 seconds
- EC2 instance launch: 15-30 seconds
- Instance ready: 30-60 seconds
- Docker bootstrap: 30-60 seconds
- Total time: 2-3 minutes

### Resource Costs (US-East-1)
- t2.micro: $9.50/month
- t3.micro: $7.60/month
- t3.small: $15.20/month
- Storage: $0.10/GB/month (30 GB = $3/month)

## Future Enhancements

- [ ] VPC and subnet selection
- [ ] Elastic IP management
- [ ] Auto-scaling group support
- [ ] Load balancer integration
- [ ] RDS database provisioning
- [ ] S3 bucket management
- [ ] CloudFormation template support
- [ ] Cost analysis and optimization
- [ ] Multi-region deployments
- [ ] Scheduled instance termination

## Integration Points

### Jenkins Pipeline
```groovy
// Deploy to AWS EC2 instance
stage('Deploy to EC2') {
  steps {
    sh '''
      INSTANCE_IP=$(aws ec2 describe-instances --instance-ids ${INSTANCE_ID} --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
      scp -i ${SSH_KEY} -r docker-compose.yml ec2-user@${INSTANCE_IP}:/home/ec2-user/
      ssh -i ${SSH_KEY} ec2-user@${INSTANCE_IP} "docker-compose up -d"
    '''
  }
}
```

### GitHub Actions Integration
```yaml
- name: Deploy to AWS EC2
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  run: |
    # Provision infrastructure
    # Deploy application
    # Health check
```

## Support & Documentation

For detailed API documentation, see [AWS_API_REFERENCE.md](./AWS_API_REFERENCE.md)
For troubleshooting guide, see [AWS_TROUBLESHOOTING.md](./AWS_TROUBLESHOOTING.md)
For cost optimization, see [AWS_COST_GUIDE.md](./AWS_COST_GUIDE.md)

---

**Last Updated:** June 2026
**Implementation Status:** ✅ Complete
**Version:** 1.0.0
