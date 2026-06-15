# AWS Infrastructure API Reference

## Base URL
```
http://localhost:5000/api/aws
```

## Authentication
All endpoints require Bearer token:
```
Authorization: Bearer {JWT_TOKEN}
```

---

## AWS Connection Management

### 1. Connect AWS Account
**Endpoint:** `POST /connect`

**Description:** Validate AWS credentials and create connection

**Request:**
```json
{
  "connectionName": "My AWS Account",
  "accessKeyId": "AKIA...",
  "secretAccessKey": "wJal...",
  "region": "us-east-1"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "connection": {
    "_id": "507f1f77bcf86cd799439011",
    "connectionName": "My AWS Account",
    "region": "us-east-1",
    "accountId": "123456789012",
    "accountName": "AWS Account 123456789012",
    "connected": true,
    "validatedAt": "2026-06-01T10:00:00Z"
  },
  "accountInfo": {
    "accountId": "123456789012",
    "userId": "AIDAI...",
    "arn": "arn:aws:iam::123456789012:user/devops-hub",
    "region": "us-east-1"
  }
}
```

**Error (401 Unauthorized):**
```json
{
  "error": "Invalid AWS credentials",
  "details": "The Access Key ID and Secret you supplied are not valid"
}
```

---

### 2. List AWS Connections
**Endpoint:** `GET /connections`

**Description:** Get all AWS connections for authenticated user

**Response (200 OK):**
```json
{
  "success": true,
  "connections": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "connectionName": "Production AWS",
      "region": "us-east-1",
      "accountId": "123456789012",
      "accountName": "AWS Account 123456789012",
      "connected": true,
      "infrastructureCount": 3,
      "createdAt": "2026-06-01T09:00:00Z"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "connectionName": "Development AWS",
      "region": "eu-west-1",
      "accountId": "987654321098",
      "accountName": "AWS Account 987654321098",
      "connected": true,
      "infrastructureCount": 1,
      "createdAt": "2026-05-28T14:30:00Z"
    }
  ]
}
```

---

### 3. Get AWS Connection Details
**Endpoint:** `GET /connections/:connectionId`

**Parameters:**
- `connectionId` (string, required) - Connection ID

**Response (200 OK):**
```json
{
  "success": true,
  "connection": {
    "_id": "507f1f77bcf86cd799439011",
    "connectionName": "Production AWS",
    "region": "us-east-1",
    "accountId": "123456789012",
    "accountName": "AWS Account 123456789012",
    "connected": true,
    "validatedAt": "2026-06-01T10:00:00Z",
    "quotaLimits": {
      "maxInstances": 10,
      "maxSecurityGroups": 10,
      "maxElasticIPs": 5
    },
    "infrastructureCount": 3,
    "totalCost": 45.50,
    "costCurrency": "USD"
  }
}
```

---

### 4. Disconnect AWS Account
**Endpoint:** `DELETE /connections/:connectionId`

