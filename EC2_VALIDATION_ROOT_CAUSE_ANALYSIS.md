# EC2 Validation - Root Cause Analysis & Debugging Guide

## Overview

This document provides complete tracing of the EC2 validation flow with detailed logging at every step to identify the exact failure point.

## Complete Execution Flow

```
Frontend (Ec2Connection.jsx)
    ↓ handleConnect() / handleTestSaved()
    ↓ 
API Call (lib/api.js → POST /ec2/connect or /ec2/test)
    ↓
Controller (ec2Controller.js → connectEc2Handler() / testEc2Handler())
    ↓ [LOGS] Request Body logged
    ↓
Service (ec2ConnectionService.js → validateEc2Connection())
    ↓ [LOGS] === EC2 VALIDATION START ===
    ↓ [LOGS] Platform detected, SSH method selected
    ↓ [LOGS] Input validation
    ↓
SSH Authentication (runSshCommand)
    ├─ Windows → runSshCommandWindows (ssh2 library)
    │   ├─ [LOGS] Connecting to host
    │   ├─ [LOGS] Command: echo ssh-ok
    │   ├─ [LOGS] ✅ Connected or ❌ Connection failed
    │   └─ [LOGS] Command output received
    │
    └─ Unix → runSshCommandUnix (execFile ssh)
        ├─ [LOGS] Running ssh command
        ├─ [LOGS] stdout/stderr captured
        └─ [LOGS] Command completed
    ↓
Validation Checks (runCheck)
    ├─ SSH Connectivity
    │   ├─ [LOGS] [EC2 Validation] SSH connectivity: starting
    │   ├─ [LOGS] [EC2 Validation] Command: echo ssh-ok
    │   ├─ [LOGS] ✅ SSH connectivity: ok
    │   └─ [LOGS] logs array updated
    │
    ├─ Docker Installation
    │   ├─ [LOGS] [EC2 Validation] Docker installation: starting
    │   ├─ [LOGS] ❌ Docker installation: failed (if not installed)
    │   └─ [LOGS] Docker Result: {...}
    │
    ├─ Docker Daemon
    │   ├─ [LOGS] [EC2 Validation] Docker daemon status: starting
    │   ├─ [LOGS] [EC2 Validation] Command: docker info >/dev/null...
    │   └─ [LOGS] Docker Daemon Result: {...}
    │
    ├─ Disk Space
    ├─ Memory
    └─ Port Availability
    ↓
Result Compilation
    ├─ [LOGS] Validation: { ssh, dockerInstalled, dockerRunning, diskSpace, memory, portAvailable }
    ├─ [LOGS] Validation Errors: [...]
    ├─ [LOGS] Failed Check: [which check failed]
    ├─ [LOGS] Success: true/false
    └─ [LOGS] === EC2 VALIDATION END ===
    ↓
Response to Frontend
    ├─ Response Status: 200 (success) or 400 (failure)
    ├─ Response Body: { success, failedCheck, validationErrors, logs, checkResults, ... }
    └─ [LOGS] Response Body logged to console
    ↓
Frontend Rendering
    ├─ Display failedCheck
    ├─ Display validationErrors array
    ├─ Display logs array
    └─ Display checkResults details
```

## Backend Logs Location

All logs appear in your terminal where you ran `npm run dev` in the backend folder.

### Windows EC2 Logs

**SSH Connection Phase:**
```
[Windows SSH] Connecting to ubuntu@54.123.45.67:22
[Windows SSH] Command: echo ssh-ok
[Windows SSH] Timeout: 15000ms
[Windows SSH] ✅ Connected to ubuntu@54.123.45.67
[Windows SSH] ✅ Command completed
[Windows SSH] stdout: ssh-ok
```

