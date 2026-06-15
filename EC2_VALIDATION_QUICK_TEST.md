# EC2 Validation - Quick Test Guide

## What Changed

The EC2 validation has been completely refactored to:

1. ✅ Support Windows with ssh2 library (no disk I/O for SSH keys)
2. ✅ Support Linux/macOS with existing OpenSSH implementation  
3. ✅ Add comprehensive logging at every validation step
4. ✅ Return structured error information (failedCheck + validationErrors + logs)
5. ✅ Display detailed failure information in the frontend

## Testing Steps

### Step 1: Prepare EC2 Credentials

Have ready:
- **EC2 Public IP** (e.g., `54.123.45.67`)
- **SSH Username** (usually `ubuntu` for Ubuntu EC2, `ec2-user` for Amazon Linux)
- **SSH Private Key** (PEM format, the .pem file content)
- **App Port** (usually `3000`, or your desired port)

### Step 2: Open Backend Terminal

Look at the terminal where the backend is running (`npm run dev`).

You should see this startup message:
```
============================================================
✅ Backend listening on port 5000
============================================================
```

### Step 3: Open Frontend in Browser

Go to: http://localhost:5000/

Navigate to: **Integrations → Connect EC2**

### Step 4: Enter EC2 Details

Fill in:
- **EC2 Host:** Your public IP (e.g., `54.123.45.67`)
- **SSH Username:** `ubuntu` or `ec2-user`
- **SSH Private Key:** Paste the entire PEM key
- **App Port:** `3000` (or your port)

### Step 5: Click "Test Connection"

### Step 6: Watch Backend Console Output

Look for this in your backend terminal:

```
=== EC2 VALIDATION START ===
Platform: win32
SSH authentication method: node-ssh (Windows)
Host: 54.123.45.67
Username: ubuntu
Port: 3000
Private Key Length: 1704

✅ Input validation passed

[Windows SSH] Connecting to ubuntu@54.123.45.67:22
[Windows SSH] Command: echo ssh-ok
[Windows SSH] Timeout: 15000ms
```

**If you see ✅ marks, continue. If you see ❌, check the error message.**

### Step 7: Check Frontend Display

Frontend will show:
- ✅ **Validation Results** - Green for passed, red for failed
- ✅ **Failed Check** (if any) - Which check failed
- ✅ **Validation Errors** - Why it failed
- ✅ **Validation Logs** - Complete step-by-step trace

## Log Patterns to Expect

### ✅ SUCCESS Pattern

```
=== EC2 VALIDATION START ===
Platform: win32
SSH authentication method: node-ssh (Windows)

✅ Input validation passed

[Windows SSH] ✅ Connected to ubuntu@54.123.45.67
[EC2 Validation] SSH connectivity: ✅ ok ssh-ok
[EC2 Validation] Docker installation: ✅ ok DOCKER_VERSION=Docker version 24.0.0
[EC2 Validation] Docker daemon status: ✅ ok DOCKER_RUNNING=true
[EC2 Validation] Disk space: ✅ ok DISK_AVAILABLE_GB=25.50
[EC2 Validation] Memory: ✅ ok MEMORY_AVAILABLE_MB=3850
[EC2 Validation] Port availability (3000): ✅ ok PORT=3000 PORT_IN_USE=false

Validation: {
  ssh: true,
  dockerInstalled: true,
  dockerRunning: true,
  diskSpace: true,
  memory: true,
  portAvailable: true
}
Validation Errors: []
Success: true

=== EC2 VALIDATION END ===
```

**Frontend Display:**
- All checks show "Passed" in green
- No error message displayed
- Server information populated (OS, CPU, RAM, Docker version)
- "Connect" button available to save the connection

---

### ❌ SSH AUTH FAILED Pattern

```
=== EC2 VALIDATION START ===
Platform: win32
SSH authentication method: node-ssh (Windows)
Host: 54.123.45.67
Username: ubuntu

[Windows SSH] Connecting to ubuntu@54.123.45.67:22
[Windows SSH] ❌ Connection error: All configured authentication methods failed

[EC2 Validation] SSH connectivity: failed
[EC2 Validation] Error: SSH authentication failed. Check the EC2 username and private key.

Validation Errors: ["SSH authentication failed. Check the EC2 username and private key."]
Failed Check: ssh
Success: false

=== EC2 VALIDATION END ===
```

