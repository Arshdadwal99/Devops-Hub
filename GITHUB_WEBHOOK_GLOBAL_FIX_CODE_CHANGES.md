# Code Changes - Exact Line References

## File: backend/src/services/autoDeployService.js

### Change 1: Added Import (Line 6)

**Location**: Top of file, with other imports

```javascript
// ADDED:
import { createGitHubWebhook } from "./githubWebhookConfigService.js";
```

**Full context**:
```javascript
import { AutoDeploy } from "../models/AutoDeploy.js";
import { BuildHistory } from "../models/BuildHistory.js";
import { Deployment } from "../models/Deployment.js";
import { isDbConnected } from "../db.js";
import { configureJenkinsJobAutoDeploy } from "./jenkinsJobService.js";
import { createGitHubWebhook } from "./githubWebhookConfigService.js";  // ← ADDED
import { broadcastToRoom, emitPipelineStatusUpdate } from "./socketEventsService.js";
import { calculateAutoDeployValidationState } from "./workflowStateService.js";
```

---

### Change 2: Webhook Verification Logic (Lines 265-309)

**Location**: Inside `enableAutoDeploy()` function

**BEFORE** (Lines 248-264):
```javascript
  const owner = preconditions.owner;
  const repo = preconditions.repo;
  const branch = preconditions.branch;
  
  if (!preconditions.job || !preconditions.webhook) {
    console.error("[Auto Deploy] Job or webhook missing after precondition check", {
      jobId: preconditions.job?._id,
      jobName: preconditions.job?.jobName,
      webhookId: preconditions.webhook?._id,
      webhookUrl: preconditions.webhook?.webhookUrl,
    });
    throw new Error("Jenkins job or GitHub webhook not properly detected");
  }
  
  await configureJenkinsJobAutoDeploy(userId, preconditions.job._id || preconditions.job.jobId, true);
```

**AFTER** (Lines 248-310):
```javascript
  const owner = preconditions.owner;
  const repo = preconditions.repo;
  const branch = preconditions.branch;
  
  if (!preconditions.job || !preconditions.webhook) {
    console.error("[Auto Deploy] Job or webhook missing after precondition check", {
      jobId: preconditions.job?._id,
      jobName: preconditions.job?.jobName,
      webhookId: preconditions.webhook?._id,
      webhookUrl: preconditions.webhook?.webhookUrl,
    });
    throw new Error("Jenkins job or GitHub webhook not properly detected");
  }

  // Before enabling auto-deploy, verify/create/reuse the webhook on GitHub (idempotent)
  console.log("[Auto Deploy] Verifying GitHub webhook for auto-deploy", {
    owner,
    repo,
    storedHookId: preconditions.webhook.hookId,
    storedWebhookUrl: preconditions.webhook.webhookUrl,
  });

  let verifiedWebhook;
  try {
    const webhookResult = await createGitHubWebhook(userId, {
      owner,
      repo,
      branch,
      webhookUrl: preconditions.webhook.webhookUrl,
    });

    if (!webhookResult.success) {
      console.error("[Auto Deploy] Webhook verification/creation failed", {
        owner,
        repo,
        error: webhookResult.error || webhookResult.message,
      });
      throw new Error(webhookResult.error || webhookResult.message || "Failed to verify/create GitHub webhook");
    }

    verifiedWebhook = webhookResult.webhook;
    console.log("[Auto Deploy] GitHub webhook verified/created successfully", {
      owner,
      repo,
      hookId: verifiedWebhook.hookId,
      webhookUrl: verifiedWebhook.webhookUrl,
      reused: webhookResult.duplicate,
      message: webhookResult.message,
    });
  } catch (webhookError) {
    console.error("[Auto Deploy] Error during webhook verification/creation", {
      owner,
      repo,
      error: webhookError.message,
      stack: webhookError.stack,
    });
    throw webhookError;
  }

  await configureJenkinsJobAutoDeploy(userId, preconditions.job._id || preconditions.job.jobId, true);
```

**Changes Made**:
- [x] Added webhook verification comment
- [x] Added logging before webhook check
- [x] Call createGitHubWebhook() with verified parameters
- [x] Added error handling for webhook verification
- [x] Store verified webhook in variable
- [x] Add logging for success case
- [x] Catch errors with detailed logging

---

### Change 3: Use Verified Webhook (Lines 331-334)

**Location**: Inside the `update` object in `enableAutoDeploy()` function

**BEFORE** (Line 331):
```javascript
      githubWebhook: {
        hookId: preconditions.webhook.hookId,
        webhookUrl: preconditions.webhook.webhookUrl,
        events: preconditions.webhook.events,
      },
```

**AFTER** (Line 331):
```javascript
      githubWebhook: {
        hookId: verifiedWebhook.hookId,
        webhookUrl: verifiedWebhook.webhookUrl,
        events: verifiedWebhook.events,
      },
```

**Change Made**:
- [x] Replace `preconditions.webhook` with `verifiedWebhook` (3 occurrences)

**Why**: The `verifiedWebhook` has been verified to exist on GitHub (or newly created), whereas `preconditions.webhook` is just a stored database record that may be stale or invalid.

---

## Summary of Changes

### Total Lines Changed: ~65 lines

| File | Lines Changed | Type | Status |
|------|---|---|---|
| autoDeployService.js | 1 line | Import | ✅ Added |
| autoDeployService.js | 46 lines | Logic | ✅ Added |
| autoDeployService.js | 3 lines | Update | ✅ Modified |
| githubWebhookConfigService.js | 0 lines | - | ✅ No changes (already correct) |
| workflowOrchestrationService.js | 0 lines | - | ✅ No changes (already correct) |

### Complexity: LOW ✅
- Straightforward addition of webhook verification
- Uses existing, proven idempotent function
- Clear error handling
- Comprehensive logging

### Risk: VERY LOW ✅
- No database schema changes
- No API changes
- Backward compatible
- Existing functionality preserved

---

## Verification Steps

### Step 1: Check Import Added
```bash
grep -n "import { createGitHubWebhook }" backend/src/services/autoDeployService.js
# Expected: Line 6 (or near top with other imports)
```

### Step 2: Check Webhook Verification Logic Added
```bash
grep -n "Verifying GitHub webhook for auto-deploy" backend/src/services/autoDeployService.js
# Expected: Found in enableAutoDeploy function
```

### Step 3: Check Verified Webhook Used
```bash
grep -n "verifiedWebhook" backend/src/services/autoDeployService.js
# Expected: Multiple occurrences (creation, logging, usage)
```

### Step 4: Visual Diff Check
```bash
git diff backend/src/services/autoDeployService.js
# Should show:
# + import line
# + webhook verification block (46 lines)
# ~ 3 lines changed to use verifiedWebhook instead of preconditions.webhook
```

---

## Deployment Validation

### Before Deployment
- [ ] Code review completed
- [ ] All changes in this document verified
- [ ] No syntax errors (ESLint check)
- [ ] No import errors (linting)

### After Deployment
- [ ] Application starts without errors
- [ ] No database errors on startup
- [ ] Webhook logs appear as expected
- [ ] Test auto-deploy enablement
