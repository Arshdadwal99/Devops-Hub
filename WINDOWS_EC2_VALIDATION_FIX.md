# Windows EC2 Validation Fix

## Overview

Fixed the EC2 validation failing on Windows with SSH permission errors. The issue was that Windows doesn't properly handle Linux file permissions, causing OpenSSH to reject the private key with "UNPROTECTED PRIVATE KEY FILE!" warning.

## Problem Statement

**Error:**
```
WARNING: UNPROTECTED PRIVATE KEY FILE!
Permissions for 'C:\tmp\devops-hub-ec2-xxxx\ssh-key.pem' are too open.
```

**Root Cause:**
1. `ec2ConnectionService.js` was writing the SSH private key to a temporary PEM file
2. `chmod 600` Linux permissions don't work correctly on Windows
3. OpenSSH was rejecting the key before authentication
4. Manual SSH to EC2 instances worked correctly, confirming the credentials were valid

## Solution

### Architecture Changes

The refactored implementation uses **platform-specific SSH methods**:

- **Windows**: `ssh2` library - authenticates using the private key string directly from memory
- **Linux/macOS**: OpenSSH executable - uses existing temporary key file approach

### Key Implementation Details

#### 1. New Dependencies

Added to `backend/package.json`:
```json
"ssh2": "^1.16.0"
```

This is a pure Node.js SSH client that works on all platforms and doesn't require file system permissions.

#### 2. Platform Detection

```javascript
const isWindows = process.platform === "win32";
console.log(`[EC2 Validation] Platform: ${process.platform}, SSH authentication method: ${isWindows ? "node-ssh (Windows)" : "openssh (Unix)"}`);
```

#### 3. Dual SSH Implementation

**Windows SSH (ssh2):**
```javascript
async function runSshCommandWindows({ host, username, privateKey, command, timeout = 15000 })
```

- Creates in-memory SSH connection using ssh2 Client
- Passes the private key string directly (no file I/O)
- Supports multiple key algorithms (RSA, ECDSA, ED25519, DSS)
- Proper error handling with timeout management
- Never stores the key on disk

**Unix SSH (OpenSSH):**
```javascript
async function runSshCommandUnix({ host, username, keyPath, command, timeout = 15000 })
```

- Keeps existing implementation unchanged
- Uses `execFile("ssh")` with temporary key file
- Maintains backward compatibility

#### 4. Unified SSH Command Interface

```javascript
async function runSshCommand({ host, username, keyPath, privateKey, command, timeout = 15000, isWindows = false })
```

- Dispatches to appropriate implementation based on platform
- Handles both Windows (privateKey) and Unix (keyPath) parameters
- Single entry point for all SSH operations

#### 5. Validation Function Changes

`validateEc2Connection()` now:
1. Detects the platform early
2. **Only creates temporary key file on Unix**
3. Passes the private key string on Windows
4. Properly cleans up resources only when needed

```javascript
let tempKey = null;

// Only write temp key on Unix systems; Windows will use the key string directly
if (!isWindows) {
  tempKey = await writeTempPrivateKey(credentials.privateKey);
}

// ... later in cleanup
if (tempKey) {
  await tempKey.cleanup();
}
```

## Validation Checks Preserved

All existing EC2 validation checks remain unchanged:
- ✅ SSH connectivity
- ✅ OS detection
- ✅ Docker installation
- ✅ Docker daemon status
- ✅ Disk space (minimum 2GB)
- ✅ Memory (minimum 256MB)
- ✅ Port availability

## Error Handling & Logging

### Enhanced Error Classification

The `classifySshError()` function now correctly identifies:
- SSH authentication failures
- Invalid key format issues
- Connection timeouts
- Network unreachability
- Hostname resolution failures

### Detailed Logging

Each validation now logs:
```
[EC2 Validation] Platform: win32, SSH authentication method: node-ssh (Windows)
[EC2 Validation] Windows SSH: Connected to ubuntu@54.123.45.67
[EC2 Validation] SSH connectivity: ok
[EC2 Validation] Docker installation: ok
...
```

### Improved Error Response