**Frontend Display:**
```
Failed check: ssh
SSH authentication failed. Check the EC2 username and private key.
```

**How to Fix:**
1. Verify EC2 public IP is correct
2. Verify SSH username is correct (ubuntu, ec2-user, admin, etc.)
3. Verify the private key is correct and matches EC2
4. Check EC2 security group allows port 22 inbound
5. Ensure EC2 instance is running: `aws ec2 describe-instances --instance-ids i-xxx`
6. Test manually: `ssh -i key.pem ubuntu@54.123.45.67`

---

### ❌ DOCKER NOT INSTALLED Pattern

```
[EC2 Validation] Docker installation: starting
[EC2 Validation] ❌ Docker installation: failed
[EC2 Validation] Error: SSH command failed
Docker Installation Result: { ok: false, output: "DOCKER_VERSION=missing", exitCode: 127 }

Validation Errors: ["Docker is not installed or is not available to the SSH user."]
Failed Check: dockerInstalled
```

**Frontend Display:**
```
Failed check: dockerInstalled
Docker is not installed or is not available to the SSH user.
```

**How to Fix:**
```bash
ssh -i key.pem ubuntu@54.123.45.67
sudo apt update
sudo apt install -y docker.io
sudo usermod -aG docker ubuntu
```

---

### ❌ DOCKER DAEMON NOT RUNNING Pattern

```
[EC2 Validation] Docker daemon status: starting
[EC2 Validation] ❌ Docker daemon status: failed
Docker Daemon Result: { ok: false, output: "DOCKER_RUNNING=false", exitCode: 1 }

Validation Errors: ["Docker daemon is not running or the SSH user does not have permission to access Docker."]
Failed Check: dockerRunning
```

**Frontend Display:**
```
Failed check: dockerRunning
Docker daemon is not running or the SSH user does not have permission to access Docker.
```

**How to Fix:**
```bash
ssh -i key.pem ubuntu@54.123.45.67
sudo systemctl start docker
sudo systemctl enable docker
# Check if user in docker group
groups ubuntu
# If not, add user to docker group
sudo usermod -aG docker ubuntu
```

---

### ❌ INSUFFICIENT DISK SPACE Pattern

```
[EC2 Validation] Disk space: starting
[EC2 Validation] ✅ Disk space: ok DISK_AVAILABLE_GB=0.50
Validation: { diskSpace: false }
Validation Errors: ["Disk space below 2GB available"]
Failed Check: diskSpace
```

**Frontend Display:**
```
Failed check: diskSpace
Disk space below 2GB available
```

**How to Fix:**
```bash
ssh -i key.pem ubuntu@54.123.45.67
df -h /
# Clean up
sudo docker system prune -a
sudo apt clean
sudo journalctl --vacuum=50M
```

---

### ❌ PORT ALREADY IN USE Pattern

```
[EC2 Validation] Port availability (3000): starting
[EC2 Validation] ✅ Port availability (3000): ok PORT_IN_USE=true PORT_DOCKER_MATCH=false
Port Availability Result: { portAllowed: false, diagnostic: "Port 3000 is occupied by unrelated listener(s): 5432 ruby main" }
Validation Errors: ["Port 3000 is occupied by unrelated listener(s): 5432 ruby main"]
Failed Check: portAvailable
```

**Frontend Display:**
```
Failed check: portAvailable
Port 3000 is occupied by unrelated listener(s): 5432 ruby main
```

**How to Fix:**
1. Use different port (e.g., 3001, 8080)
2. Or kill the service using the port:
```bash
ssh -i key.pem ubuntu@54.123.45.67
sudo ss -ltnp | grep 3000
sudo kill <PID>
```

---

## Implementation Details

### Files Changed

**1. backend/package.json**
- Added: `"ssh2": "^1.16.0"`

**2. backend/src/services/ec2ConnectionService.js**
- Platform detection: `process.platform === "win32"`
- Windows SSH: Uses ssh2 library with in-memory private key
- Unix SSH: Uses existing OpenSSH with temporary key file
- Enhanced logging at every validation step
- Structured error responses