**Validation Phase:**
```
=== EC2 VALIDATION START ===
Platform: win32
SSH authentication method: node-ssh (Windows)
Host: 54.123.45.67
Username: ubuntu
Port: 3000
Private Key Length: 1704

✅ Input validation passed

[EC2 Validation] SSH connectivity: starting
[EC2 Validation] Command: echo ssh-ok
[EC2 Validation] ✅ SSH connectivity: ok ssh-ok

SSH Result: { key: 'ssh', label: 'SSH connectivity', ok: true, ... }

[EC2 Validation] Docker installation: starting
[EC2 Validation] Command: if command -v docker >/dev/null...
[EC2 Validation] ✅ Docker installation: ok DOCKER_VERSION=Docker version 24.0.0...

Docker Installation Result: { key: 'dockerInstalled', ok: true, ... }

[EC2 Validation] Docker daemon status: starting
[EC2 Validation] ✅ Docker daemon status: ok DOCKER_RUNNING=true

Docker Daemon Result: { key: 'dockerRunning', ok: true, ... }

--- Validation Summary ---
Validation: {
  ssh: true,
  dockerInstalled: true,
  dockerRunning: true,
  diskSpace: true,
  memory: true,
  portAvailable: true
}
Validation Errors: []
Failed Check: null
Success: true
--- End Summary ---

=== EC2 VALIDATION END ===

EC2 Validation Result: {
  "success": true,
  "failedCheck": null,
  "host": "54.123.45.67",
  "username": "ubuntu",
  "serverInfo": { ... },
  "validation": { ssh: true, ... },
  "validationErrors": [],
  "logs": [ ... ],
  "checkResults": { ... }
}
```

## Failure Scenarios

### Scenario 1: SSH Authentication Failed

**Frontend Error:**
```
Failed check: ssh
SSH authentication failed
```

**Backend Logs to Check:**
```
=== EC2 VALIDATION START ===
...
[Windows SSH] ❌ Connection error: All configured authentication methods failed
```

**Root Causes:**
1. ❌ Invalid private key - doesn't match EC2 key
2. ❌ Wrong SSH username - not "ubuntu" or "ec2-user"
3. ❌ Wrong public IP - EC2 instance at different address
4. ❌ Security group rules - port 22 not open
5. ❌ EC2 instance stopped - not running

**How to Debug:**
1. Check "SSH Result" in logs - look for error message
2. Verify `Host: xxx` matches your EC2 public IP
3. Verify `Username: ubuntu` is correct SSH user
4. Test manual SSH: `ssh -i key.pem ubuntu@54.123.45.67`
5. Check EC2 security group allows inbound port 22

---

### Scenario 2: Docker Not Installed

**Frontend Error:**
```
Failed check: dockerInstalled
Docker is not installed or is not available to the SSH user.
```

**Backend Logs to Check:**
```
[EC2 Validation] Docker installation: starting
[EC2 Validation] Command: if command -v docker >/dev/null...
[EC2 Validation] ❌ Docker installation: failed
[EC2 Validation] Error: SSH command failed
Docker Installation Result: { ok: false, output: "DOCKER_VERSION=missing", exitCode: 127 }
```

**Root Causes:**
1. ❌ Docker not installed on EC2
2. ❌ Docker in non-standard PATH
3. ❌ SSH user doesn't have Docker in PATH

**How to Debug:**
```bash
ssh -i key.pem ubuntu@54.123.45.67
which docker
docker --version
```

---

### Scenario 3: Docker Daemon Not Running

**Frontend Error:**
```
Failed check: dockerRunning
Docker daemon is not running or the SSH user does not have permission to access Docker.
```

**Backend Logs to Check:**
```
[EC2 Validation] Docker daemon status: starting
[EC2 Validation] Command: docker info >/dev/null 2>&1...
[EC2 Validation] ❌ Docker daemon status: failed
[EC2 Validation] Error: SSH command failed
Docker Daemon Result: { ok: false, output: "DOCKER_RUNNING=false", exitCode: 1 }
```

**Root Causes:**
1. ❌ Docker daemon not running
2. ❌ SSH user lacks Docker group permissions
3. ❌ Docker socket not accessible

**How to Debug:**
```bash
ssh -i key.pem ubuntu@54.123.45.67
sudo systemctl status docker
sudo docker ps
# Check if user in docker group
groups $USER
```

