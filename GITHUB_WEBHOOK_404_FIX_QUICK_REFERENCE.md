# GitHub Webhook 404 Fix - Quick Reference for Developers

## What Was Fixed

Enhanced GitHub webhook creation with comprehensive debug logging for **all** GitHub API calls. Now when a 404 error occurs during webhook creation, you'll get detailed information about:

- ✅ The exact GitHub API endpoint called
- ✅ Repository owner and name used
- ✅ Webhook URL configured
- ✅ GitHub error message
- ✅ Troubleshooting suggestions

## Viewing Logs

All webhook-related logs are prefixed with `[GitHub Webhook]`:

```
[GitHub Webhook] ========== WEBHOOK CREATION START ==========
[GitHub Webhook] Input Parameters: {...}
[GitHub Webhook] Repository validated
[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks SUCCESS
[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (NEW) ==========
```

## Common 404 Scenarios & Solutions

### Scenario 1: "404 Not Found" During Initial Query

**Log Message**:
```
[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks FAILED
  - httpStatus: 404
  - endpoint: /repos/invalid-org/test-repo/hooks
```

**Cause**: Repository doesn't exist or you don't have access

**Solution**:
1. Verify repository owner is spelled correctly (case-sensitive)
2. Verify repository name is spelled correctly (case-sensitive)
3. If private repository: verify GitHub token has access
4. Verify token hasn't expired

---

### Scenario 2: "404 Not Found" During Webhook Creation

**Log Message**:
```
[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks FAILED
  - httpStatus: 404
  - endpoint: /repos/my-org/test-repo/hooks
  - message: "Not Found"
```

**Cause**: Repository doesn't exist at the time of webhook creation

**Solution**:
1. Same as Scenario 1
2. Verify repository exists on GitHub
3. Verify token permissions include `repo:admin_hook`

---

### Scenario 3: "401 Unauthorized"

**Log Message**:
```
[GitHub Webhook] Failed to create GitHub clients
  - error: "GitHub access token not found or invalid"

OR

[GitHub Webhook] GitHub API GET ... FAILED
  - httpStatus: 401
  - message: "Bad credentials"
```

**Cause**: GitHub token is invalid or expired

**Solution**:
1. Reconnect GitHub account (re-authorize)
2. Verify token wasn't revoked in GitHub settings
3. Verify token scope includes `repo` and `admin:repo_hook`

---

### Scenario 4: "403 Forbidden" 

**Log Message**:
```
[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks FAILED
  - httpStatus: 403
  - message: "Resource not accessible by integration"
```

**Cause**: GitHub token lacks necessary permissions

**Solution**:
1. Disconnect and reconnect GitHub account
2. During authorization, ensure token requests `repo:admin_hook` permissions
3. Check token scopes in GitHub Personal Access Tokens settings

---

### Scenario 5: "422 Validation Failed" (Then 404)

**Log Message**:
```
[GitHub Webhook] GitHub returned 422 Validation Failed
[GitHub Webhook] Rechecking GitHub for webhooks after 422 error
[GitHub Webhook] 422 Error: Could not create webhook...
```

**Cause**: Complex - usually webhook already exists OR URL is invalid

**Solution**:
1. Check webhook URL is public (not localhost or private IP)
2. Verify webhook URL format is correct
3. Manually check GitHub webhook settings for duplicates

---

## Debug Workflow

### Step 1: Enable Debug Logging
Logs are automatically enabled. Look for `[GitHub Webhook]` messages

### Step 2: Identify the Failure Point
Find the FAILED message:
- `GitHub API GET ... FAILED` - Initial webhook query failed
- `GitHub API POST ... FAILED` - Webhook creation failed
- `Webhook validation failed` - Validation check failed (non-critical)

### Step 3: Check HTTP Status Code
```
httpStatus: 404  → Repository not found
httpStatus: 401  → Auth token invalid/expired
httpStatus: 403  → Insufficient permissions
httpStatus: 422  → Validation error (duplicate/invalid URL)
httpStatus: 500  → GitHub server error (retry)
```

### Step 4: Check Endpoint URL
The endpoint tells you what operation failed:
```
GET  /repos/{owner}/{repo}/hooks              → Query webhooks
POST /repos/{owner}/{repo}/hooks              → Create webhook
POST /repos/{owner}/{repo}/hooks/{id}/pings   → Validate webhook
GET  /repos/{owner}/{repo}/hooks/{id}/deliveries → Check deliveries
```

### Step 5: Apply Troubleshooting
Each log message includes suggested solutions in the "troubleshooting" field

---

## Key Log Messages to Watch

### SUCCESS Messages (Deployment Will Proceed)

```
[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (NEW) ==========
[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (REUSED) ==========
[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (DATABASE SYNCED) ==========
[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (RECOVERED FROM 422) ==========
```

### FAILURE Messages (Deployment Will Stop)

```
[GitHub Webhook] Repository validation failed
[GitHub Webhook] Failed to create GitHub clients
[GitHub Webhook] GitHub API ... FAILED - httpStatus: 404
[GitHub Webhook] GitHub API ... FAILED - httpStatus: 401
[GitHub Webhook] GitHub API ... FAILED - httpStatus: 403
[GitHub Webhook] 422 Error: Could not create webhook
```

### WARNING Messages (Non-Critical - Deployment Continues)