When validation fails, the response includes:
```javascript
{
  "success": false,
  "failedCheck": "ssh",
  "message": "SSH authentication failed",
  "validationErrors": ["SSH authentication failed. Check the EC2 username and private key."],
  "logs": [
    "Input validation: ok",
    "SSH connectivity: failed - SSH authentication failed",
    ...
  ],
  "checkResults": {
    "ssh": {
      "key": "ssh",
      "label": "SSH connectivity",
      "ok": false,
      "error": "SSH authentication failed",
      "output": "...",
      "stderr": "Permission denied..."
    },
    ...
  }
}
```

## Supported Configurations

✅ **Windows Validation:**
- EC2 instances: Ubuntu, Amazon Linux, etc.
- SSH users: ubuntu, ec2-user, admin
- Key types: RSA, ECDSA, ED25519, DSS
- Docker: Installed and running
- Network: Proper security group rules

✅ **Linux/macOS Validation:**
- All existing functionality preserved
- OpenSSH executable used
- Same validation checks

## Installation & Testing

### 1. Install Dependencies

```bash
cd backend
npm install
```

This will install the new `ssh2@^1.16.0` dependency.

### 2. Test Windows Validation

```bash
# Create or update EC2 connection
POST /api/ec2/connect
{
  "host": "54.123.45.67",
  "username": "ubuntu",
  "privateKey": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----",
  "port": 3000
}
```

### 3. Verify Logs

Check console output for:
```
[EC2 Validation] Platform: win32, SSH authentication method: node-ssh (Windows)
[EC2 Validation] Windows SSH: Connected to ubuntu@54.123.45.67
[EC2 Validation] SSH connectivity: ok
```

## Files Modified

1. **backend/package.json**
   - Added: `"ssh2": "^1.16.0"`

2. **backend/src/services/ec2ConnectionService.js**
   - Added: `import { Client as SSHClient } from "ssh2"`
   - Added: `runSshCommandWindows()` - Windows-specific SSH using ssh2
   - Added: `runSshCommandUnix()` - Unix-specific SSH using OpenSSH
   - Refactored: `runSshCommand()` - Platform dispatcher
   - Updated: `validateEc2Connection()` - Platform detection and conditional tempKey creation
   - Improved: Error logging and classification

## Backward Compatibility

✅ All existing functionality preserved:
- Linux/macOS validation works exactly as before
- Database storage of credentials unchanged
- API responses maintain same structure
- All validation checks identical

## Performance Impact

- **Windows**: No file I/O overhead, pure in-memory authentication
- **Linux/macOS**: Identical to previous implementation
- **Network**: Comparable SSH connection performance

## Security Considerations

✅ **No security regressions:**
- Windows: Private key never written to disk
- Linux/macOS: Existing temporary file with 0o600 permissions
- Both: SSH credentials in memory during validation only
- Both: Credentials encrypted before storage in database
- Both: No credentials logged or exposed in errors

## Troubleshooting

### Windows Validation Still Fails

1. Check SSH logs:
   ```
   [EC2 Validation] Platform: win32, SSH authentication method: node-ssh (Windows)
   ```

2. Verify credentials:
   - Correct EC2 public IP
   - Correct SSH username (ubuntu, ec2-user, etc.)
   - Correct private key (RSA, ECDSA, ED25519, DSS)

3. Check EC2 security group:
   - Port 22 open to your IP
   - Instance has public IP

4. Test manual SSH:
   ```powershell
   ssh -i key.pem ubuntu@54.123.45.67
   ```

### Linux/macOS Issues

If OpenSSH validation fails:
1. Ensure `ssh` command is available in PATH
2. Check SSH key file permissions (should be 0o600)
3. Verify instance network connectivity

## Migration Guide

**No action required** for existing installations:
1. Update `backend/package.json` (already done)
2. Run `npm install` in backend directory
3. Restart backend service
4. Windows EC2 validation will now work

Existing Linux/macOS users see no changes.

## Testing Checklist

- [ ] Windows EC2 connection succeeds with valid credentials
- [ ] Windows EC2 connection fails with invalid credentials
- [ ] All validation checks pass on Windows
- [ ] Linux/macOS EC2 validation still works
- [ ] Validation logs show correct platform
- [ ] Error messages are detailed and actionable
- [ ] No private keys written to Windows disk
- [ ] Docker connectivity checks work

## Next Steps

1. Install ssh2 dependency: `npm install` in backend
2. Test Windows EC2 validation with your infrastructure
3. Monitor logs for any issues
4. Report any platform-specific behavior