---

### Scenario 4: Insufficient Disk Space

**Frontend Error:**
```
Failed check: diskSpace
Disk space below 2GB available
```

**Backend Logs to Check:**
```
[EC2 Validation] Disk space: starting
[EC2 Validation] Command: df -Pk / | awk...
[EC2 Validation] ✅ Disk space: ok DISK_AVAILABLE_GB=0.50
Disk Result: { ok: true, output: "DISK_AVAILABLE_GB=0.50" }

Validation: {
  diskSpace: false  // ok: true but diskAvailableGb (0.50) < MIN_DISK_AVAILABLE_GB (2)
}
Validation Errors: ["Disk space below 2GB available"]
```

**Root Causes:**
1. ❌ EC2 root filesystem nearly full
2. ❌ Need to clean up old files/containers

**How to Debug:**
```bash
ssh -i key.pem ubuntu@54.123.45.67
df -h /
du -sh /var/lib/docker
sudo docker system prune -a
```

---

### Scenario 5: Insufficient Memory

**Frontend Error:**
```
Failed check: memory
Memory below 256MB available
```

**Backend Logs to Check:**
```
[EC2 Validation] Memory: starting
[EC2 Validation] Command: free -m | awk...
[EC2 Validation] ✅ Memory: ok RAM=500MB total / 50MB available
Memory Result: { ok: true, output: "MEMORY_AVAILABLE_MB=50" }

Validation: {
  memory: false  // ok: true but memoryAvailableMb (50) < MIN_MEMORY_AVAILABLE_MB (256)
}
Validation Errors: ["Memory below 256MB available"]
```

**Root Causes:**
1. ❌ EC2 instance type too small (t2.micro)
2. ❌ Other services consuming memory
3. ❌ Docker containers consuming memory

**How to Debug:**
```bash
ssh -i key.pem ubuntu@54.123.45.67
free -h
ps aux --sort=-%mem | head
docker stats
```

---

### Scenario 6: Port Already In Use

**Frontend Error:**
```
Failed check: portAvailable
Port 3000 is occupied by unrelated listener(s): ...
```

**Backend Logs to Check:**
```
[EC2 Validation] Port availability (3000): starting
[EC2 Validation] ✅ Port availability (3000): ok PORT=3000 PORT_IN_USE=true PORT_DOCKER_MATCH=false
Port Availability Result: {
  ok: true,
  port: "3000",
  portInUse: true,
  dockerMatch: false,
  portAllowed: false
}

Validation: {
  portAvailable: false  // portAllowed: false
}
Validation Errors: ["Port 3000 is occupied by unrelated listener(s): 5432 ruby main"]
```

**Root Causes:**
1. ❌ Another service already using port 3000
2. ❌ Need to use different port

**How to Debug:**
```bash
ssh -i key.pem ubuntu@54.123.45.67
sudo ss -ltnp | grep 3000
sudo netstat -ltnp | grep 3000
```

---

## How to Read the Complete Validation Response

### Success Response

```json
{
  "success": true,
  "failedCheck": null,
  "host": "54.123.45.67",
  "username": "ubuntu",
  "serverInfo": {
    "os": "Ubuntu 22.04.1 LTS",
    "cpu": "2 vCPU",
    "ram": "RAM=4009MB total / 3850MB available",
    "dockerVersion": "Docker version 24.0.0, build 0527e48",
    "diskUsage": "45%",
    "diskAvailableGb": 25.5,
    "memoryAvailableMb": 3850
  },
  "validation": {
    "ssh": true,
    "dockerInstalled": true,
    "dockerRunning": true,
    "diskSpace": true,
    "memory": true,
    "portAvailable": true
  },
  "validationErrors": [],
  "logs": [
    "Input validation: ok",
    "SSH connectivity: ok ssh-ok",
    "OS detection: ok OS=Ubuntu 22.04.1 LTS",
    "CPU information: ok CPU=2 vCPU",
    "Docker installation: ok DOCKER_VERSION=Docker version 24.0.0...",
    "Docker daemon status: ok DOCKER_RUNNING=true",
    "Disk space: ok DISK_AVAILABLE_GB=25.50",
    "Memory: ok RAM=4009MB total / 3850MB available",
    "Port availability (3000): ok PORT=3000 PORT_IN_USE=false"
  ],
  "checkResults": {
    "ssh": { "key": "ssh", "ok": true, "output": "ssh-ok", ... },
    "os": { "key": "os", "ok": true, "output": "OS=Ubuntu 22.04.1 LTS", ... },
    "dockerInstalled": { "key": "dockerInstalled", "ok": true, ... },
    "dockerRunning": { "key": "dockerRunning", "ok": true, ... },
    "diskSpace": { "key": "diskSpace", "ok": true, ... },
    "memory": { "key": "memory", "ok": true, ... },
    "portAvailable": { "key": "portAvailable", "ok": true, ... }
  }
}
```

