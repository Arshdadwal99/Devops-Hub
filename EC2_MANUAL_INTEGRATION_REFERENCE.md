# EC2 Manual Integration - Complete Reference

## Executive Summary

The EC2 manual integration system allows users to connect an existing EC2 instance for SSH-based application deployment. It validates SSH connectivity, Docker installation, storage, memory, and port availability before enabling automated deployments.

---

## Key Terms & Component References

### 1. **ec2Connected** (Setup State Flag)
**Purpose:** Boolean flag indicating whether EC2 has been successfully connected and validated.

**References:**
- [backend/src/services/workflowStateService.js:188](backend/src/services/workflowStateService.js#L188) - Stores in setup object
- [backend/src/services/workflowStateService.js:197](backend/src/services/workflowStateService.js#L197) - Calculated from validation results
- [backend/src/services/workflowStateService.js:293](backend/src/services/workflowStateService.js#L293) - Determined by running instances or validation
- [backend/src/services/workflowStateService.js:304](backend/src/services/workflowStateService.js#L304) - Added to response object
- [backend/src/services/workflowStateService.js:329](backend/src/services/workflowStateService.js#L329) - Persisted in database
- [backend/src/services/workflowStateService.js:338](backend/src/services/workflowStateService.js#L338) - Used to determine auto-deploy eligibility
- [backend/src/routes/deploymentRoutes.js:997](backend/src/routes/deploymentRoutes.js#L997) - Checked in setup validation
- [backend/src/routes/deploymentRoutes.js:1096](backend/src/routes/deploymentRoutes.js#L1096) - Validated before connect_ec2 action
- [backend/src/routes/deploymentRoutes.js:1121](backend/src/routes/deploymentRoutes.js#L1121) - Required for auto_deploy action

**State Persistence:**
```javascript
setup.ec2Connected = resources.actual.ec2Connected  // Boolean
```

---

### 2. **requiresEC2Connection** (NOT FOUND - Not Implemented)
**Status:** This term does not appear in the codebase. Instead, EC2 requirements are checked through:
- `ec2ValidationPassed(ec2.status)`
- `!existingDeployment.setup?.ec2Connected`

---

### 3. **missingIntegration === 'ec2'**
**Purpose:** EC2 is tracked as a missing integration when validation fails in the one-click deployment flow.

**References:**

**Frontend:**
- [frontend/src/components/OneClickDeploymentFlow.jsx:81-82](frontend/src/components/OneClickDeploymentFlow.jsx#L81-L82) - Checks missingIntegrations array
- [frontend/src/components/SetupWizard.jsx:46](frontend/src/components/SetupWizard.jsx#L46) - EC2 defined as integration with id: "ec2"
- [frontend/src/components/SetupWizard.jsx:51](frontend/src/components/SetupWizard.jsx#L51) - "Connect EC2" action text

**Backend:**
- [backend/src/services/workflowOrchestrationService.js:155-165](backend/src/services/workflowOrchestrationService.js#L155-L165) - Builds missingIntegrations array when `ec2ValidationPassed()` fails

**Logic:**
```javascript
const validations = {
  github: Boolean(githubConnected && repositoryExists),
  dockerhub: Boolean(dockerHub.status?.connected && permissions),
  jenkins: jenkinsValidationPassed(jenkins.status),
  aws: Boolean(awsConnection),
  ec2: ec2ValidationPassed(ec2.status)  // EC2 validation
};

const missingIntegrations = Object.entries(validations)
  .filter(([, ready]) => !ready)
  .map(([key]) => key);  // 'ec2' added to array if validation fails
```

---

### 4. **ConnectEC2** (UI Component/Action Text)
**Purpose:** User-facing action to connect an EC2 instance.

**References:**
- [frontend/src/components/SetupWizard.jsx:51](frontend/src/components/SetupWizard.jsx#L51) - Action text: "Connect EC2"
- [frontend/src/components/SetupWizard.jsx:49](frontend/src/components/SetupWizard.jsx#L49) - Icon: "EC2"
- [frontend/src/pages/Integrations.jsx:160-163](frontend/src/pages/Integrations.jsx#L160-L163) - Button navigates to "/ec2/connect"
- [frontend/src/App.jsx:87-88](frontend/src/App.jsx#L87-L88) - Route: "/ec2/connect" → `<Ec2Connection />`

---

### 5. **EC2Setup** (Setup Tracking)
**Purpose:** Tracks EC2 setup progress in deployment workflow.

**References:**
- [backend/src/services/workflowStateService.js:188-250](backend/src/services/workflowStateService.js#L188-L250) - `calculateAutoDeployValidationState()` function
  - `stored.ec2Connected` - Previously stored state
  - `validation.ec2Connected` - Current validation result
  - Requirement row for "EC2 Connected"

- [backend/src/routes/deploymentRoutes.js:1090-1140](backend/src/routes/deploymentRoutes.js#L1090-L1140) - Setup action handlers
  - `action === "connect_ec2"` maps to field: `ec2Connected`
  - Validation: EC2 must pass `ec2ValidationPassed()`

**Workflow Stage:**
```javascript
const setupAction = {
  field: "ec2Connected",
  stage: "EC2_CONNECTED",
  log: "EC2 deployment target connected for pipeline SSH"
};
```

---

### 6. **EC2Wizard** (Not Explicitly Named)
**Actual Component:** [frontend/src/pages/Ec2Connection.jsx](frontend/src/pages/Ec2Connection.jsx)

**Purpose:** Main UI page for connecting EC2 instances.

**Key Features:**
- Load current EC2 connection status
- Form for EC2 details: host, username, private key, app port
- Real-time validation with 6 checks:
  1. SSH Access
  2. Docker Installed
  3. Docker Daemon Running
  4. Storage Available (≥2GB)
  5. Memory Available (≥256MB)
  6. Port Available
- Server information display (OS, CPU, RAM, Docker version, disk)
- Connection management (update, disconnect)

**Related UI:**
- [frontend/src/pages/Integrations.jsx:142-163](frontend/src/pages/Integrations.jsx#L142-L163) - EC2 Integration Card showing status
- [frontend/src/components/SetupWizard.jsx:46-51](frontend/src/components/SetupWizard.jsx#L46-L51) - EC2 in integration list

---

## Files Related to EC2 Connection/Setup

### Frontend Files
1. **[frontend/src/pages/Ec2Connection.jsx](frontend/src/pages/Ec2Connection.jsx)** (411 lines)
   - Main EC2 connection management page
   - Form validation and SSH credential input
   - Real-time validation checks
   - Status display and diagnostics

2. **[frontend/src/pages/Integrations.jsx](frontend/src/pages/Integrations.jsx)**
   - Integration overview dashboard
   - EC2 status card with "Connect" button
   - Links to Ec2Connection page

3. **[frontend/src/components/SetupWizard.jsx](frontend/src/components/SetupWizard.jsx)**
   - Step-by-step integration setup wizard
   - EC2 included as one of 5 required integrations
   - Modal UI for guided setup

4. **[frontend/src/components/OneClickDeploymentFlow.jsx](frontend/src/components/OneClickDeploymentFlow.jsx)**
   - One-click deployment validation
   - Shows SetupWizard when EC2 (or other integrations) missing
   - Validation result handling

5. **[frontend/src/lib/api.js](frontend/src/lib/api.js)**
   - API client functions:
     - `connectEc2(host, username, privateKey, port)` - POST /ec2/connect
     - `getEc2Status()` - GET /ec2/status
     - `disconnectEc2()` - POST /ec2/disconnect
     - `testEc2Connection(payload)` - POST /ec2/test

### Backend Files
1. **[backend/src/routes/ec2Routes.js](backend/src/routes/ec2Routes.js)** (18 lines)
   - Route definitions for EC2 endpoints
   - POST /ec2/connect → connectEc2Handler
   - GET /ec2/status → getEc2StatusHandler
   - POST /ec2/disconnect → disconnectEc2Handler
   - POST /ec2/test → testEc2Handler

2. **[backend/src/controllers/ec2Controller.js](backend/src/controllers/ec2Controller.js)** (100+ lines)
   - `connectEc2Handler()` - Processes EC2 connection request
   - `getEc2StatusHandler()` - Returns current EC2 status
   - `disconnectEc2Handler()` - Removes EC2 connection
   - `testEc2Handler()` - Validates existing connection
   - Calls ec2ConnectionService functions

3. **[backend/src/services/ec2ConnectionService.js](backend/src/services/ec2ConnectionService.js)** (600+ lines)
   - Core EC2 validation logic
   - `validateEc2Connection()` - Full validation suite
   - `connectEc2()` - Save connection and validate
   - `disconnectEc2()` - Remove saved connection
   - `testSavedEc2Connection()` - Test saved credentials
   - `getEc2Status()` - Fetch user's EC2 status
   - `ec2ValidationPassed()` - Check if all validations pass
   - SSH execution (Windows & Unix)
   - 6 validation checks: SSH, Docker, Storage, Memory, Port
   - Error classification and diagnostics

4. **[backend/src/routes/deploymentRoutes.js](backend/src/routes/deploymentRoutes.js)** (1200+ lines)
   - POST /deployments/setup/:deploymentId with action="connect_ec2"
   - Validates EC2 before allowing deployment progression
   - Checks: `!existingDeployment.setup?.ec2Connected && !ec2ValidationPassed(ec2.status)`

5. **[backend/src/services/workflowOrchestrationService.js](backend/src/services/workflowOrchestrationService.js)**
   - `validateIntegrations()` - Checks all 5 integrations including EC2
   - Returns missingIntegrations array
   - EC2 validation via `ec2ValidationPassed(ec2.status)`

6. **[backend/src/services/workflowStateService.js](backend/src/services/workflowStateService.js)** (400+ lines)
   - `calculateAutoDeployValidationState()` - Builds requirement rows
   - `calculateActualWorkflowResources()` - Checks EC2 connection status
   - `recalculateDeploymentWorkflowState()` - Updates setup state
   - EC2 requirement tracking and workflow progression

7. **[backend/src/services/automatedSetupService.js](backend/src/services/automatedSetupService.js)**
   - Uses `ec2ValidationPassed()` in setup validation

---

## UI Components Showing EC2 as Missing Integration

### 1. **SetupWizard Component** ([frontend/src/components/SetupWizard.jsx](frontend/src/components/SetupWizard.jsx))

**Integration Definition:**
```javascript
{
  id: "ec2",
  name: "EC2",
  description: "Connect an EC2 host for application deployment",
  icon: "EC2",
  requiredFor: "Deployment target",
  actionText: "Connect EC2",
  route: "/integrations",
}
```

**Display Logic:**
- Shows when EC2 is in `missingIntegrations` array
- Modal with step-by-step wizard
- "Connect EC2" button navigates to `/ec2/connect`
- Progress indicator shows step number and total steps

### 2. **OneClickDeploymentFlow Component** ([frontend/src/components/OneClickDeploymentFlow.jsx](frontend/src/components/OneClickDeploymentFlow.jsx))

**Flow:**
1. User initiates one-click deployment
2. Calls POST /deployment/one-click-validate
3. Backend returns `validationResult.missingIntegrations`
4. If EC2 in array: `setShowSetupWizard(true)` + `setStatus("setup-required")`
5. SetupWizard displays

### 3. **Integrations Page** ([frontend/src/pages/Integrations.jsx](frontend/src/pages/Integrations.jsx))

**EC2 Card Display:**
```jsx
<h3>AWS EC2</h3>
{ec2Ready(ec2Status)
  ? "Validated"
  : ec2Status?.connected ? "Needs test" : "Not connected"}
```

**Status States:**
- **Validated**: All 6 checks passed
- **Needs test**: Connected but validation incomplete
- **Not connected**: No credentials saved

---

## Validation Logic & Checking for EC2 Connection

### Backend Validation Function: `ec2ValidationPassed()`

**Location:** [backend/src/services/ec2ConnectionService.js](backend/src/services/ec2ConnectionService.js#L115)

**Definition:**
```javascript
export function ec2ValidationPassed(status) {
  return Boolean(
    status?.validation?.ssh &&
    status?.validation?.dockerInstalled &&
    status?.validation?.dockerRunning &&
    status?.validation?.diskSpace &&
    status?.validation?.memory &&
    status?.validation?.portAvailable
  );
}
```

**Returns:** `true` only if ALL 6 checks pass

### Frontend Validation Function: `ec2Ready()`

**Location:** [frontend/src/pages/Ec2Connection.jsx:397](frontend/src/pages/Ec2Connection.jsx#L397)

**Definition:**
```javascript
function ec2Ready(status) {
  const validation = status?.validation || {};
  return Boolean(
    status?.connected &&
    validation.ssh &&
    validation.dockerInstalled &&
    validation.dockerRunning &&
    validation.diskSpace &&
    validation.memory &&
    validation.portAvailable
  );
}
```

**Also used in:** [frontend/src/pages/Integrations.jsx:280](frontend/src/pages/Integrations.jsx#L280)

### 6-Point Validation Checklist

**Location:** [backend/src/services/ec2ConnectionService.js:500+](backend/src/services/ec2ConnectionService.js#L500)

| Check | Label | Purpose | Minimum Requirement |
|-------|-------|---------|-------------------|
| 1 | SSH Access | SSH connectivity test | Successful connection |
| 2 | Docker Installed | Docker CLI available | `docker --version` works |
| 3 | Docker Daemon | Docker daemon running | `docker ps` succeeds |
| 4 | Storage Available | Disk space check | ≥2GB free (MIN_DISK_AVAILABLE_GB) |
| 5 | Memory Available | RAM check | ≥256MB free (MIN_MEMORY_AVAILABLE_MB) |
| 6 | Port Available | App port check | Port specified (default 3000) is available or Docker-mapped |

**Validation Flow:**
```
User Input (host, username, key, port)
    ↓
SSH Connection Test
    ↓
Parallel Checks (if SSH OK):
  ├─ Docker installed?
  ├─ Docker running?
  ├─ Storage ≥2GB?
  ├─ Memory ≥256MB?
  ├─ Port available/Docker-mapped?
  └─ Get server info (OS, CPU, RAM, Docker version)
    ↓
All Pass? → ec2Connected = true
    ↓
Stored in User record + returned to frontend
```

---

## Current Deployment Flow with EC2

### 5-Phase Automated Deployment Workflow

**Location:** [backend/src/services/workflowOrchestrationService.js:1-60](backend/src/services/workflowOrchestrationService.js#L1-L60)

#### Phase 1: VALIDATION (Steps 1-5)
- ✅ Step 1: VALIDATE_GITHUB_CONNECTION
- ✅ Step 2: VALIDATE_DOCKER_CONNECTION
- ✅ Step 3: VALIDATE_JENKINS_CONNECTION
- ✅ Step 4: VALIDATE_AWS_CONNECTION
- ✅ Step 5: VERIFY_REPOSITORY_ACCESS

**EC2 Validation:** Done in workflowOrchestrationService → validateIntegrations()

#### Phase 2: INFRASTRUCTURE (Steps 6-10)
- ⚙️ Step 6: **CHECK_EC2_INSTANCE** ← EC2 Manual Integration checks here
- ⚙️ Step 7: PROVISION_EC2_IF_NEEDED (or use existing manual connection)
- ⚙️ Step 8: INSTALL_DOCKER_ON_EC2
- ⚙️ Step 9: VALIDATE_DOCKER_ENGINE
- ⚙️ Step 10: SETUP_DEPLOYMENT_WORKSPACE

#### Phase 3: CI/CD SETUP (Steps 11-18)
- 📝 Step 11: GENERATE_DOCKERFILE
- 📝 Step 12: GENERATE_CICD_PIPELINE
- 📝 Step 13: CREATE_JENKINS_JOB
- 📝 Step 14: SETUP_GITHUB_WEBHOOK
- 📝 Step 15: UPLOAD_PIPELINE_FILES
- 📝 Step 16: VALIDATE_JENKINS_JOB
- 📝 Step 17: TEST_WEBHOOK_TRIGGER
- 📝 Step 18: VERIFY_CI_CD_CHAIN

#### Phase 4: DEPLOYMENT (Steps 19-24)
- 🚀 Step 19: CLONE_REPOSITORY
- 🚀 Step 20: BUILD_DOCKER_IMAGE
- 🚀 Step 21: PUSH_TO_REGISTRY
- 🚀 Step 22: **PULL_IMAGE_ON_EC2** ← Uses EC2 connection
- 🚀 Step 23: DEPLOY_CONTAINER
- 🚀 Step 24: VERIFY_APPLICATION

#### Phase 5: AUTO-DEPLOY (Steps 25-26)
- 🔄 Step 25: ENABLE_AUTO_TRIGGERS
- 🔄 Step 26: VERIFY_AUTO_DEPLOY

### EC2 in Setup Workflow

**Location:** [backend/src/routes/deploymentRoutes.js:1090-1140](backend/src/routes/deploymentRoutes.js#L1090-L1140)

**Setup Action Mapping:**
```javascript
{
  action: "connect_ec2",
  field: "ec2Connected",
  stage: "EC2_CONNECTED",
  log: "EC2 deployment target connected for pipeline SSH"
}
```

**Validation Before Action:**
```javascript
if (action === "connect_ec2" || action === "enable_auto_deploy") {
  const ec2 = await getEc2Status(userId);
  if (!existingDeployment.setup?.ec2Connected && 
      !ec2ValidationPassed(ec2.status)) {
    return res.status(409).json({
      error: "EC2 must be connected and pass SSH, Docker, storage, memory, and port validation"
    });
  }
}
```

**Prerequisites for Enable Auto Deploy:**
- ✅ `setup.dockerHubConnected` = true
- ✅ `setup.ec2Connected` = true
- ✅ `setup.jenkinsConnected` = true
- ✅ `setup.cicdGenerated` = true

---

## EC2 Status Object Structure

### Returned by `getEc2Status(userId)`

**Location:** [backend/src/services/ec2ConnectionService.js:100+](backend/src/services/ec2ConnectionService.js#L100)

```javascript
{
  status: {
    connected: Boolean,           // EC2 credentials saved
    host: String,                 // Public IP or hostname
    username: String,             // SSH user (e.g., "ubuntu", "ec2-user")
    connectedAt: Date,           // When first connected
    lastValidatedAt: Date,       // Last successful validation
    serverInfo: {                // Retrieved during validation
      os: String,                // "Linux", "Ubuntu 20.04 LTS"
      cpu: String,              // CPU info
      ram: String,              // "15.6 GB"
      dockerVersion: String,    // "20.10.12"
      diskUsage: String,        // "/dev/xvda1: 45%"
      diskAvailableGb: Number   // Free disk in GB
    },
    validation: {                // All 6 checks
      ssh: Boolean,              // SSH connectivity
      dockerInstalled: Boolean,  // Docker CLI available
      dockerRunning: Boolean,    // Docker daemon running
      diskSpace: Boolean,        // ≥2GB available
      memory: Boolean,           // ≥256MB available
      portAvailable: Boolean     // App port free/Docker-mapped
    },
    validationErrors: [],        // Array of error messages
    failedCheck: String|null,    // Which check failed (if any)
    logs: []                     // Validation execution logs
  }
}
```

---

## API Endpoints for EC2 Management

### Frontend API Client Functions

**Location:** [frontend/src/lib/api.js:333-350](frontend/src/lib/api.js#L333-L350)

#### 1. Connect EC2
```javascript
connectEc2(host, username, privateKey, port = 3000)
  → POST /api/ec2/connect
  → Request: { host, username, privateKey, port }
  → Response: { success, status: { connected, ... } }
```

#### 2. Get EC2 Status
```javascript
getEc2Status()
  → GET /api/ec2/status
  → Response: { status: { connected, validation, ... } }
```

#### 3. Disconnect EC2
```javascript
disconnectEc2()
  → POST /api/ec2/disconnect
  → Response: { status: { connected: false, ... } }
```

#### 4. Test EC2 Connection
```javascript
testEc2Connection(payload = {})
  → POST /api/ec2/test
  → Request: { port, host?, username?, privateKey? }
  → Response: { success, status, test: { validation, ... } }
```

### Backend Route Definitions

**Location:** [backend/src/routes/ec2Routes.js](backend/src/routes/ec2Routes.js)

```javascript
router.post("/connect", connectEc2Handler);      // Connect new/update
router.get("/status", getEc2StatusHandler);      // Get current status
router.post("/disconnect", disconnectEc2Handler); // Remove connection
router.post("/test", testEc2Handler);           // Validate connection
```

---

## Error Handling & Normalization

### Frontend Error Normalization

**Function:** `normalizeEc2Failure()`
**Location:** [frontend/src/pages/Ec2Connection.jsx:376-395](frontend/src/pages/Ec2Connection.jsx#L376-L395)

**Purpose:** Normalize server response errors into consistent status object

```javascript
function normalizeEc2Failure(payload = {}, fallback = {}) {
  const test = payload.test || payload;
  return {
    status: {
      ...EMPTY_STATUS,
      ...fallback,
      host: test.host || fallback.host,
      username: test.username || fallback.username,
      serverInfo: test.serverInfo,
      validation: test.validation || EMPTY_STATUS.validation,
      validationErrors: test.validationErrors || [],
      failedCheck: test.failedCheck,
      logs: test.logs || [],
      checkResults: test.checkResults || {}
    },
    message: formatFailureMessage({ ...payload, ...test })
  };
}
```

### Error Classification

**Function:** `classifySshError()`
**Location:** [backend/src/services/ec2ConnectionService.js:60-85](backend/src/services/ec2ConnectionService.js#L60-L85)

**Error Types Classified:**
1. SSH authentication failed → Check username and private key
2. SSH private key invalid → Confirm PEM/OpenSSH format
3. SSH connection timeout → Check EC2 public IP and security group
4. SSH network connection failed → Check instance state and network ACLs
5. EC2 host could not be resolved → Check public IP or DNS name

---

## Integration Test & Diagnostics

### Port Availability Diagnostic

**Function:** `buildPortDiagnosticsCommand()`
**Location:** [backend/src/services/ec2ConnectionService.js:520+](backend/src/services/ec2ConnectionService.js#L520)

**Purpose:** Check if app port is available, Docker-mapped, or in use

**Logic:**
1. Check if port has listeners
2. Check if Docker container is using it
3. Allow if: free OR Docker-mapped OR allowed process (node, docker, python, etc.)
4. Reject if: occupied by unrelated process

**Environment Variable:** `EC2_ALLOWED_APP_PORT_PROCESS_REGEX`
- Default: `/docker|node|npm|pm2|python|uvicorn|gunicorn|java/i`
- Customizable regex for allowed processes

---

## Database Schema for EC2

### User Model - EC2 Field

**Structure:**
```javascript
user.ec2 = {
  connected: Boolean,
  host: String,
  username: String,
  privateKey: String,        // Encrypted before storage
  port: Number,              // App port
  connectedAt: Date,
  lastValidatedAt: Date,
  validation: {
    ssh: Boolean,
    dockerInstalled: Boolean,
    dockerRunning: Boolean,
    diskSpace: Boolean,
    memory: Boolean,
    portAvailable: Boolean
  },
  serverInfo: {
    os: String,
    cpu: String,
    ram: String,
    dockerVersion: String,
    diskUsage: String,
    diskAvailableGb: Number
  },
  validationErrors: [String],
  failedCheck: String,
  logs: [String]
}
```

### Deployment Model - EC2 References

**Structure:**
```javascript
deployment.setup = {
  ec2Connected: Boolean,        // Whether EC2 passed validation
  ec2Host: String,             // EC2 public IP or hostname
  ec2Username: String,         // SSH user
  // ... other setup fields
}
```

---

## Summary of Implementation

### What Works
✅ EC2 manual connection (SSH credentials)
✅ 6-point validation (SSH, Docker, Storage, Memory, Port)
✅ Error diagnosis and classification
✅ Status tracking and persistence
✅ SetupWizard integration
✅ OneClickDeployment validation
✅ Auto-deploy prerequisite checking
✅ Windows and Unix SSH support

### Missing/Not Implemented
❌ `requiresEC2Connection` - Doesn't exist (uses `ec2ValidationPassed` instead)
❌ Automatic EC2 provisioning - Manual connection only
❌ EC2 instance listing - No API to list available instances
❌ Auto-remediation - User must fix validation errors manually

### Configuration Options
- `EC2_ALLOWED_APP_PORT_PROCESS_REGEX` - Customize allowed processes on app port
- `AWS_EC2_HOST` - Environment variable for EC2 host (deployment)
- `AWS_EC2_KEY_PATH` - Environment variable for SSH key path (deployment)
- `DEFAULT_APP_PORT` - Default: 3000

---

## Complete File Reference List

### Frontend (8 files)
1. frontend/src/pages/Ec2Connection.jsx
2. frontend/src/pages/Integrations.jsx
3. frontend/src/pages/AWSInfrastructureProvisioning.jsx
4. frontend/src/pages/AWSInstanceDetails.jsx
5. frontend/src/pages/AWSInfrastructureManagement.jsx
6. frontend/src/pages/AWSConnection.jsx
7. frontend/src/components/SetupWizard.jsx
8. frontend/src/components/OneClickDeploymentFlow.jsx
9. frontend/src/lib/api.js
10. frontend/src/App.jsx (routing)

### Backend (8 files)
1. backend/src/routes/ec2Routes.js
2. backend/src/controllers/ec2Controller.js
3. backend/src/services/ec2ConnectionService.js (600+ lines)
4. backend/src/services/ec2DeploymentService.js
5. backend/src/services/ec2AutomatedDeploymentService.js
6. backend/src/services/ec2IntelligentProvisioningService.js
7. backend/src/routes/deploymentRoutes.js (1200+ lines)
8. backend/src/services/workflowOrchestrationService.js
9. backend/src/services/workflowStateService.js (400+ lines)
10. backend/src/services/automatedSetupService.js

### Configuration/Documentation
- AWS_EC2_AUTOMATED_SETUP.md
- AWS_INFRASTRUCTURE_PROVISIONING.md
- AUTOMATED_DEPLOYMENT_START_HERE.md
- AUTOMATED_DEPLOYMENT_IMPLEMENTATION_COMPLETE.md

---

## Key Takeaway

The EC2 manual integration is a **connection-and-validation system** that:
1. Accepts SSH credentials (host, username, private key)
2. Validates connectivity and environment (6 checks)
3. Stores encrypted credentials
4. Blocks deployment progression until validated
5. Integrates into the 5-phase automated deployment workflow
6. Shows missing EC2 in SetupWizard if validation fails
7. Requires EC2 validation before enabling auto-deploy triggers

Users manually connect an existing EC2 instance rather than provisioning new instances through the dashboard.
