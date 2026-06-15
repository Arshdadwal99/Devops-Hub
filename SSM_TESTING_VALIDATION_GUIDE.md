# SSM Diagnostics - Testing & Validation Guide

## Overview

This document explains how to test the new SSM diagnostics enhancements and verify the hang issue is fixed.

---

## Pre-Deployment Checklist

### Code Verification

✅ **File 1: ec2SsmDiagnosticsService.js exists**
```bash
ls -la backend/src/services/ec2SsmDiagnosticsService.js
```
Should be ~300 lines, includes:
- `runComprehensiveDiagnostics()`
- `checkEc2Instance()`
- `checkIamRoleAndPolicies()`
- `checkSsmRegistration()`
- `checkSsmAgent()`

✅ **File 2: ec2SsmCommandService.js updated**
```bash
grep -n "WAIT_FOR_INSTANCE_ONLINE_TIMEOUT_MS\|2 \* 60 \* 1000" backend/src/services/ec2SsmCommandService.js
```
Should find: 2-minute timeout constant

✅ **File 3: workflowOrchestrationService.js updated**
```bash
grep -n "ec2SsmDiagnosticsService\|runComprehensiveDiagnostics\|\[BOOTSTRAP\]" backend/src/services/workflowOrchestrationService.js
```
Should find:
- Import statement
- Diagnostics calls
- [BOOTSTRAP] log prefixes

### Backend Startup

✅ **Backend starts without errors**
```bash
cd backend
npm start
```
Should see:
```
✅ [Server] MongoDB connection successful!
✅ [Server] Backend running on http://localhost:5000
```

---

## Test Scenarios

### Scenario 1: Healthy Instance (Happy Path)

**Goal**: Verify successful deployment with new diagnostics

**Steps**:

1. **Trigger a new deployment**
   - Start from the DevOps dashboard
   - Select a repository
   - Choose "Quick Deploy"
   - Watch deployment progress

2. **Monitor logs for diagnostic output**
   ```
   [BOOTSTRAP] Starting EC2 bootstrap and Docker verification
   [BOOTSTRAP] Running pre-bootstrap diagnostics
   ```

3. **Verify all checks pass**
   ```
   [BOOTSTRAP] Pre-bootstrap diagnostics complete
     ec2Status: OK
     iamStatus: OK
     ssmRegistrationStatus: OK
     ssmAgentStatus: INFO
   ```

4. **Check IAM is attached**
   ```
   [BOOTSTRAP] IAM configuration
     iamProfile: DevOpsHub-SSM-EC2-InstanceProfile
     roles: [{roleName: DevOpsHub-SSM-EC2-Role}]
     policies: [{policyArn: arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore}]
   ```

5. **Check SSM comes online within 2 minutes**
   ```
   [BOOTSTRAP] Waiting for SSM to become online
   [SSM] Starting SSM online check with 2-minute timeout
   ... (polling) ...
   [SSM] Instance is online and responsive
     pollCount: 5
     elapsedSeconds: 25
   ```

6. **Verify Docker install succeeds**
   ```
   [BOOTSTRAP] Executing bootstrap command on EC2
   ... (command execution) ...
   [BOOTSTRAP] Bootstrap command executed successfully
     outputLength: 2345
   ```

7. **Verify deployment completes**
   - Install Docker ✅
   - Setup Deployment Workspace ✅
   - (continue through remaining steps)

**Expected outcome**: Deployment completes successfully, Docker installed within 2-3 minutes

**Success indicators**:
- ✅ "Install Docker" step takes < 2 minutes
- ✅ All diagnostic checks pass (OK/INFO)
- ✅ No critical errors
- ✅ [BOOTSTRAP] logs show clear progression

---

### Scenario 2: SSM Not Yet Registered (Wait & Retry)

**Goal**: Verify polling and re-diagnostics while SSM agent registers

**Steps**:

1. **Trigger deployment**
2. **Watch logs for SSM polling**
   ```
   [BOOTSTRAP] Pre-bootstrap diagnostics complete
     ssmRegistrationStatus: WARNING (Offline)
   
   [BOOTSTRAP] Waiting for SSM to become online
   [SSM] Starting SSM online check with 2-minute timeout
   
   [SSM] Attempt to verify instance online
     attempt: 1
     elapsedSeconds: 0
   
   [SSM] Instance not yet online
     attempt: 1
     elapsedSeconds: 0
   ```

3. **Watch for re-diagnostics after 1 minute**
   ```
   [SSM] Re-running diagnostics after 1 minute
   [SSM] Updated diagnostics after 1 minute wait
     ssmRegistrationStatus: OK (now Online!)
   ```

4. **Verify online after re-check**
   ```
   [SSM] Instance is online and responsive
     pollCount: 13
     elapsedSeconds: 63
   ```

**Expected outcome**: After ~60 seconds, SSM comes online, re-diagnostics runs, then proceeds

