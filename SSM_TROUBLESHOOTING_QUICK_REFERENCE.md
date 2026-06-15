# SSM Install Docker - Troubleshooting Quick Reference

## If Deployment Gets Stuck at "Install Docker"

### Step 1: Check Logs for Status

Look for these log lines in the backend:

```
[BOOTSTRAP] Pre-bootstrap diagnostics complete
  ec2Status: ???
  iamStatus: ???
  ssmRegistrationStatus: ???
  ssmAgentStatus: ???
```

### Step 2: Identify the Problem

| Status | Meaning | Action |
|--------|---------|--------|
| ec2Status: FAILED | Instance doesn't exist or is stopped | ❌ Abort - verify instance launched |
| ec2Status: WARNING | Instance not running | ❌ Abort - start the instance |
| iamStatus: FAILED | No IAM instance profile | ❌ Abort - attachment failed during provisioning |
| iamStatus: WARNING | Missing SSM policy | ❌ Abort - policy not attached correctly |
| ssmRegistrationStatus: FAILED | Instance not in SSM | ⏳ Normal for new instances - wait up to 2 minutes |
| ssmRegistrationStatus: WARNING | SSM offline | ⏳ Normal for new instances - wait up to 2 minutes |
| ssmRegistrationStatus: OK | SSM online | ✅ Should proceed to Docker install |

### Step 3: Check Detailed Diagnostics

Look for the full diagnostics output:

```
[BOOTSTRAP] IAM configuration
  iamProfile: DevOpsHub-SSM-EC2-InstanceProfile
  roles: [list of roles]
  policies: [list of policies]

[BOOTSTRAP] SSM registration status
  pingStatus: Online|Offline|ConnectionLost
  lastPingDateTime: <timestamp or null>
  agentVersion: 3.2.1
```

**Good signs:**
- ✅ `iamProfile: DevOpsHub-SSM-EC2-InstanceProfile` exists
- ✅ `policies` includes `AmazonSSMManagedInstanceCore`
- ✅ `pingStatus: Online`
- ✅ `agentVersion` is set

**Bad signs:**
- ❌ `iamProfile: NOT_ATTACHED`
- ❌ `policies` is empty or missing SSM policy
- ❌ `pingStatus: Offline` with `lastPingDateTime: null` (agent never registered)

### Step 4: Check Recommendations

Look for:
```
[SSM] Critical issues preventing SSM communication:
  [CRITICAL] <check_name>: <message>
```

These tell you exactly what to fix.

### Step 5: Timeout Behavior

**NEW: 2-minute timeout** (was 10 minutes)

After 2 minutes, if SSM not online:
```
[SSM] Timeout waiting for instance to come online
  timeoutMs: 120000
  pollCount: 24

EC2 Instance: OK
IAM Role: OK
SSM Registration: FAILED
SSM Agent: WARNING

Error thrown with full diagnostics
```

---

## Common Issues & Fixes

### Issue: SSM Registration FAILED
```
ssmRegistrationStatus: FAILED
Message: Instance not found in SSM Managed Nodes
```
**Cause:** Instance not yet registered in Systems Manager  
**Fix:** Wait 2-5 minutes - SSM Agent registers automatically  
**Time**: New instances normally register within 1-2 minutes

### Issue: IAM Profile NOT ATTACHED
```
iamStatus: FAILED
Message: No IAM instance profile attached to instance
```
**Cause:** EC2 provisioning failed to attach IAM role  
**Fix:** Check provisioning logs in ec2IntelligentProvisioningService  
**Action:** Terminate instance and retry deployment

### Issue: SSM Policy Missing
```
iamStatus: WARNING
Message: Role missing AmazonSSMManagedInstanceCore policy
```
**Cause:** Role created but policy not attached  
**Fix:** Attach policy manually or redeploy  
**Action:** 
```bash
# Manually attach if needed
aws iam attach-role-policy \
  --role-name DevOpsHub-SSM-EC2-Role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
```

### Issue: Instance Offline
```
ssmRegistrationStatus: WARNING
Message: SSM Agent is Offline. Last ping: null
```
**Cause:** Agent not started or no network connectivity  
**Fix:** Wait for agent to start (happens automatically)  
**Time**: Usually comes online within 2 minutes

---

## Log Monitoring Tips

### Filter for bootstrap events:
```
grep "\[BOOTSTRAP\]" backend.log
```

### Filter for SSM diagnostics:
```
grep "\[SSM-DIAG\]" backend.log
```

### Filter for SSM operations:
```
grep "\[SSM\]" backend.log
```

### Get full diagnostics on error:
```
grep "Critical issues preventing" backend.log -A 50
```

---

## Manual Debugging

### Check instance in AWS Console
1. EC2 → Instances → Find the instance
2. Verify:
   - ✅ State: "running"
   - ✅ Has public IP
   - ✅ Details > IAM instance profile: `DevOpsHub-SSM-EC2-InstanceProfile`

### Check SSM registration
1. Systems Manager → Managed nodes
2. Look for your instance ID
3. Check:
   - ✅ Ping Status: Online
   - ✅ Agent version shown
   - ✅ Last ping time is recent

### Check IAM role
1. IAM → Roles → Search `DevOpsHub-SSM-EC2-Role`
2. Verify:
   - ✅ Role exists
   - ✅ Permissions > `AmazonSSMManagedInstanceCore` attached
   - ✅ Trust relationships include `ec2.amazonaws.com`

---

## Expected Timeline for New Instances

| Time | Status | Action |
|------|--------|--------|
| 0-10s | Instance launching | Wait for EC2 state: running |
| 10-30s | Instance running | Public IP assigned |
| 30-60s | SSM Agent starting | Installation from cloud-init |
| 60-90s | SSM Agent registering | Connecting to Systems Manager |
| 90-120s | SSM Agent online | Ready for commands |

**Normal case:** Instance comes online by 60-90 seconds  
**Slow case:** Takes up to 2 minutes  
**Problem:** If not online after 2 minutes, see "Common Issues" above

---

## Success Indicators

When "Install Docker" succeeds, you'll see:

```
[BOOTSTRAP] SSM instance is now online
  instanceId: i-0123456789abcdef0
  pollCount: 5
  elapsedSeconds: 25

[BOOTSTRAP] Executing bootstrap command on EC2
  amiType: ubuntu
  commandLength: 456

[BOOTSTRAP] Bootstrap command executed successfully
  outputLength: 2345
  outputPreview: "Hit:1 http://archive.ubuntu.com focal InRelease..."

[BOOTSTRAP] Bootstrap completed successfully
```

---

## Getting Help

When reporting an SSM issue, include:
1. Full log output from `[BOOTSTRAP]` start to error
2. The "Pre-bootstrap diagnostics complete" section
3. The error message (should include full diagnostics)
4. AWS region used
5. EC2 instance type (t3.micro, t3.small, etc.)