### Failure Response

```json
{
  "success": false,
  "failedCheck": "ssh",
  "message": "SSH authentication failed",
  "host": "54.123.45.67",
  "username": "ubuntu",
  "serverInfo": null,
  "validation": {
    "ssh": false,
    "dockerInstalled": false,
    "dockerRunning": false,
    "diskSpace": false,
    "memory": false,
    "portAvailable": false
  },
  "validationErrors": [
    "SSH authentication failed. Check the EC2 username and private key."
  ],
  "logs": [
    "Input validation: ok",
    "SSH connectivity: failed - SSH authentication failed. Check the EC2 username and private key.",
    "OS detection: starting",
    "OS detection: failed - SSH authentication failed..."
  ],
  "checkResults": {
    "ssh": {
      "key": "ssh",
      "ok": false,
      "error": "SSH authentication failed. Check the EC2 username and private key.",
      "output": "Permission denied (publickey).",
      "stderr": "Permission denied (publickey).",
      "exitCode": 255
    },
    "os": {
      "key": "os",
      "ok": false
    }
  }
}
```

## Testing Procedure

### Step 1: Open Frontend
1. Navigate to: http://localhost:5000/
2. Go to Integrations → Connect EC2

### Step 2: Fill in EC2 Details
- **Host:** Your EC2 public IP (e.g., `54.123.45.67`)
- **Username:** `ubuntu` (or `ec2-user` for Amazon Linux)
- **Private Key:** Paste your SSH private key (PEM format)
- **Port:** `3000` (or your app port)

### Step 3: Submit and Watch Backend Logs

**In Terminal Running Backend:**

Look for this pattern:
```
=== EC2 VALIDATION START ===
Platform: win32
SSH authentication method: node-ssh (Windows)
Host: 54.123.45.67
Username: ubuntu
...
[Windows SSH] Connecting to ubuntu@54.123.45.67:22
[Windows SSH] ✅ Connected to ubuntu@54.123.45.67
...
[EC2 Validation] SSH connectivity: ✅ ok
[EC2 Validation] Docker installation: ✅ ok
[EC2 Validation] Docker daemon status: ✅ ok
...
=== EC2 VALIDATION END ===
```

### Step 4: Read Frontend Error Message

If validation fails, read:
1. **Failed Check** - Which check failed first
2. **Validation Errors** - Array of error messages
3. **Logs** - Complete trace of what happened
4. **Check Results** - Detailed output from each check

### Step 5: Match Backend Logs to Frontend Display

**Example Mapping:**

Frontend displays:
```
Failed check: dockerInstalled
Docker is not installed or is not available to the SSH user.
```

Backend logs show:
```
[EC2 Validation] Docker installation: failed
[EC2 Validation] Error: SSH command failed
Docker Installation Result: { ok: false, output: "DOCKER_VERSION=missing", exitCode: 127 }
```

**Action:** SSH to EC2 and install Docker

---

## Key Code Changes Made

### 1. Enhanced Logging in validateEc2Connection()

**File:** `backend/src/services/ec2ConnectionService.js`