**Success indicators**:
- ✅ First diagnostics shows WARNING (Offline)
- ✅ Polling continues
- ✅ After 1 minute, re-diagnostics runs
- ✅ Status changes to OK within 2 minutes total
- ✅ Deployment continues successfully

---

### Scenario 3: Missing IAM Policy (Critical Failure)

**Goal**: Verify fast failure with clear error when IAM is misconfigured

**Pre-condition**: Manually remove `AmazonSSMManagedInstanceCore` policy from the IAM role

**Steps**:

1. **Trigger deployment**
2. **Watch for pre-check diagnostics**
   ```
   [BOOTSTRAP] Running pre-bootstrap diagnostics
   [BOOTSTRAP] Pre-bootstrap diagnostics complete
     iamStatus: WARNING (Missing SSM policy)
   ```

3. **Verify critical issue detected and error thrown**
   ```
   [SSM] Starting SSM online check with 2-minute timeout
   [SSM] Critical issues preventing SSM communication
     issues: [CRITICAL] iamRole: Role missing AmazonSSMManagedInstanceCore policy
   ```

4. **Deployment fails immediately with clear error**
   ```
   ERROR: SSM cannot communicate with instance due to critical issues:
   [CRITICAL] iamRole: Role missing AmazonSSMManagedInstanceCore policy
   
   Recommendations:
   [HIGH] iamRole: IAM role missing AmazonSSMManagedInstanceCore policy. 
          Attach this managed policy to enable SSM.
   ```

**Expected outcome**: Deployment fails within seconds (not after 10 minutes)

**Success indicators**:
- ✅ Fails immediately (< 5 seconds)
- ✅ Clear error message
- ✅ Actionable recommendation
- ✅ Not a timeout/hang

---

### Scenario 4: Instance Profile Not Attached (Critical Failure)

**Goal**: Verify fast failure when IAM instance profile is missing

**Pre-condition**: Create EC2 instance manually without IAM instance profile attached

**Steps**:

1. **Use that instance in deployment**
2. **Watch for pre-check diagnostics**
   ```
   [BOOTSTRAP] Pre-bootstrap diagnostics complete
     ec2Status: OK
     iamStatus: FAILED (No IAM instance profile attached)
   ```

3. **Verify critical issue detected**
   ```
   [SSM] Critical issues preventing SSM communication:
     [CRITICAL] ec2Instance: No IAM instance profile attached
     [CRITICAL] iamRole: No IAM instance profile attached to instance
   ```

4. **Deployment fails immediately**
   ```
   ERROR: SSM cannot communicate with instance due to critical issues:
   [CRITICAL] ec2Instance: No IAM instance profile attached. 
              The instance needs an IAM role with AmazonSSMManagedInstanceCore policy.
   ```

**Expected outcome**: Deployment fails within seconds with clear explanation

**Success indicators**:
- ✅ Fails immediately (< 5 seconds)
- ✅ Clear error about missing profile
- ✅ Not a timeout

---

### Scenario 5: Timeout After 2 Minutes

**Goal**: Verify timeout behavior and diagnostics reporting

**Pre-condition**: Create a situation where SSM doesn't register (e.g., wrong VPC/security group)

**Steps**:

1. **Trigger deployment**
2. **Watch logs for 2 minutes**
   ```
   [BOOTSTRAP] Waiting for SSM to become online
   [SSM] Starting SSM online check with 2-minute timeout
   
   [SSM] Attempt to verify instance online (attempt 1-24)
   [SSM] Instance not yet online
   ... (repeats for 2 minutes) ...
   ```

3. **After 2 minutes, verify final diagnostics**
   ```
   [SSM] Timeout waiting for instance to come online
     timeoutMs: 120000
     pollCount: 24
   
   [SSM] Running final diagnostics to explain timeout
   
   SSM Diagnostics Summary:
     EC2 Instance: OK
     IAM Role: OK
     SSM Registration: FAILED
     SSM Agent: ERROR
   
   Recommendations:
   [CRITICAL] ssmRegistration: Instance not registered in SSM Managed Nodes...
   ```

4. **Deployment fails with full diagnostics**

**Expected outcome**: Fails after exactly 2 minutes (not 10!) with full diagnostic output

**Success indicators**:
- ✅ Timeout after ~2 minutes (not 10)
- ✅ Shows diagnostic summary
- ✅ Clear recommendations for fixing
- ✅ ~8 minute improvement over old behavior

---

## Monitoring Checklist

When running tests, monitor these:

### Log Filtering

```bash
# All bootstrap events
tail -f backend.log | grep "\[BOOTSTRAP\]"

# All SSM diagnostics
tail -f backend.log | grep "\[SSM-DIAG\]"

# All SSM operations
tail -f backend.log | grep "\[SSM\]"

# Errors only
tail -f backend.log | grep "ERROR\|FAILED"

# Full context around a keyword
grep -A 20 "Install Docker" backend.log
```