**Parameters:**
- `connectionId` (string, required) - Connection ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "AWS connection disconnected"
}
```

**Error (404 Not Found):**
```json
{
  "error": "AWS connection not found"
}
```

---

## Infrastructure Management

### 5. Create Infrastructure
**Endpoint:** `POST /infrastructure/create`

**Description:** Provision new EC2 instance with security group and bootstrap

**Request:**
```json
{
  "connectionId": "507f1f77bcf86cd799439011",
  "instanceType": "t3.micro",
  "os": "ubuntu",
  "storageSize": 30,
  "name": "my-devops-app",
  "region": "us-east-1"
}
```

**Parameters:**
- `connectionId` (string, required) - AWS connection ID
- `instanceType` (string, required) - One of: t2.micro, t3.micro, t3.small
- `os` (string, required) - One of: ubuntu, amazon-linux
- `storageSize` (number, required) - Storage in GB (20-100)
- `name` (string, required) - Instance name
- `region` (string, required) - AWS region

**Response (200 OK):**
```json
{
  "success": true,
  "infrastructure": {
    "_id": "607f1f77bcf86cd799439013",
    "instanceId": "i-0123456789abcdef0",
    "instanceType": "t3.micro",
    "operatingSystem": "ubuntu",
    "region": "us-east-1",
    "publicIp": "54.123.45.67",
    "privateIp": "10.0.0.5",
    "securityGroupId": "sg-0123456789abcdef0",
    "status": "running",
    "bootstrapStatus": "pending",
    "createdAt": "2026-06-01T10:00:00Z"
  }
}
```

**Error (400 Bad Request):**
```json
{
  "error": "Missing required fields: connectionId, instanceType, os, region"
}
```

---

### 6. List Infrastructure
**Endpoint:** `GET /infrastructure`

**Query Parameters:**
- `region` (string, optional) - Filter by AWS region

**Response (200 OK):**
```json
{
  "success": true,
  "infrastructure": [
    {
      "_id": "607f1f77bcf86cd799439013",
      "instanceId": "i-0123456789abcdef0",
      "instanceType": "t3.micro",
      "operatingSystem": "ubuntu",
      "region": "us-east-1",
      "publicIp": "54.123.45.67",
      "privateIp": "10.0.0.5",
      "deploymentStatus": "ready",
      "bootstrapStatus": "success",
      "ec2Status": "running",
      "tags": { "Name": "my-devops-app" },
      "createdAt": "2026-06-01T10:00:00Z"
    }
  ],
  "count": 1
}
```

---

### 7. Get Infrastructure Details
**Endpoint:** `GET /infrastructure/:infrastructureId`

**Parameters:**
- `infrastructureId` (string, required) - Infrastructure ID

**Response (200 OK):**
```json
{
  "success": true,
  "infrastructure": {
    "_id": "607f1f77bcf86cd799439013",
    "instanceId": "i-0123456789abcdef0",
    "instanceType": "t3.micro",
    "operatingSystem": "ubuntu",
    "storageSize": 30,
    "region": "us-east-1",
    "securityGroupId": "sg-0123456789abcdef0",
    "securityGroupName": "devops-hub-1622556000000",
    "publicIp": "54.123.45.67",
    "privateIp": "10.0.0.5",
    "elasticIp": null,
    "deploymentStatus": "ready",
    "bootstrapStatus": "success",
    "ec2Status": "running",
    "bootstrapLog": "Starting DevOps Hub bootstrap process...",
    "deployment": {
      "applicationName": "devops-dashboard",
      "applicationVersion": "1.0.0",
      "dockerImage": "my-app:latest",
      "containerPorts": [3000, 5000],
      "lastDeploymentTime": "2026-06-01T11:30:00Z",
      "lastDeploymentStatus": "success"
    },
    "monitoring": {
      "enabled": true,
      "cpuUtilization": 15.2,
      "memoryUtilization": 45.8,
      "diskUtilization": 32.1,
      "lastMetricsUpdate": "2026-06-01T12:00:00Z"
    },
    "tags": {
      "Name": "my-devops-app",
      "ManagedBy": "DevOpsHub"
    },
    "health": {
      "status": "healthy",
      "lastCheckTime": "2026-06-01T12:00:00Z"
    },
    "createdAt": "2026-06-01T10:00:00Z",
    "awsConnectionId": {
      "_id": "507f1f77bcf86cd799439011",
      "connectionName": "Production AWS",
      "region": "us-east-1",
      "accountId": "123456789012"
    }
  }
}
```

---

### 8. Get Infrastructure Dashboard
**Endpoint:** `GET /infrastructure/:infrastructureId/dashboard`

**Description:** Get comprehensive dashboard data with real-time metrics

**Response (200 OK):**
```json
{
  "success": true,
  "infrastructure": {
    "_id": "607f1f77bcf86cd799439013",
    "instanceId": "i-0123456789abcdef0",
    "instanceType": "t3.micro",
    "operatingSystem": "ubuntu",
    "region": "us-east-1",
    "publicIp": "54.123.45.67",
    "privateIp": "10.0.0.5",
    "status": "running",
    "bootstrapStatus": "success",
    "deploymentStatus": "ready",
    "createdAt": "2026-06-01T10:00:00Z"
  },
  "awsDetails": {
    "instanceId": "i-0123456789abcdef0",
    "instanceType": "t3.micro",
    "state": "running",
    "publicIp": "54.123.45.67",
    "privateIp": "10.0.0.5",
    "launchTime": "2026-06-01T10:05:00Z",
    "tags": { "Name": "my-devops-app" },
    "keyName": "devops-hub-key",
    "securityGroups": [
      {
        "GroupId": "sg-0123456789abcdef0",
        "GroupName": "devops-hub-1622556000000"
      }
    ],
    "vpcId": "vpc-0123456789abcdef0",
    "subnetId": "subnet-0123456789abcdef0",
    "monitoring": {
      "state": "enabled",
      "instanceStatus": "ok",
      "systemStatus": "ok"
    }
  }
}
```

---

### 9. Update Infrastructure Status
**Endpoint:** `PATCH /infrastructure/:infrastructureId/status`

**Description:** Update infrastructure deployment or bootstrap status

**Request:**
```json
{
  "deploymentStatus": "deployed",
  "bootstrapStatus": "success",
  "ec2Status": "running"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "infrastructure": {
    "_id": "607f1f77bcf86cd799439013",
    "deploymentStatus": "deployed",
    "bootstrapStatus": "success",
    "ec2Status": "running"
  }
}
```

---

### 10. Terminate Infrastructure
**Endpoint:** `POST /infrastructure/:infrastructureId/terminate`

**Description:** Terminate EC2 instance and delete security group

**Request:**
```json
{
  "confirmTermination": true
}
```

**Parameters:**
- `confirmTermination` (boolean, required) - Must be true to confirm

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Infrastructure termination initiated",
  "infrastructure": {
    "_id": "607f1f77bcf86cd799439013",
    "instanceId": "i-0123456789abcdef0",
    "deploymentStatus": "terminated",
    "terminationTime": "2026-06-01T12:30:00Z"
  }
}
```

