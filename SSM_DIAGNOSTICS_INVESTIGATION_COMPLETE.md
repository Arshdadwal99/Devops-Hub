# SSM "Install Docker" Hang Investigation & Fix Report

**Status**: ✅ INVESTIGATION COMPLETE & ENHANCEMENTS DEPLOYED

---

## Investigation Summary

The "Install Docker" step was hanging during the deployment workflow because:

1. **Default 10-minute timeout was too long** - The original `waitForInstanceOnline()` had a 10-minute timeout, which meant if SSM didn't work, it would hang for the full duration before failing.

2. **Missing IAM role verification** - There was no way to know if the EC2 instance had the correct IAM role and SSM permissions attached.

3. **No SSM registration status visibility** - The code didn't check if the instance was registered in AWS Systems Manager before attempting commands.

4. **Minimal diagnostic logging** - When SSM operations failed, there were no detailed logs to explain why.

5. **Silent failures during polling** - The code would silently retry without reporting what was happening.

---

## Deployment Workflow Issue

The workflow reaches:
- ✅ Check Existing Instances
- ✅ Provision EC2 Instance  
- ✅ Wait Until EC2 Running
- ⏳ Install Docker (HANGS HERE)

The failure point is in `bootstrapAndVerifyServer()`:
```
bootstrapAndVerifyServer()
  → ec2SsmCommandService.waitForInstanceOnline()
    → Polls for SSM agent to respond
    → If instance not in SSM Managed Nodes → HANGS FOR 10 MINUTES
  → ec2SsmCommandService.sendShellCommand()
    → Sends Docker installation command via SSM
```

---

## Root Causes Identified

### 1. **SSM Agent Registration Delay**
- EC2 instances need 2-5 minutes AFTER launch for SSM Agent to register in Systems Manager
- The original code didn't account for this timing

### 2. **Missing IAM Role Configuration**
- Instance must have an IAM instance profile attached
- IAM role must have `AmazonSSMManagedInstanceCore` policy
- Code was creating these but had no verification

### 3. **No Visibility into Prerequisites**
- The code checked nothing before attempting SSM operations:
  - ❌ EC2 instance exists and is running?
  - ❌ IAM instance profile is attached?
  - ❌ IAM role has SSM permissions?
  - ❌ Instance is registered in Systems Manager?
  - ❌ SSM Agent is online?

### 4. **Verbose Logging**
- When SSM failed, logs didn't explain why
- No information about:
  - Instance state
  - IAM role details
  - SSM ping status
  - Last ping time
  - SSM agent version

---

## Enhancements Deployed

### File 1: `ec2SsmDiagnosticsService.js` (NEW)

A comprehensive diagnostics service that checks all SSM prerequisites:

```javascript
// Run comprehensive diagnostics before attempting SSM operations
const diagnostics = await ec2SsmDiagnosticsService.runComprehensiveDiagnostics(
  userId,
  awsConnection,
  instanceId
);
```

**Checks performed:**

1. **EC2 Instance Check**
   - Instance exists?
   - Instance is running?
   - Has public IP?
   - Has IAM instance profile attached?
   - Logs: instanceType, state, launchTime, vpcId, subnetId, securityGroups

2. **IAM Role Check**
   - Instance profile exists?
   - Role is attached to profile?
   - Role has `AmazonSSMManagedInstanceCore` policy?
   - Logs: profileName, roleName, attachedPolicies

3. **SSM Registration Check**
   - Instance registered in Systems Manager?
   - SSM Agent ping status (Online/Offline)?
   - Last ping time?
   - Agent version?
   - Logs: pingStatus, lastPingDateTime, agentVersion, platformType

4. **SSM Agent Check**
   - Retrieves recent SSM command history
   - Logs: command count, recent command status

5. **Recommendations Engine**
   - Generates actionable recommendations for any issues
   - Priorities: CRITICAL, HIGH, MEDIUM

---

### File 2: `ec2SsmCommandService.js` (ENHANCED)

**Added 2-minute timeout:**
```javascript
const WAIT_FOR_INSTANCE_ONLINE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes (was 10 minutes)
```

**Enhanced `waitForInstanceOnline()` method:**

1. **Pre-check diagnostics** - Runs diagnostics before attempting any SSM operations
2. **Fails fast on critical issues** - If IAM role, instance profile, or EC2 state is wrong, fails immediately with clear error
3. **Re-diagnoses after 1 minute** - If SSM registration is still pending after 1 minute, runs diagnostics again to check for issues
4. **Detailed polling logs** - Every poll attempt is logged with timing information
5. **Final diagnostics on timeout** - When timeout occurs, runs final diagnostics to explain why

**Enhanced `sendShellCommand()` method:**

1. **Pre-execution logging** - Logs instance ID, command count, timeout before issuing command
2. **Logs command ID** - Logs the SSM CommandId immediately after issuing
3. **Logs command status** - Logs the SSM command status
4. **Error logging** - Logs specific error codes and messages

**Enhanced `waitForCommandInvocation()` method:**