### Metrics to Track

| Metric | Expected | Note |
|--------|----------|------|
| Pre-check diagnostics time | < 1 second | Overhead is minimal |
| Time to "online" (healthy) | 30-90 seconds | SSM registration timing |
| Time to "online" (slow) | 120 seconds max | 2-minute timeout |
| Time to first critical error | < 5 seconds | Fast failure is good |
| Poll attempts (healthy) | 5-15 | ~5s polling interval |
| Poll attempts (timeout) | 24 | 120s ÷ 5s = 24 polls |

### AWS Console Verification

During deployment, verify in AWS:

1. **EC2 Instances**
   - Instance is running
   - Public IP is assigned
   - IAM instance profile: `DevOpsHub-SSM-EC2-InstanceProfile`

2. **Systems Manager → Managed Nodes**
   - Instance ID appears
   - Status changes from "Pending" to "Online"
   - Agent version is shown
   - Last ping time is recent

3. **CloudWatch Logs** (if enabled)
   - SSM Agent startup logs appear
   - Agent registration messages

---

## Passing Criteria

### Test passes if:

✅ **All diagnostic checks show expected status**
- Healthy instance: ec2Status=OK, iamStatus=OK, ssmRegistrationStatus=OK
- Unhealthy instance: Shows specific failure reason

✅ **Timeout reduced significantly**
- Old behavior: 10-minute hang → New: 2-minute timeout
- Should see improvement in all test scenarios

✅ **Clear error messages**
- When deployment fails, logs explain exactly why
- Recommendations are actionable

✅ **Fast failure on critical issues**
- Missing IAM policy: Fail within 5 seconds
- Missing instance profile: Fail within 5 seconds

✅ **Polling works correctly**
- Polls every 5 seconds
- Re-diagnoses after 1 minute
- Reports polling progress in logs

✅ **No behavioral regressions**
- Healthy deployments still complete successfully
- Docker installs correctly
- No new errors or warnings

---

## Regression Testing

Run these tests to ensure no existing functionality broke:

### Test 1: Basic Deployment
- Trigger a standard deployment
- Verify "Install Docker" completes successfully
- Verify subsequent steps complete
- **Should take same time as before (or faster)**

### Test 2: Multiple Deployments
- Trigger 2-3 deployments in sequence
- Each should work independently
- Log filtering should show clear separation
- **No interference between deployments**

### Test 3: Different AWS Regions
- Deploy to different AWS regions
- Each should work correctly
- Diagnostics should use correct region
- **Region handling unchanged**

### Test 4: Different Instance Types
- Test with t3.micro instances
- Test with t3.small instances
- Both should work correctly
- **No instance-type-specific issues**

---

## Performance Baseline

Before and after comparison:

### Before Enhancement:
```
"Install Docker" step timing:
- If SSM works: 2-3 minutes (normal)
- If SSM fails: 10+ minutes (timeout)
- If IAM wrong: 10+ minutes (timeout)
- Error clarity: Low (generic timeout message)
```

### After Enhancement:
```
"Install Docker" step timing:
- If SSM works: 2-3 minutes (normal)
- If SSM fails: 2 minutes max (timeout)
- If IAM wrong: < 1 minute (clear error)
- Error clarity: High (specific diagnostics)
```

**Improvement**: 8-9 minutes faster failure detection + clear error messages

---

## Troubleshooting Tests

If tests fail, check:

1. **Backend not starting**
   ```
   npm start
   # Check for syntax errors in new files
   ```

2. **Diagnostics not running**
   ```
   grep "\[SSM-DIAG\]" backend.log
   # Should see diagnostics entries
   ```

3. **Logs not showing details**
   ```
   # Check if logger is configured for INFO level
   # May need to set DEBUG=* environment variable
   ```

4. **Timeout not working**
   ```
   # Check waitForInstanceOnline timeout parameter
   # Should be passing { timeoutMs: 2 * 60 * 1000 }
   ```

---

## Sign-Off Checklist

Before considering this fix complete:

- [ ] All code changes deployed to backend
- [ ] Backend starts without errors
- [ ] At least one healthy deployment test passes
- [ ] Error messages are clear and helpful
- [ ] Logs show diagnostic output
- [ ] Timeout is 2 minutes (not 10)
- [ ] No regressions in existing functionality
- [ ] At least 2 different AWS regions tested
- [ ] Documentation is up to date
- [ ] Team is aware of new log prefixes ([BOOTSTRAP], [SSM], [SSM-DIAG])

---

## Rollback Plan (if needed)

To revert the changes:

1. Delete: `backend/src/services/ec2SsmDiagnosticsService.js`
2. Restore: `ec2SsmCommandService.js` to previous version
3. Restore: `workflowOrchestrationService.js` to previous version
4. Restart backend

**Note**: These changes are backward compatible and have no breaking changes. Rollback should not be necessary.