**Error (400 Bad Request):**
```json
{
  "error": "Please confirm termination by sending confirmTermination=true"
}
```

---

## Configuration Endpoints

### 11. Get Instance Types
**Endpoint:** `GET /instance-types`

**Description:** Get available EC2 instance types and OS options

**Response (200 OK):**
```json
{
  "success": true,
  "instanceTypes": [
    {
      "name": "t2.micro",
      "description": "1 GB RAM, 1 vCPU - Free tier eligible",
      "memory": 1024,
      "cpu": 1,
      "costPerMonth": 9.5
    },
    {
      "name": "t3.micro",
      "description": "1 GB RAM, 2 vCPU - Burst capable",
      "memory": 1024,
      "cpu": 2,
      "costPerMonth": 7.6
    },
    {
      "name": "t3.small",
      "description": "2 GB RAM, 2 vCPU - Good for small apps",
      "memory": 2048,
      "cpu": 2,
      "costPerMonth": 15.2
    }
  ],
  "operatingSystems": [
    {
      "name": "ubuntu",
      "displayName": "Ubuntu 22.04 LTS",
      "defaultUser": "ubuntu",
      "notes": "Long-term support, widely compatible"
    },
    {
      "name": "amazon-linux",
      "displayName": "Amazon Linux 2023",
      "defaultUser": "ec2-user",
      "notes": "AWS-optimized, lightweight"
    }
  ],
  "regions": [
    { "name": "us-east-1", "displayName": "N. Virginia" },
    { "name": "us-east-2", "displayName": "Ohio" },
    { "name": "us-west-1", "displayName": "N. California" },
    { "name": "us-west-2", "displayName": "Oregon" },
    { "name": "eu-west-1", "displayName": "Ireland" },
    { "name": "eu-central-1", "displayName": "Frankfurt" },
    { "name": "ap-southeast-1", "displayName": "Singapore" },
    { "name": "ap-southeast-2", "displayName": "Sydney" }
  ]
}
```

---

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Invalid or expired authentication token"
}
```

### 400 Bad Request
```json
{
  "error": "Invalid request",
  "details": "Field 'instanceType' is required"
}
```

### 404 Not Found
```json
{
  "error": "Infrastructure not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to create infrastructure",
  "details": "AWS API error: InvalidAMIID.NotFound"
}
```

---

## Rate Limiting

No explicit rate limits, but AWS API quotas apply:
- EC2: Max 100 instances per account
- Security Groups: Max 500 per account
- API calls: Standard AWS API rate limits

---

## Examples

### Complete Workflow

```bash
# 1. Connect AWS account
curl -X POST http://localhost:5000/api/aws/connect \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connectionName": "My AWS",
    "accessKeyId": "AKIA...",
    "secretAccessKey": "wJal...",
    "region": "us-east-1"
  }'

# 2. List connections
curl -X GET http://localhost:5000/api/aws/connections \
  -H "Authorization: Bearer $TOKEN"

# 3. Create infrastructure
curl -X POST http://localhost:5000/api/aws/infrastructure/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "connectionId": "507f1f77bcf86cd799439011",
    "instanceType": "t3.micro",
    "os": "ubuntu",
    "storageSize": 30,
    "name": "my-app",
    "region": "us-east-1"
  }'

# 4. Get infrastructure
curl -X GET http://localhost:5000/api/aws/infrastructure \
  -H "Authorization: Bearer $TOKEN"

# 5. View infrastructure details
curl -X GET http://localhost:5000/api/aws/infrastructure/607f1f77bcf86cd799439013 \
  -H "Authorization: Bearer $TOKEN"

# 6. Terminate infrastructure
curl -X POST http://localhost:5000/api/aws/infrastructure/607f1f77bcf86cd799439013/terminate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirmTermination": true}'
```

---

**Last Updated:** June 2026
**API Version:** 1.0.0
**Status:** ✅ Production Ready