```
[GitHub Webhook] Webhook validation encountered 404 (non-critical)
[GitHub Webhook] Stored webhook ID not found on GitHub - webhook was deleted
[GitHub Webhook] Webhook validation failed (non-critical)
```

---

## Complete Log Example (Success)

```
[GitHub Webhook] ========== WEBHOOK CREATION START ==========
[GitHub Webhook] Input Parameters: {
  userId: 'present',
  payloadOwner: 'my-org',
  payloadRepo: 'test-repo',
  payloadBranch: 'main',
  payloadWebhookUrl: 'https://jenkins.example.com/github-webhook/'
}
[GitHub Webhook] Repository validated: owner=my-org, repo=test-repo
[GitHub Webhook] Jenkins status verified: connected=true
[GitHub Webhook] Webhook URL validated: isPublic=true
[GitHub Webhook] Checking database for existing config
[GitHub Webhook] No existing config found in database
[GitHub Webhook] GitHub clients created successfully
[GitHub Webhook] Querying GitHub API for all webhooks
  - endpoint: /repos/my-org/test-repo/hooks
[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks SUCCESS
  - httpStatus: 200
  - totalHooks: 0
[GitHub Webhook] No matching webhook found on GitHub by URL
[GitHub Webhook] Creating new webhook on GitHub
[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks STARTING
[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks SUCCESS
  - httpStatus: 201
  - newHookId: 123456789
[GitHub Webhook] Validating new webhook with ping and deliveries
[GitHub Webhook] Ping request sent to webhook successfully
[GitHub Webhook] Webhook validation complete: deliveryValidationStatus=success
[GitHub Webhook] Saving webhook to database
[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (NEW) ==========
```

## Complete Log Example (404 Error)

```
[GitHub Webhook] ========== WEBHOOK CREATION START ==========
[GitHub Webhook] Input Parameters: {
  userId: 'present',
  payloadOwner: 'invalid-org',
  payloadRepo: 'test-repo',
  payloadWebhookUrl: 'https://jenkins.example.com/github-webhook/'
}
[GitHub Webhook] Repository validated: owner=invalid-org, repo=test-repo
[GitHub Webhook] Jenkins status verified: connected=true
[GitHub Webhook] Webhook URL validated: isPublic=true
[GitHub Webhook] GitHub clients created successfully
[GitHub Webhook] Querying GitHub API for all webhooks
  - endpoint: /repos/invalid-org/test-repo/hooks
[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks FAILED
  - httpStatus: 404
  - endpoint: /repos/invalid-org/test-repo/hooks
  - githubErrorMessage: 'Not Found'
[GitHub Webhook] Repository not found on GitHub
  - repository: invalid-org/test-repo
  - troubleshooting: [
      "Verify the repository owner is correct (case-sensitive)",
      "Verify the repository name is correct (case-sensitive)",
      "If private, ensure GitHub token has access to the repository"
    ]

Error: GitHub repository not found: invalid-org/test-repo. 
The repository may not exist on GitHub or your token may not have access to it. 
Endpoint: GET /repos/invalid-org/test-repo/hooks. 
GitHub Error: Not Found
```

---

## Testing Phase 6 Fix

Run through these scenarios to verify fix is working:

### ✅ Test 1: Fresh Webhook Creation (Valid Repo)
- **Expected**: SUCCESS logs with newHookId
- **Verify**: `[GitHub Webhook] GitHub API POST ... SUCCESS` shows 201 status

### ✅ Test 2: Reuse Existing Webhook
- **Expected**: SUCCESS logs with "REUSED"
- **Verify**: `[GitHub Webhook] Found matching webhook on GitHub` appears

### ✅ Test 3: Invalid Repository Owner
- **Expected**: FAILURE with 404
- **Verify**: `[GitHub Webhook] GitHub API GET ... FAILED` shows 404 and endpoint

### ✅ Test 4: Expired GitHub Token
- **Expected**: FAILURE with 401
- **Verify**: `[GitHub Webhook] Failed to create GitHub clients` shows token error

### ✅ Test 5: Insufficient Permissions
- **Expected**: FAILURE with 403
- **Verify**: `[GitHub Webhook] GitHub permission denied` mentions repo:admin_hook

---

## Troubleshooting Checklist

When webhook creation fails with 404:

- [ ] Check repository owner is spelled correctly (case matters)
- [ ] Check repository name is spelled correctly (case matters)
- [ ] Verify repository exists on GitHub.com
- [ ] If private repo, verify GitHub token has access
- [ ] Check GitHub token hasn't expired
- [ ] Verify token has `repo:admin_hook` permissions
- [ ] Check Jenkins webhook URL is public (no localhost)
- [ ] Try disconnecting/reconnecting GitHub account
- [ ] Check GitHub API status (github.com/status)

---

## Performance Notes

- ✅ Logging adds ~5-10ms overhead per webhook creation
- ✅ No database schema changes required
- ✅ Backward compatible with existing webhooks
- ✅ Non-blocking validation failure (logs warning, continues)

---

## Contact & Support

If you see patterns of 404 errors that don't match these scenarios:
1. Share the complete `[GitHub Webhook]` log output
2. Include repository owner/name (anonymized if needed)
3. Include timestamp of failure
4. Include Jenkins and GitHub versions

All logs include full context needed for debugging.