**3. backend/src/controllers/ec2Controller.js**
- Request logging (host, username, key length)
- Response logging (status, body)
- Error stack trace logging

**4. frontend/src/pages/Ec2Connection.jsx**
- Already displays: failedCheck, validationErrors, logs, checkResults
- Shows detailed server information when validation passes

### How It Works

**Windows Flow:**
1. validateEc2Connection() detects `process.platform === "win32"`
2. Creates ssh2 Client instance
3. Passes private key string directly (no disk I/O)
4. Authenticates and executes validation commands
5. Returns structured response with detailed logs

**Linux/macOS Flow:**
1. validateEc2Connection() detects Unix platform
2. Writes SSH private key to temporary file (0o600 permissions)
3. Calls execFile("ssh") with key path
4. Same validation checks
5. Cleans up temporary file
6. Returns structured response with detailed logs

### Logging Structure

Each validation includes:
```
console.log("=== EC2 VALIDATION START ===");
console.log("Platform:", process.platform);
console.log("SSH authentication method:", isWindows ? "node-ssh (Windows)" : "openssh (Unix)");
console.log("Host:", host);
console.log("Username:", username);
console.log("Port:", port);

// ... validation checks ...
console.log("SSH Result:", ssh);
console.log("Docker Result:", dockerVersion);
// ... etc

console.log("Validation:", validation);
console.log("Validation Errors:", checks.errors);
console.log("=== EC2 VALIDATION END ===");
```

### Response Structure

```javascript
{
  success: boolean,
  failedCheck: string | null,  // "ssh", "dockerInstalled", "dockerRunning", "diskSpace", "memory", "portAvailable"
  message: string,
  host: string,
  username: string,
  serverInfo: {
    os: string,
    cpu: string,
    ram: string,
    dockerVersion: string,
    diskUsage: string,
    diskAvailableGb: number,
    memoryAvailableMb: number
  },
  validation: {
    ssh: boolean,
    dockerInstalled: boolean,
    dockerRunning: boolean,
    diskSpace: boolean,
    memory: boolean,
    portAvailable: boolean
  },
  validationErrors: string[],  // Array of error messages
  logs: string[],              // Complete trace of validation
  checkResults: {              // Detailed results for each check
    ssh: { key, label, ok, command, output, stdout, stderr, ... },
    dockerInstalled: { ... },
    // ... etc
  }
}
```

## Troubleshooting

### "Cannot find package 'ssh2'"

**Solution:**
```bash
cd backend
npm install
npm run dev
```

### Backend crashes with "SyntaxError"

**Solution:**
- Check all files have no syntax errors
- Verify quotes and braces match
- Run: `npm run dev` to see exact error line

### Logs not showing

**Make sure:**
1. Backend is running with `npm run dev` (not `npm start`)
2. You're looking at the correct terminal
3. Scroll up in terminal to see full output

### Validation still fails after fix

**Procedure:**
1. Copy COMPLETE backend console output
2. Find the ❌ error line
3. Match pattern in "Log Patterns" section above
4. Apply corresponding fix
5. Test again

---

## Success Criteria

✅ When you see in backend terminal:
```
=== EC2 VALIDATION START ===
...
[EC2 Validation] SSH connectivity: ✅ ok
[EC2 Validation] Docker installation: ✅ ok
[EC2 Validation] Docker daemon status: ✅ ok
[EC2 Validation] Disk space: ✅ ok
[EC2 Validation] Memory: ✅ ok
[EC2 Validation] Port availability: ✅ ok
...
Success: true
=== EC2 VALIDATION END ===
```

✅ Frontend shows:
- All validation checks: "Passed" ✅
- No error messages
- Server info displayed
- Status: "Validated" (green pill)
- Option to "Continue Setup" or "Connect"

**You're ready for automated deployments!** 🎉

---

## Next: Enable Automated Deployments

After EC2 validation passes:
1. Click "Continue Setup"
2. Configure Docker Hub credentials
3. Enable automated deployment
4. Monitor deployments in real-time

Success! 🚀
