# DevOps Dashboard - Deployment Workflow Complete Map

**Generated:** June 15, 2026  
**Scope:** Backend deployment automation analysis  
**Purpose:** Understand Docker Hub integration points and current deployment flow

---

## TABLE OF CONTENTS

1. [Deployment Flow Overview](#deployment-flow-overview)
2. [Docker Image Building](#docker-image-building)
3. [Jenkins Credentials Usage](#jenkins-credentials-usage)
4. [Docker Hub Integration](#docker-hub-integration)
5. [Image Deployment from Docker Hub](#image-deployment-from-docker-hub)
6. [BUILD_NUMBER Usage](#build_number-usage)
7. [Error Handling](#error-handling)
8. [Environment Variables](#environment-variables)
9. [Quick Reference Map](#quick-reference-map)

---

## Deployment Flow Overview

```
┌─────────────┐
│GitHub Push  │ (webhook triggered)
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│deploymentOrchestrationService.js    │ executeFullAutomatedDeployment()
│  1. Clone repository                │ [Lines 50-300]
│  2. Detect tech stack               │
│  3. Generate Dockerfile             │
│  4. Generate docker-compose.yml     │
│  5. Generate Jenkinsfile            │
└──────┬──────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│jenkinsJobService.js                  │ createJenkinsJob()
│  1. Build job XML config             │ [Lines 280-350]
│  2. Create job in Jenkins via API    │
│  3. Trigger build                    │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│Jenkinsfile (Generated)               │ Pipeline Stages:
│  ✓ Checkout                          │ [jenkinsfileGeneratorService.js]
│  ✓ Install Dependencies              │ [Lines 1-450]
│  ✓ Lint                              │
│  ✓ Build                             │
│  ✓ Test                              │
│  ✓ Build Docker Image                │
│  ✓ Push Docker Image                 │ Uses BUILD_NUMBER
│  ✓ Deploy to EC2                     │
│  ✓ Health Check                      │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│Docker Build & Push                   │ buildDockerImage() / pushDockerImage()
│  docker build -t app:BUILD_NUMBER    │ [deploymentAutomationService.js]
│  docker tag → docker push            │ [Lines 120-280]
│                                      │
│  Docker Hub API:                     │ dockerHubRegistryService.js
│  - Validate credentials              │ [Lines 1-200]
│  - Create repository (if needed)     │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│EC2 Automated Deployment              │ deployToEc2()
│ (via SSH from Jenkins or trigger)    │ [ec2AutomatedDeploymentService.js]
│                                      │ [Lines 201-350]
│  1. SSH connection validation        │
│  2. Git clone/pull on EC2            │
│  3. Generate docker-compose.yml      │
│  4. docker pull image from Hub       │
│  5. docker compose up                │
│  6. Health checks                    │
└──────┬───────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│Application Running on EC2            │
│  Container accessible at:            │
│  http://EC2_IP:80 → :CONTAINER_PORT │
└──────────────────────────────────────┘
```

---

## Docker Image Building

### Where Images Are Built

**Primary File:** `backend/src/services/jenkinsfileGeneratorService.js`

#### Build Location in Jenkins Pipeline:

| Tech Stack | Jenkinsfile Section | Line | Command |
|-----------|-------------------|------|---------|
| Node.js | Build Docker Image | 30-40 | `docker build -t ${DOCKER_IMAGE} .` |
| Python | Build Docker Image | 30-40 | `docker build -t ${DOCKER_IMAGE} .` |
| Static | Build Docker Image | 30-40 | `docker build -t ${DOCKER_IMAGE} .` |
| Java | Build Docker Image | 30-40 | `docker build -t ${DOCKER_IMAGE} .` |

#### Image Naming & Tagging

**File:** `jenkinsfileGeneratorService.js`

```javascript
// Line 22 (Node.js)
DOCKER_IMAGE = '${containerName}:${BUILD_NUMBER}'

// Example Output:
// containerName = "to-do-list"
// BUILD_NUMBER = 42
// Result: to-do-list:42
```

**Alternative Format** (Docker Hub integration):

```javascript
// jenkinsPipelineGeneratorService.js, Line 337
imageName = '${sanitizeImagePart(dockerHub.username)}/${sanitizeImagePart(repo)}'

// Example Output:
// dockerHub.username = "myusername"
// repo = "to-do-list"
// Result: myusername/to-do-list:42
```

#### Build Command Flow

```bash
# Generated in Jenkinsfile Line 36
sh 'docker build -t ${DOCKER_IMAGE} .'

# Also in alternative pipeline:
# jenkinsPipelineGeneratorService.js Line 376-380
docker compose -p ${repo} build
```

---

## Jenkins Credentials Usage

### Jenkins Connection Configuration

**File:** `backend/src/services/deploymentAutomationService.js` (Lines 27-40)

```javascript
const DEPLOYMENT_CONFIG = {
  JENKINS_URL: process.env.JENKINS_URL || "http://localhost:8080",
  JENKINS_USERNAME: process.env.JENKINS_USER || 
                    process.env.JENKINS_USERNAME || "admin",
  JENKINS_TOKEN: process.env.JENKINS_TOKEN,
  DOCKER_REGISTRY: process.env.DOCKER_REGISTRY || "localhost",
  DOCKER_REGISTRY_USERNAME: process.env.DOCKER_REGISTRY_USERNAME,
  DOCKER_REGISTRY_PASSWORD: process.env.DOCKER_REGISTRY_PASSWORD,
  CONTAINER_PORT: process.env.CONTAINER_PORT || "3000",
  HOST_PORT: process.env.HOST_PORT || "3000",
};
```

### Jenkins Job Creation

**File:** `backend/src/services/jenkinsJobService.js`

#### 1. Job Configuration XML Build (Lines 252-285)

```javascript
function buildPipelineJobConfigXml({ repositoryUrl, branch, jenkinsfilePath }) {
  return `<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <description>Pipeline job auto-created by DevOps Hub</description>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition">
    <scm class="hudson.plugins.git.GitSCM">
      <userRemoteConfigs>
        <hudson.plugins.git.UserRemoteConfig>
          <url>${escapeXml(repositoryUrl)}</url>
        </hudson.plugins.git.UserRemoteConfig>
      </userRemoteConfigs>
      <branches>
        <hudson.plugins.git.BranchSpec>
          <name>*/${escapeXml(branch)}</name>
        </hudson.plugins.git.BranchSpec>
      </branches>
    </scm>
    <scriptPath>${escapeXml(jenkinsfilePath)}</scriptPath>
  </definition>
  <triggers/>
</flow-definition>`;
}
```

#### 2. Jenkins Authentication Setup (Lines 162-176)

```javascript
function createJenkinsClient({ url, username, apiToken }) {
  const client = axios.create({
    baseURL: normalizeJenkinsBaseUrl(url),
    timeout: 15000,
    headers: {
      Authorization: `Basic ${Buffer.from(
        `${username}:${apiToken}`
      ).toString("base64")}`,
      "User-Agent": "DevOps-Hub",
    },
  });
  return client;
}
```

#### 3. CRUMB (CSRF Protection) Retrieval (Lines 177-189)

```javascript
async function getCrumbHeaders(client, jobName = "") {
  try {
    const response = await client.get("/crumbIssuer/api/json", 
      { jenkinsJobName: jobName });
    return {
      [response.data.crumbRequestField]: response.data.crumb,
    };
  } catch (error) {
    console.warn("[Jenkins Jobs] CSRF crumb unavailable, continuing...");
    return {};
  }
}
```

#### 4. Job Creation API Call (Lines 333-360)

```javascript
async function createJobInJenkins(
  client, 
  { baseUrl, jobName, configXml, crumbHeaders = {} }
) {
  const endpoint = buildJenkinsUrl(baseUrl, "/createItem", { name: jobName });
  try {
    const response = await client.post("/createItem", configXml, {
      params: { name: jobName },
      headers: {
        ...crumbHeaders,
        "Content-Type": "application/xml",
      },
      jenkinsJobName: jobName,
    });
    return diagnostics;
  } catch (error) {
    // Error handling with detailed diagnostics
    throw createJenkinsRequestError(error.message, diagnostics, error);
  }
}
```

### Credentials Stored in Jenkins

**Location:** Jenkins Credentials Plugin

| Credential ID | Type | Usage |
|--------------|------|-------|
| `dockerhub-credentials` | Username/Password | Docker Hub authentication in Jenkinsfile |
| `ssh-key-ec2` | SSH Key | EC2 deployment (if configured) |
| Default Jenkins credentials | Basic Auth | API calls for job management |

**Where Used:**
- **File:** `jenkinsPipelineGeneratorService.js` Line 366
  ```groovy
  DOCKER_HUB_CREDENTIALS_ID = '${singleQuote(credentials.dockerHubCredentialsId)}'
  ```

---

## Docker Hub Integration

### Connection & Validation

**File:** `backend/src/services/dockerHubRegistryService.js`

#### 1. Connect to Docker Hub (Lines 69-115)

```javascript
export async function connectDockerHub(userId, { username, accessToken }) {
  // Step 1: Validate credentials via Docker Hub API
  const validation = await validateDockerHubCredentials(
    credentials.username, 
    credentials.accessToken
  );
  
  // Step 2: Store encrypted credentials
  const encrypted = encryptSecret(credentials.accessToken);
  const dockerHub = {
    connected: true,
    username: credentials.username,
    encryptedAccessToken: encrypted.encryptedValue,
    tokenIv: encrypted.iv,
    tokenAuthTag: encrypted.authTag,
    connectedAt: now,
    permissions: {
      login: validation.login,
      push: validation.push,
    },
  };
  
  // Step 3: Save to database
  const user = await User.findByIdAndUpdate(userId, { dockerHub }, { new: true });
  return { success: true, status: getSafeDockerHubStatus(user) };
}
```

**API Calls Made:**

| Endpoint | Method | Purpose | Line |
|----------|--------|---------|------|
| `https://hub.docker.com/v2/users/login/` | POST | Validate credentials | 43 |
| `https://auth.docker.io/token` | GET | Check push permissions | 54-64 |

#### 2. Validate Docker Hub Credentials (Lines 33-65)

```javascript
export async function validateDockerHubCredentials(username, accessToken) {
  // Step 1: Login to get JWT token
  const loginResponse = await axios.post(
    `${DOCKER_HUB_API}/users/login/`,
    {
      username: credentials.username,
      password: credentials.accessToken,
    },
    { timeout: 15000 }
  );
  
  const dockerHubJwt = loginResponse.data?.token;
  
  // Step 2: Verify push permissions
  const basicAuth = Buffer
    .from(`${credentials.username}:${credentials.accessToken}`)
    .toString("base64");
  
  const permissionResponse = await axios.get(DOCKER_REGISTRY_AUTH_API, {
    params: {
      service: "registry.docker.io",
      scope: `repository:${credentials.username}/devops-hub-permission-check:pull,push`,
    },
    headers: { Authorization: `Basic ${basicAuth}` },
    timeout: 15000,
  });
  
  const pushPermission = Boolean(permissionResponse.data?.token);
  return {
    login: true,
    push: pushPermission,
    dockerHubJwt,
  };
}
```

### Repository Auto-Provisioning

**File:** `backend/src/services/deploymentAutomationService.js` (Lines 180-220)

```javascript
export const ensureDockerHubRepositoryExists = async (repositoryName) => {
  const repoName = repositoryName.toLowerCase().split('/').pop();
  
  // Step 1: Check if repository exists
  try {
    const checkResponse = await axios.get(
      `https://hub.docker.com/v2/repositories/${
        DEPLOYMENT_CONFIG.DOCKER_REGISTRY_USERNAME
      }/${repoName}/`,
      { timeout: 10000 }
    );
    console.log(`✅ Repository already exists: ${repoName}`);
    return { success: true, exists: true };
  } catch (checkError) {
    if (checkError.response?.status !== 404) throw checkError;
  }
  
  // Step 2: Create repository if not found
  const createResponse = await axios.post(
    'https://hub.docker.com/v2/repositories/',
    {
      namespace: DEPLOYMENT_CONFIG.DOCKER_REGISTRY_USERNAME,
      name: repoName,
      description: `Auto-provisioned by DevOps Hub for ${repositoryName}`,
      is_private: false,
    },
    {
      auth: {
        username: DEPLOYMENT_CONFIG.DOCKER_REGISTRY_USERNAME,
        password: DEPLOYMENT_CONFIG.DOCKER_REGISTRY_PASSWORD,
      },
      timeout: 10000,
    }
  );
  
  console.log(`✅ Repository created successfully: ${repoName}`);
  return { success: true, created: true };
};
```

### Image Push Process

**File:** `backend/src/services/dockerHubPushService.js` (Lines 60-250)

```javascript
export async function pushImageToDockerHub({
  user,
  buildId,
  dockerHubUsername,
  dockerHubPassword,
  dockerHubRepo,
}) {
  const imageId = getImageId();
  const sourceImageTag = build.imageTag;
  const targetImageName = `${dockerHubUsername}/${sanitizedRepo}`;
  const targetImageTag = `${targetImageName}:${tag}`;
  
  // Step 1: Tag image
  const tagChild = spawn("docker", [
    "tag", 
    sourceImageTag, 
    targetImageTag
  ]);
  
  // Step 2: Login to Docker Hub
  const loginChild = spawn("docker", [
    "login",
    "-u", dockerHubUsername,
    "--password-stdin"
  ]);
  
  // Step 3: Push image
  const pushChild = spawn("docker", [
    "push",
    targetImageTag
  ]);
  
  // Track progress with emitDockerPushLog() and emitDockerPushCompleted()
}
```

**Image Record Created:**

```javascript
await Image.create({
  imageId: "img-1780427865580-a1b2c3d4",
  buildId: buildId,
  imageName: `${dockerHubUsername}/${sanitizedRepo}`,
  imageTag: `${imageName}:${tag}`,
  status: "PUSHING" → "SUCCESS" | "FAILED",
  pushLogs: [
    { timestamp, message: "Docker push started", level: "info" },
    { timestamp, message: "Image tagged", level: "info" },
    // ... more logs
  ],
});
```

---

## Image Deployment from Docker Hub

### EC2 Automated Deployment

**File:** `backend/src/services/ec2AutomatedDeploymentService.js` (Lines 201-400)

#### Deployment Steps:

**Step 1: SSH Connection Validation (Lines 110-150)**
```javascript
async testSshConnection(config, logs = []) {
  const maxAttempts = 20;  // Configurable
  const retryDelayMs = 15000;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await this.executeSshCommand("true", config, logs);
      return lastResult;  // Success
    } catch (error) {
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  throw new Error(`SSH failed after ${maxAttempts} attempts`);
}
```

**Step 2: Repository Pull on EC2 (Lines 225-235)**
```javascript
logs.push("📥 Step 1: Pulling repository from GitHub...");
const pullResult = await this.executeSshCommand(
  `cd ~/devops-app && git pull || git clone ${repository} . || true`,
  config,
  logs
);
```

**Step 3: Generate docker-compose.yml (Lines 240-260)**
```javascript
const composeYaml = this.generateComposeYaml(
  containerName, 
  containerPort, 
  dockerImage  // From Docker Hub
);

// SSH: Create the compose file on EC2
const composeResult = await this.executeSshCommand(
  `mkdir -p ~/devops-app && cat > ~/devops-app/docker-compose.yml << 'EOF'\n${composeYaml}\nEOF`,
  config,
  logs
);
```

**docker-compose Template:**
```yaml
version: '3.8'
services:
  app:
    image: ${DOCKER_IMAGE}         # FROM DOCKER HUB
    container_name: ${CONTAINER_NAME}
    ports:
      - "${HOST_PORT}:${CONTAINER_PORT}"
    environment:
      NODE_ENV: production
      PORT: ${CONTAINER_PORT}
    networks:
      - app-network
    restart: unless-stopped

networks:
  app-network:
    driver: bridge
```

**Step 4: Pull Docker Image from Docker Hub (Lines 270-285)**
```javascript
logs.push("📦 Step 3: Pulling Docker image...");
const pullResult = await this.executeSshCommand(
  `docker pull ${dockerImage}`,
  config,
  logs
);

// dockerImage format: "docker-hub-username/repo:BUILD_NUMBER"
// Example: "myuser/to-do-list:42"
```

**Step 5: Start Containers (Lines 290-300)**
```javascript
logs.push("▶️  Step 5: Starting new containers...");
const upResult = await this.executeSshCommand(
  `cd ~/devops-app && docker compose -p app up -d`,
  config,
  logs
);
```

**Step 6: Health Checks (Lines 305-330)**
```javascript
logs.push("⏳ Step 6: Waiting for container to be ready...");
await new Promise((resolve) => setTimeout(resolve, 5000));

// Wait for health endpoint
const healthCheckResult = await this.executeSshCommand(
  `curl -f ${healthUrl} || exit 1`,
  config,
  logs
);
```

#### Configuration Resolution:

```javascript
async validateConfig(deployment = {}) {
  const host = deployment.publicIp || 
               deployment.host || 
               deployment.infrastructure?.publicIp || 
               process.env.AWS_EC2_HOST;
               
  const user = deployment.username || 
               deployment.user || 
               process.env.AWS_EC2_USER || 
               "ubuntu";
               
  const keyPath = await resolveEc2SshKeyForCli(deployment);
  
  return {
    host,           // EC2 public IP
    user,           // SSH user (ubuntu/ec2-user)
    keyPath,        // Path to SSH private key
    region: process.env.AWS_REGION || "us-east-1",
    port: deployment.port || 22,
  };
}
```

---

## BUILD_NUMBER Usage

### Where BUILD_NUMBER is Available

**Context:** Jenkins Pipeline Environment Variable

- **Provided by:** Jenkins automatically
- **Type:** Integer (auto-incrementing per job)
- **Scope:** Available during all pipeline stages
- **Example Values:** 1, 2, 3, 42, 123...

### Image Tagging with BUILD_NUMBER

**File:** `backend/src/services/jenkinsfileGeneratorService.js`

#### Node.js Pipeline (Lines 10-50)
```groovy
environment {
    NODE_ENV = 'production'
    DOCKER_IMAGE = '${containerName}:${BUILD_NUMBER}'
    PORT = '${containerPort}'
}

stages {
    stage('Build Docker Image') {
        steps {
            sh 'docker build -t ${DOCKER_IMAGE} .'
        }
    }
    
    stage('Push Docker Image') {
        when { branch 'main' }
        steps {
            sh '''
                docker tag ${DOCKER_IMAGE} ${containerName}:latest
                docker push ${DOCKER_IMAGE}
                docker push ${containerName}:latest
            '''
        }
    }
}
```

#### Usage Flow:

```
Build #1 Triggered
  ├─ BUILD_NUMBER = 1
  ├─ docker build -t app:1 .
  ├─ docker push dockerhub-user/app:1
  └─ EC2 pulls: dockerhub-user/app:1

Build #42 Triggered
  ├─ BUILD_NUMBER = 42
  ├─ docker build -t app:42 .
  ├─ docker push dockerhub-user/app:42
  └─ EC2 pulls: dockerhub-user/app:42
```

### BUILD_NUMBER Availability Timeline

| Stage | BUILD_NUMBER Available | Usage |
|-------|----------------------|-------|
| Checkout | ✅ Yes | Not typically used |
| Install Deps | ✅ Yes | Not typically used |
| Lint | ✅ Yes | Not typically used |
| Build | ✅ Yes | Not typically used |
| Test | ✅ Yes | Not typically used |
| Build Docker Image | ✅ Yes | **USED** - `docker build -t app:${BUILD_NUMBER}` |
| Push Docker Image | ✅ Yes | **USED** - `docker push app:${BUILD_NUMBER}` |
| Deploy to EC2 | ✅ Yes | Available but not used (image already pushed) |
| Health Check | ✅ Yes | Not needed |
| Post Actions | ✅ Yes | Available |

### BUILD_NUMBER in Deployment Flow

**File:** `backend/src/services/deploymentAutomationService.js` (Lines 120-140)

```javascript
export const buildDockerImage = async (
  jobName,
  buildNumber,  // ← BUILD_NUMBER from Jenkins
  imageTag,     // ← Container name + build number
  dockerfilePath = "./Dockerfile"
) => {
  // buildNumber is stored for tracking
  // imageTag format: "app:42" (already contains BUILD_NUMBER)
  
  const buildResult = await buildImage(dockerfilePath, imageTag, ".");
  return {
    success: true,
    imageTag,  // e.g., "app:42"
    logs: buildResult.logs,
  };
};
```

---

## Error Handling

### Layer 1: Jenkins Connection Errors

**File:** `backend/src/services/jenkinsJobService.js` (Lines 100-160)

```javascript
function classifyJenkinsRootCause({ baseUrl, endpoint, response, cause, message }) {
  const status = response?.status;
  const body = responseBodyToString(response?.data);

  if (status >= 200 && status < 400) return null;           // ✅ Success
  if (status === 401) return "authentication issue";         // ❌ Bad credentials
  if (status === 403) return body.toLowerCase().includes("crumb") 
    ? "missing crumb" : "authentication issue";              // ❌ Permission denied
  if (status === 404) return "bad endpoint";                 // ❌ Wrong URL
  if (cause?.code === "ECONNREFUSED") return "Jenkins not running";  // ❌ Not running
  if (/crumb/i.test(message || body)) return "missing crumb";  // ❌ CSRF issue
  return "Jenkins request failed";
}

function buildJenkinsDiagnostics({ baseUrl, endpoint, jobName, response, responseBody, message, cause }) {
  return {
    baseUrl,
    endpoint,
    jobName,
    responseCode: response?.status || null,
    responseBody: responseBodyToString(response?.data),
    rootCause: classifyJenkinsRootCause(...),
  };
}
```

### Layer 2: Docker Build Errors

**File:** `backend/src/services/deploymentAutomationService.js` (Lines 120-140)

```javascript
export const buildDockerImage = async (jobName, buildNumber, imageTag) => {
  try {
    console.log(`🔨 Building Docker image: ${imageTag}`);
    const buildResult = await buildImage(dockerfilePath, imageTag, ".");
    
    if (buildResult.success) {
      return { success: true, imageTag, logs: buildResult.logs };
    } else {
      return {
        success: false,
        error: buildResult.error,
        logs: buildResult.logs,  // ← Error logs included
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
};
```

### Layer 3: Docker Push Errors

**File:** `backend/src/services/deploymentAutomationService.js` (Lines 220-280)

```javascript
export const pushDockerImage = async (imageTag, repositoryName) => {
  try {
    // Step 1: Ensure Docker Hub repository exists (non-blocking)
    const repoResult = await ensureDockerHubRepositoryExists(repositoryName);
    if (!repoResult.success) {
      console.warn(`⚠️  Docker Hub repo check failed, continuing...`);
      // Non-blocking: doesn't throw
    }

    // Step 2: Docker login
    if (DEPLOYMENT_CONFIG.DOCKER_REGISTRY_USERNAME && 
        DEPLOYMENT_CONFIG.DOCKER_REGISTRY_PASSWORD) {
      await execAsync(
        `echo ${DEPLOYMENT_CONFIG.DOCKER_REGISTRY_PASSWORD} | docker login -u ${DEPLOYMENT_CONFIG.DOCKER_REGISTRY_USERNAME} --password-stdin ${DEPLOYMENT_CONFIG.DOCKER_REGISTRY}`
      );
    }

    // Step 3: Tag and push
    const registryTag = `${DEPLOYMENT_CONFIG.DOCKER_REGISTRY}/${imageTag}`;
    await execAsync(`docker tag ${imageTag} ${registryTag}`);
    const { stdout, stderr } = await execAsync(`docker push ${registryTag}`);
    
    return {
      success: true,
      registryTag,
      logs: (stdout + stderr).split("\n").filter(l => l),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      logs: [],
    };
  }
};
```

**Push Failure Handling:**
```javascript
const pushResult = await pushDockerImage(imageTag, containerConfig.repository);

if (!pushResult.success && !pushResult.skipped) {
  // ⚠️ Warning but continue (non-blocking)
  console.warn(`⚠️ Warning: Image push failed, but continuing with local deployment`);
  logs.push(`⚠️ Image push failed: ${pushResult.error}`);
} else if (pushResult.skipped) {
  logs.push(`ℹ️ Registry push skipped (local registry)`);
} else {
  logs.push(`✅ Docker image pushed successfully`);
}
```

### Layer 4: EC2 SSH Errors

**File:** `backend/src/services/ec2AutomatedDeploymentService.js` (Lines 60-85)

```javascript
async executeSshCommand(command, config, logs = []) {
  try {
    const sshArgs = [
      "-i", config.keyPath,
      "-o", "StrictHostKeyChecking=no",
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=10",
      "-p", config.port.toString(),
      `${config.user}@${config.host}`,
      command,
    ];

    const { stdout, stderr } = await execFileAsync("ssh", sshArgs, {
      maxBuffer: 10 * 1024 * 1024,
    });

    return { success: true, output, logs };
  } catch (error) {
    const errorLog = `[SSH Error] ${error.message}`;
    logs.push(errorLog);
    return {
      success: false,
      error: errorLog,
      output: commandOutput,
      logs,
    };
  }
}
```

### Layer 5: Docker Compose Deployment Errors

**File:** `backend/src/services/ec2AutomatedDeploymentService.js` (Lines 240-300)

```javascript
// Error on compose creation
const composeResult = await this.executeSshCommand(
  `cat > ~/devops-app/docker-compose.yml << 'EOF'\n${composeYaml}\nEOF`,
  config,
  logs
);
if (!composeResult.success) {
  throw new Error(`Failed to create docker-compose.yml: ${composeResult.error}`);
}

// Error on image pull
const pullResult = await this.executeSshCommand(
  `docker pull ${dockerImage}`,
  config,
  logs
);
if (!pullResult.success) {
  throw new Error(`Failed to pull Docker image: ${pullResult.error}`);
}

// Error on container start
const upResult = await this.executeSshCommand(
  `cd ~/devops-app && docker compose -p app up -d`,
  config,
  logs
);
if (!upResult.success) {
  throw new Error(`Failed to start containers: ${upResult.error}`);
}
```

### Layer 6: Orchestration-level Error Handling

**File:** `backend/src/services/deploymentOrchestrationService.js` (Lines 50-300)

```javascript
async executeFullAutomatedDeployment(webhookData) {
  const startTime = Date.now();
  const logs = [];
  const deploymentId = `deploy-${Date.now()}`;

  try {
    // Step 1: Clone repository
    logs.push("📥 Step 1: Cloning repository from GitHub...");
    const cloneResult = await this.cloneRepository(webhookData.repository.clone_url);
    if (!cloneResult.success) {
      throw new Error(`Failed to clone repository: ${cloneResult.error}`);
    }
    
    // Step 2-10: Each step with error throwing
    // ... (skipped for brevity)

    // Success path
    logs.push(`✅ Deployment successful!`);
    emitDeploymentSucceeded({
      deploymentId,
      containerName,
      deploymentUrl: deployResult.deploymentUrl,
      deploymentIp: deployResult.deploymentIp,
    });

    return {
      success: true,
      deploymentId,
      duration: Date.now() - startTime,
      logs,
    };
  } catch (error) {
    // Failure path
    console.error("❌ Automated deployment failed:", error.message);
    logs.push(`❌ Error: ${error.message}`);

    await createAlert({
      type: "deployment",
      severity: "critical",
      title: "Automated Deployment Failed",
      message: `Deployment failed: ${error.message}`,
    });

    emitDeploymentFailed({
      deploymentId,
      error: error.message,
    });

    return {
      success: false,
      deploymentId,
      error: error.message,
      duration: Date.now() - startTime,
      logs,
    };
  } finally {
    // Cleanup regardless of success/failure
    try {
      await this.cleanupWorkspace();
    } catch (cleanupError) {
      console.warn("⚠️ Warning during cleanup:", cleanupError.message);
    }
  }
}
```

### Layer 7: Socket Events for Real-time Feedback

**File:** `backend/src/services/socketEventsService.js`

```javascript
emitDeploymentStarted(data)        // Deployment begins
emitDeploymentProgress(data)       // Each stage: 20%, 40%, 60%, 75%, 95%
emitDeploymentSucceeded(data)      // Deployment successful
emitDeploymentFailed(data)         // Deployment failed

emitDockerPushStarted(data)        // Docker push begins
emitDockerPushLog(data)            // Individual push log entry
emitDockerPushCompleted(data)      // Push complete/failed
```

---

## Environment Variables

### Required Environment Variables

**Location:** `.env` file in backend root

```env
# ============ JENKINS ============
JENKINS_URL=http://jenkins:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=<jenkins-api-token>
JENKINS_USER=admin
JENKINS_JOB_NAME=devops-hub-deploy
JENKINS_AUTO_CREATE_JOB=true

# ============ DOCKER REGISTRY ============
DOCKER_REGISTRY=docker.io
DOCKER_REGISTRY_USERNAME=<docker-hub-username>
DOCKER_REGISTRY_PASSWORD=<docker-hub-access-token>

# ============ CONTAINER PORTS ============
CONTAINER_PORT=3000
HOST_PORT=3000
DEPLOYMENT_TIMEOUT=1800000    # 30 minutes
POLL_INTERVAL=5000            # 5 seconds

# ============ AWS EC2 ============
AWS_EC2_HOST=<ec2-instance-ip>
AWS_EC2_USER=ubuntu
AWS_EC2_PORT=22
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<aws-key>
AWS_SECRET_ACCESS_KEY=<aws-secret>

# ============ GITHUB ============
GITHUB_TOKEN=<personal-access-token>
```

### Docker Hub Credentials Storage

**Location:** MongoDB `users` collection, field: `dockerHub`

```javascript
{
  dockerHub: {
    connected: true,
    username: "docker-hub-username",
    encryptedAccessToken: "<encrypted>",
    tokenIv: "<iv>",
    tokenAuthTag: "<authTag>",
    connectedAt: "2026-06-15T10:00:00Z",
    lastValidatedAt: "2026-06-15T10:00:00Z",
    permissions: {
      login: true,
      push: true
    }
  }
}
```

**Encryption:** All secrets encrypted using `credentialEncryptionService.js`

### Jenkins Credentials Storage

**Location:** MongoDB `users` collection, field: `jenkins`

```javascript
{
  jenkins: {
    connected: true,
    url: "http://jenkins:8080",
    username: "admin",
    encryptedApiToken: "<encrypted>",
    tokenIv: "<iv>",
    tokenAuthTag: "<authTag>",
    connectedAt: "2026-06-15T10:00:00Z",
    permissions: {
      reachable: true,
      authenticated: true,
      read: true,
      jobRead: true,
      nodeRead: true
    }
  }
}
```

---

## Quick Reference Map

### File Location Reference

| Purpose | File | Key Lines | Function |
|---------|------|-----------|----------|
| Deployment Orchestration | `deploymentOrchestrationService.js` | 50-300 | `executeFullAutomatedDeployment()` |
| Jenkins Job Creation | `jenkinsJobService.js` | 1-500 | `createJenkinsJob()` |
| Jenkinsfile Generation | `jenkinsfileGeneratorService.js` | 1-450 | `generateJenkinsfile()` |
| Pipeline Generation | `jenkinsPipelineGeneratorService.js` | 1-800 | `previewJenkinsPipeline()` |
| Docker Hub Connect | `dockerHubRegistryService.js` | 1-200 | `connectDockerHub()` |
| Docker Hub Push | `dockerHubPushService.js` | 60-250 | `pushImageToDockerHub()` |
| Docker Service | `dockerService.js` | 1-300 | `buildImage()`, `deployContainer()` |
| EC2 Deployment | `ec2AutomatedDeploymentService.js` | 201-400 | `deployToEc2()` |
| Build Automation | `deploymentAutomationService.js` | 1-450 | `buildDockerImage()`, `pushDockerImage()` |

### Credentials Used Per Component

| Component | GitHub | Jenkins | Docker Hub | AWS EC2 |
|-----------|--------|---------|-----------|---------|
| Clone Repo | ✅ Token | - | - | - |
| Create Job | - | ✅ Username + API Token | - | - |
| Build Image | - | ✅ (Jenkinsfile) | - | - |
| Push to Hub | - | ✅ (Jenkinsfile) | ✅ docker-hub-credentials | - |
| Deploy to EC2 | - | - | - | ✅ SSH Key |
| Health Check | - | - | - | ✅ SSH User |

### Pipeline Stages & BUILD_NUMBER Usage

```
Checkout (BUILD_NUMBER available but not used)
    ↓
Install Dependencies (BUILD_NUMBER available but not used)
    ↓
Lint (BUILD_NUMBER available but not used)
    ↓
Build (BUILD_NUMBER available but not used)
    ↓
Test (BUILD_NUMBER available but not used)
    ↓
Build Docker Image ← ✅ USES BUILD_NUMBER: docker build -t app:${BUILD_NUMBER}
    ↓
Push Docker Image ← ✅ USES BUILD_NUMBER: docker push app:${BUILD_NUMBER}
    ↓
Deploy to EC2 ← ✅ USES full image tag with BUILD_NUMBER from Docker Hub
    ↓
Health Check (BUILD_NUMBER available but not used)
```

### Error Handling Cascade

```
Jenkins Connection Error
    └─ classifyJenkinsRootCause() [jenkinsJobService.js:100]
       ├─ 401: authentication issue
       ├─ 403: missing crumb
       ├─ 404: bad endpoint
       └─ ECONNREFUSED: Jenkins not running

Docker Build Error
    └─ buildDockerImage() [deploymentAutomationService.js:120]
       └─ Throws: Docker build failed

Docker Push Error
    └─ pushDockerImage() [deploymentAutomationService.js:220]
       ├─ Repository creation: Non-blocking warning
       ├─ Image push: Throws on failure
       └─ Falls back to local deployment if warning

EC2 SSH Error
    └─ testSshConnection() [ec2AutomatedDeploymentService.js:110]
       ├─ Retry up to 20 times
       ├─ 15-second delays between retries
       └─ Throws after maxAttempts

EC2 Deployment Error
    └─ deployToEc2() [ec2AutomatedDeploymentService.js:201]
       ├─ Compose creation failed: Throws
       ├─ Image pull failed: Throws
       └─ Container start failed: Throws

Orchestration Level
    └─ executeFullAutomatedDeployment() [deploymentOrchestrationService.js:50]
       ├─ Any step fails: Throw
       ├─ Create alert: severity: "critical"
       ├─ Emit: emitDeploymentFailed()
       └─ Finally: cleanupWorkspace()
```

---

## Summary

This deployment workflow maps the complete flow from GitHub push to running container on EC2:

1. **Docker images built** with BUILD_NUMBER tagging in Jenkins (build stage)
2. **Jenkins credentials** used for job creation and CI/CD pipeline execution
3. **Docker Hub integration** via API for validation, repo creation, and image push
4. **Images deployed** from Docker Hub via SSH to EC2 using docker-compose
5. **BUILD_NUMBER** used for unique image versioning throughout the pipeline
6. **Error handling** implemented at 7 layers with graceful degradation

All credentials are encrypted in the database, and the system provides comprehensive logging and real-time feedback via Socket.io events.

---

**Document Version:** 1.0  
**Last Updated:** June 15, 2026  
**Status:** Complete Analysis