```javascript
console.log("\n\n=== EC2 VALIDATION START ===");
const isWindows = process.platform === "win32";
console.log("Platform:", process.platform);
console.log("SSH authentication method:", isWindows ? "node-ssh (Windows)" : "openssh (Unix)");
console.log("Host:", host);
console.log("Username:", username);
console.log("Port:", port);
console.log("Private Key Length:", privateKey?.length || 0);
```

### 2. Enhanced Logging in Windows SSH

**File:** `backend/src/services/ec2ConnectionService.js`

```javascript
console.log(`[Windows SSH] Connecting to ${username}@${host}:${DEFAULT_SSH_PORT}`);
console.log(`[Windows SSH] Command: ${command}`);
console.log(`[Windows SSH] ✅ Connected to ${username}@${host}`);
console.log(`[Windows SSH] stdout: ${stdout.trim()}`);
```

### 3. Enhanced Logging in runCheck()

**File:** `backend/src/services/ec2ConnectionService.js`

```javascript
console.log(`\n[EC2 Validation] ${checkLabel}: starting`);
console.log(`[EC2 Validation] Command: ${command}`);
console.log(`[EC2 Validation] ✅ ${checkLabel}: ok`, output);
console.error(`[EC2 Validation] ❌ ${checkLabel}: failed`);
```

### 4. Enhanced Logging in Controllers

**File:** `backend/src/controllers/ec2Controller.js`

```javascript
console.log("\n=== EC2 CONNECT REQUEST ===");
console.log("Request Body:", {
  host: req.body?.host,
  username: req.body?.username,
  port: req.body?.port,
  privateKeyLength: req.body?.privateKey?.length || 0,
});
console.log("Response Status:", result.success ? 200 : 400);
console.log("Response Body:", JSON.stringify(result, null, 2));
console.log("=== EC2 CONNECT END ===\n");
```

### 5. Frontend Error Display

**File:** `frontend/src/pages/Ec2Connection.jsx`

```javascript
// Displays when validation fails
{status.validationErrors?.length > 0 && (
  <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
    <div className="font-semibold">
      Failed check: {status.failedCheck || "unknown"}
    </div>
    <ul className="mt-2 list-disc space-y-1 pl-5">
      {status.validationErrors.map((entry, index) => (
        <li key={`${entry}-${index}`}>{entry}</li>
      ))}
    </ul>
  </div>
)}

// Displays validation logs
{status.logs?.length > 0 && (
  <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3">
    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      Validation Logs
    </div>
    <pre className="max-h-64 overflow-auto whitespace-pre-wrap font-mono text-xs leading-5 text-slate-300">
      {status.logs.join("\n")}
    </pre>
  </div>
)}
```

---

## Next Steps to Identify Your Specific Failure

1. **Run EC2 validation from frontend**
2. **Copy the backend console output** (from `=== EC2 VALIDATION START ===` to `=== EC2 VALIDATION END ===`)
3. **Match the pattern** in the "Failure Scenarios" section above
4. **Apply the fix** specific to your failure scenario
5. **Test again** and verify all logs show `✅` marks

---

## Files Modified

- ✅ `backend/package.json` - Added ssh2 dependency
- ✅ `backend/src/services/ec2ConnectionService.js` - Enhanced logging + Windows SSH support
- ✅ `backend/src/controllers/ec2Controller.js` - Enhanced request/response logging
- ✅ `frontend/src/pages/Ec2Connection.jsx` - Already displays all validation data

## Summary

The EC2 validation now has **complete end-to-end tracing** with:
- ✅ Platform detection (Windows vs Unix)
- ✅ SSH authentication method selection (ssh2 vs openssh)
- ✅ Detailed step-by-step logging
- ✅ Error classification and messages
- ✅ Full validation check results
- ✅ Frontend display of all error details

When validation fails, you now see:
1. **Exact failing check** (ssh, docker, disk, memory, port, etc.)
2. **Specific error message** (authentication failed, not installed, permission denied, etc.)
3. **Complete validation logs** (trace through every step)
4. **Check results details** (command output, exit codes, stderr)