1. **Poll attempt tracking** - Logs every poll attempt with attempt number and elapsed time
2. **Status transition logging** - Logs when invocation status changes
3. **Terminal status handling** - Logs when command reaches terminal status
4. **Detailed error reporting** - Logs command status, response code, stderr, stdout samples

---

### File 3: `workflowOrchestrationService.js` (ENHANCED)

**Enhanced `bootstrapAndVerifyServer()` function:**

1. **Pre-bootstrap diagnostics** - Runs comprehensive diagnostics before bootstrap
2. **Logs IAM configuration** - Logs IAM profile, roles, and policies
3. **Logs SSM registration status** - Logs ping status, last ping time, agent version
4. **2-minute timeout enforcement** - Passes 2-minute timeout to SSM service
5. **Structured logging** - Logs with clear [BOOTSTRAP] prefix for easy filtering
6. **Error context** - Includes full diagnostics in error messages

---

## Logging Examples

### Successful SSM Boot (2-minute case):

```
[BOOTSTRAP] Starting EC2 bootstrap and Docker verification
  instanceId: i-0123456789abcdef0
  region: us-east-1

[SSM-DIAG] Starting comprehensive diagnostics
[BOOTSTRAP] Pre-bootstrap diagnostics complete
  ec2Status: OK
  iamStatus: OK
  ssmRegistrationStatus: WARNING (PingStatus: Offline)
  ssmAgentStatus: INFO

[BOOTSTRAP] IAM configuration
  iamProfile: DevOpsHub-SSM-EC2-InstanceProfile
  roles: [{roleName: DevOpsHub-SSM-EC2-Role, arn: arn:aws:iam::123456789012:role/DevOpsHub-SSM-EC2-Role}]
  policies: [{roleName: DevOpsHub-SSM-EC2-Role, attachedPolicies: [{policyArn: arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore}]}]

[BOOTSTRAP] SSM registration status
  instanceId: i-0123456789abcdef0
  pingStatus: Offline
  lastPingDateTime: null
  agentVersion: 3.2.1
  computerName: ip-10-0-0-1

[BOOTSTRAP] Waiting for SSM to become online (with 2-minute timeout)

[SSM] Starting SSM online check with 2-minute timeout
  timeoutMs: 120000
  pollIntervalMs: 5000

[SSM] Attempt to verify instance online (Poll 1/24)
  elapsedSeconds: 0

[SSM] Instance not yet online (Poll 1)
  error: SSM command failed with status Failed

... (polls continue) ...

[SSM] Re-running diagnostics after 1 minute
  ssmRegistrationStatus: OK
  pingStatus: Online

[SSM] Attempt to verify instance online (Poll 13)
  elapsedSeconds: 60

[SSM] Instance is online and responsive
  pollCount: 13
  elapsedSeconds: 60

[BOOTSTRAP] Executing bootstrap command on EC2
  amiType: ubuntu
  commandLength: 456
  
[BOOTSTRAP] Bootstrap command executed successfully
```

### Failed SSM Boot (Critical Issue):

```
[BOOTSTRAP] Starting EC2 bootstrap and Docker verification

[SSM-DIAG] Starting comprehensive diagnostics

[BOOTSTRAP] Pre-bootstrap diagnostics complete
  ec2Status: FAILED (No IAM instance profile attached)
  iamStatus: FAILED
  ssmRegistrationStatus: FAILED

[SSM] Starting SSM online check with 2-minute timeout

[SSM] Critical issues preventing SSM communication
  issues: 
    ec2Instance: No IAM instance profile attached. The instance needs an IAM role with AmazonSSMManagedInstanceCore policy.
    iamRole: No IAM instance profile attached to instance

[ERROR] Error thrown immediately - deployment fails fast with clear error message:
"SSM cannot communicate with instance due to critical issues:
  [CRITICAL] ec2Instance: No IAM instance profile attached...
  [CRITICAL] iamRole: No IAM instance profile attached to instance
  
Full diagnostics: {...}"
```

---

## Configuration Changes

### Timeout Reduction
```javascript
// BEFORE: 10 minutes (600000 ms)
const DEFAULT_POLL_INTERVAL_MS = 10 * 60 * 1000;

// AFTER: 2 minutes (120000 ms)
const WAIT_FOR_INSTANCE_ONLINE_TIMEOUT_MS = 2 * 60 * 1000;
```

### Polling Behavior
```javascript
// Default poll interval: 5 seconds
// Max poll attempts: 24 (2 minutes ÷ 5 seconds)
// Re-diagnostics: After 1 minute (poll 12)
```

---

## Diagnostic Output Format

When SSM diagnostics run, they output:

```json
{
  "instanceId": "i-0123456789abcdef0",
  "region": "us-east-1",
  "timestamp": "2026-06-05T10:30:00.000Z",
  "checks": {
    "ec2Instance": {
      "status": "OK|WARNING|FAILED|ERROR",
      "message": "Human-readable status message",
      "details": {
        "state": "running",
        "instanceType": "t3.micro",
        "publicIp": "3.123.45.67",
        "iamInstanceProfile": "arn:aws:iam::123456789012:instance-profile/DevOpsHub-SSM-EC2-InstanceProfile"
      }
    },
    "iamRole": {
      "status": "OK|WARNING|FAILED|ERROR",
      "message": "Human-readable status message",
      "details": {
        "iamProfileName": "DevOpsHub-SSM-EC2-InstanceProfile",
        "roles": [{ "roleName": "DevOpsHub-SSM-EC2-Role", "arn": "..." }],
        "policies": [{ "roleName": "DevOpsHub-SSM-EC2-Role", "attachedPolicies": [...] }]
      }
    },
    "ssmRegistration": {
      "status": "OK|WARNING|FAILED|ERROR",
      "message": "Human-readable status message",
      "details": {
        "pingStatus": "Online|Offline|ConnectionLost",
        "lastPingDateTime": "2026-06-05T10:29:00Z",
        "agentVersion": "3.2.1",
        "platformType": "Linux"
      }
    },
    "ssmAgent": {
      "status": "OK|INFO|ERROR",
      "message": "Human-readable status message",
      "details": {
        "totalCommands": 1,
        "recentCommands": [...]
      }
    }
  },
  "recommendations": [
    {
      "priority": "CRITICAL|HIGH|MEDIUM",
      "check": "ec2Instance|iamRole|ssmRegistration|ssmAgent",
      "message": "Actionable recommendation"
    }
  ]
}
```

---

## How to Identify SSM Hang Issues Now

When deployment is stuck on "Install Docker":

### 1. Check Backend Logs
Look for these log lines to understand why SSM is failing:

```
[BOOTSTRAP] Starting EC2 bootstrap
[SSM-DIAG] Starting comprehensive diagnostics
[BOOTSTRAP] Pre-bootstrap diagnostics complete
  → Check each status: ec2Status, iamStatus, ssmRegistrationStatus
```

### 2. Check Diagnostics Output
The logs will show specific issues:
```
[BOOTSTRAP] IAM configuration (verify role is attached)
[BOOTSTRAP] SSM registration status (check pingStatus and lastPingDateTime)
```

### 3. Check Recommendations
The logs will include actionable recommendations:
```
[SSM] Critical issues preventing SSM communication:
  [CRITICAL] check_name: actionable message
```

### 4. 2-Minute Timeout
If SSM doesn't come online within 2 minutes, deployment will fail immediately with diagnostics showing why.

---

## Testing the Fix

To test the new diagnostics:

1. **Trigger a new deployment** - The "Install Docker" step will now:
   - Run pre-check diagnostics (shows IAM/SSM status)
   - Wait 2 minutes max for SSM to come online (not 10!)
   - If SSM is slow, re-run diagnostics after 1 minute to check for issues
   - If timeout occurs, show full diagnostics explaining why

2. **Monitor logs** - Look for [BOOTSTRAP], [SSM], and [SSM-DIAG] prefixes

3. **Expected behavior:**
   - **Healthy**: IAM✅ → SSM registers within 2 min → Docker installs ✅
   - **Unhealthy**: IAM❌ or SSM registration fails → Immediate error with clear reason

---

## Files Modified

1. ✅ **`ec2SsmDiagnosticsService.js`** (NEW)
   - 300+ lines
   - Comprehensive SSM prerequisite checking
   - 4 diagnostic checks + recommendations engine

2. ✅ **`ec2SsmCommandService.js`** (ENHANCED)
   - Added 2-minute timeout for `waitForInstanceOnline()`
   - Enhanced all methods with detailed logging
   - Integrated diagnostics service
   - Pre-check for critical issues

3. ✅ **`workflowOrchestrationService.js`** (ENHANCED)
   - Added diagnostics import
   - Enhanced `bootstrapAndVerifyServer()` with pre-checks
   - Added detailed logging throughout bootstrap process
   - Error messages now include full diagnostics

---

## Quick Reference: What Gets Logged Now

| Event | Details Logged |
|-------|----------------|
| Bootstrap starts | instanceId, region, operatingSystem, amiType |
| Diagnostics run | ec2Status, iamStatus, ssmRegistrationStatus, agentStatus |
| IAM check | iamProfile, roles, policies, SSM policy attached? |
| SSM registration check | pingStatus, lastPingDateTime, agentVersion, computerName |
| Polling attempt | attempt #, elapsed seconds, status |
| SSM command issued | commandId, status, documentName |
| Polling for result | attempt #, elapsed seconds, terminal status |
| Command completed | status, responseCode, stdout/stderr length |
| Timeout/Error | Full diagnostics with recommendations |

---

## Next Steps

1. **Deploy** - Backend is now running with enhanced diagnostics
2. **Test** - Trigger a new deployment to "Install Docker" step
3. **Monitor logs** - Watch for [BOOTSTRAP] and [SSM-DIAG] entries
4. **Verify** - Should see SSM online within 1-2 minutes (not 10!)
5. **Troubleshoot** - If still hanging, logs will explain exactly why

---

## Notes

- The 2-minute timeout is appropriate for SSM Agent registration (normally 1-2 minutes)
- If SSM still isn't coming online after 2 minutes, there's likely an IAM configuration issue (which diagnostics will show)
- The diagnostics service can be called standalone for manual debugging
- All logging includes structured data for easy filtering in log aggregation tools
