# GitHub Webhook 404 Investigation & Fix - Complete Debug Logging

## Problem Identified

**Error**: HTTP 404 Not Found when creating GitHub webhooks  
**Failure Point**: During "Configure GitHub Webhook" step  
**Context**: Jenkins job created successfully, webhook creation fails

## Root Causes Identified

Based on the 404 response, this can occur from:

1. **Repository Does Not Exist**
   - Owner/name parameters contain typos
   - Organization/user does not exist on GitHub
   - Private repository without access

2. **Repository Access Issues**
   - GitHub token lacks permissions
   - Token is expired or invalid
   - Repository is private and token lacks scope

3. **Stale Webhook Records**
   - Database contains old webhook ID
   - Webhook was deleted from GitHub manually
   - Attempting to access deleted webhook

4. **Malformed Repository Parameters**
   - Owner/name contain invalid characters
   - Owner/name are empty
   - Repository URL parsing failed

## Enhanced Debug Logging Strategy

The updated code now logs **every GitHub API call** with complete context:

### Step-by-Step Logging Added

#### Step 0: Input Validation
```
[GitHub Webhook] ========== WEBHOOK CREATION START ==========
[GitHub Webhook] Input Parameters:
  - userId: (present/MISSING)
  - payloadOwner: (actual value)
  - payloadRepo: (actual value)
  - payloadBranch: (actual value)
  - payloadWebhookUrl: (actual value)

[GitHub Webhook] Repository validated
  - owner: (normalized value)
  - repo: (normalized value)
  - fullName: (owner/repo)
  - url: (GitHub URL)

[GitHub Webhook] Jenkins status verified
  - connected: true/false
  - jenkinsUrl: (actual URL)

[GitHub Webhook] Webhook URL validated
  - webhookUrl: (actual URL)
  - isPublic: true/false
```

#### Step 1: Database Check
```
[GitHub Webhook] Checking database for existing config
  - repository: (owner/repo)
  - webhookUrl: (URL)

[GitHub Webhook] Found existing config in database
  - storedHookId: (ID)
  - storedWebhookUrl: (URL)
```

#### Step 2: GitHub API Query (ALL Webhooks)
```
[GitHub Webhook] Querying GitHub API for all webhooks
  - repository: (owner/repo)
  - targetWebhookUrl: (URL)
  - endpoint: /repos/{owner}/{repo}/hooks

[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks SUCCESS
  - endpoint: (actual endpoint)
  - repository: (owner/repo)
  - httpStatus: 200
  - totalHooks: (count)
  - hookIds: [array of IDs]
  - hookUrls: [array of URLs]

OR

[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks FAILED
  - repository: (owner/repo)
  - endpoint: /repos/{owner}/{repo}/hooks
  - httpStatus: (actual status)
  - githubErrorMessage: (exact error from GitHub)
  - githubErrors: (error details array)
  - requestUrl: (actual URL called)
  - requestMethod: GET
```

#### Step 3: Stale Record Detection
```
[GitHub Webhook] Checking if stored webhook ID still exists on GitHub
  - storedHookId: (ID)

[GitHub Webhook] Stored webhook ID not found on GitHub - webhook was deleted
  - staleHookId: (ID)
  - allAvailableHookIds: [array]
  - action: "removing stale record and creating new webhook"
```

#### Step 4: New Webhook Creation
```
[GitHub Webhook] Creating new webhook on GitHub
  - repository: (owner/repo)
  - webhookUrl: (URL)
  - endpoint: /repos/{owner}/{repo}/hooks

[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks STARTING
  - endpoint: (actual endpoint)
  - repository: (owner/repo)
  - requestPayload: {...}

[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks SUCCESS
  - endpoint: (endpoint)
  - httpStatus: 201
  - newHookId: (ID)
  - webhookUrl: (URL)
  - active: true/false
  - events: [array]

OR

[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks FAILED
  - endpoint: /repos/{owner}/{repo}/hooks
  - repository: (owner/repo)
  - httpStatus: (404, 422, 401, 403, etc.)
  - githubErrorMessage: (exact error)
  - githubErrors: (error details)
  - requestUrl: (actual URL)
  - requestMethod: POST
```

#### Step 5: Webhook Validation (Ping)
```
[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks/{hookId}/pings STARTING
  - endpoint: /repos/{owner}/{repo}/hooks/{hookId}/pings
  - hookId: (ID)

[GitHub Webhook] Ping request sent to webhook successfully
  - hookId: (ID)
  - endpoint: /repos/{owner}/{repo}/hooks/{hookId}/pings

[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks/{hookId}/deliveries STARTING
  - endpoint: /repos/{owner}/{repo}/hooks/{hookId}/deliveries
  - hookId: (ID)

[GitHub Webhook] Webhook validation complete
  - hookId: (ID)
  - deliveryValidationStatus: success/failed/pending
```

## 404 Error Handling Improvements

### GET /repos/{owner}/{repo}/hooks Returns 404

**Before Fix**:
```
Error: Failed to query GitHub webhooks
(generic message, not helpful for debugging)
```

**After Fix**:
```
[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks FAILED
  - httpStatus: 404
  - endpoint: /repos/test-org/test-repo/hooks
  - repository: test-org/test-repo
  - githubErrorMessage: "Not Found"

Error: GitHub repository not found: test-org/test-repo. 
The repository may not exist on GitHub or your token may not have access to it. 
GitHub Error: Not Found
```

**Action Taken**: Throws clear error with troubleshooting suggestions

---

### POST /repos/{owner}/{repo}/hooks Returns 404

**Before Fix**:
```
Error: Failed to create webhook on GitHub
HTTP Status: 404
```

**After Fix**:
```
[GitHub Webhook] GitHub API POST /repos/{owner}/{repo}/hooks FAILED
  - endpoint: /repos/invalid-org/test-repo/hooks
  - repository: invalid-org/test-repo
  - httpStatus: 404
  - githubErrorMessage: "Not Found"
  - requestUrl: https://api.github.com/repos/invalid-org/test-repo/hooks
  - requestMethod: POST

Error: GitHub returned 404 Not Found when creating webhook. 
Endpoint: POST /repos/invalid-org/test-repo/hooks. 
Repository: invalid-org/test-repo. 
The repository may not exist, may be private with insufficient access, or the owner/name may be incorrect. 
GitHub Error: Not Found
```

**Action Taken**: Throws detailed error with endpoint and troubleshooting suggestions

---

### 404 on Webhook Validation (GET /repos/{owner}/{repo}/hooks/{hookId})

**Before Fix**:
```
Error: Could not fetch deliveries
(not logged properly)
```

**After Fix**:
```
[GitHub Webhook] Webhook validation failed (non-critical)
  - hookId: 123456789
  - httpStatus: 404
  - error: "Hook not found"
  - note: "Webhook was created successfully, but validation delivery check failed. This is non-critical."
```

**Action Taken**: Logs warning but doesn't fail deployment (validation is optional)

---

## New Validation Functions

### validateRepositoryParams(owner, repo)

Validates before calling GitHub API:

```javascript
Checks:
1. owner is not empty ✓
2. repo is not empty ✓
3. owner matches GitHub username pattern (alphanumeric + hyphens) ✓
4. repo matches GitHub repo name pattern (alphanumeric + dots/hyphens) ✓

Returns array of validation errors with specific messages
```

**Example Valid Values**:
- owner: "microsoft", "google", "my-org", "org123"
- repo: "vscode", "react.js", "repo-name", "repo_name"

**Example Invalid Values**:
- owner: "" (empty), "@invalid", "org name" (space)
- repo: "" (empty), "repo!", "my repo" (space)

---

## API Call Audit Trail

Every HTTP request to GitHub now logs:

### REQUEST Details
- Full endpoint URL: `POST https://api.github.com/repos/{owner}/{repo}/hooks`
- HTTP method: GET/POST/DELETE
- Request headers: Authorization present
- Request body: Actual payload sent
- Request parameters: Query params included

### RESPONSE Details
- HTTP status code: 200, 404, 422, 401, 403, etc.
- Response body: Full GitHub API response
- Error messages: Exact error from GitHub
- Error codes: GitHub error codes

### CONTEXT Details
- Repository owner: (actual value)
- Repository name: (actual value)
- Repository fullName: owner/repo
- Webhook URL: (actual URL)
- Hook ID (if applicable): (ID)
- User ID: present/MISSING

---

## Specific 404 Troubleshooting

### Scenario 1: Repository Doesn't Exist

**Logs**:
```
[GitHub Webhook] Repository normalization/validation failed
  - owner: "invalid-org"
  - repo: "does-not-exist"
  
[GitHub Webhook] GitHub API GET /repos/invalid-org/does-not-exist/hooks FAILED
  - httpStatus: 404
  - endpoint: /repos/invalid-org/does-not-exist/hooks
  - githubErrorMessage: "Not Found"
```

**Solution**: Verify owner and repo names are correct

---

### Scenario 2: GitHub Token Missing or Invalid

**Logs**:
```
[GitHub Webhook] Failed to create GitHub clients
  - error: "GitHub access token not found or invalid"
  - userId: "MISSING" or "present"
```

**Solution**: Reconnect GitHub account, verify token has permissions

---

### Scenario 3: Stale Webhook ID in Database

**Logs**:
```
[GitHub Webhook] Found existing config in database
  - storedHookId: 999999999

[GitHub Webhook] Checking if stored webhook ID still exists on GitHub
  - storedHookId: 999999999

[GitHub Webhook] Stored webhook ID not found on GitHub - webhook was deleted
  - staleHookId: 999999999
  - allAvailableHookIds: [123456789, 987654321]
  - action: "removing stale record and creating new webhook"

[GitHub Webhook] Removing stale webhook record from database
  - staleHookId: 999999999

[GitHub Webhook] Creating new webhook on GitHub
  ... (creates new webhook)
```

**Solution**: Automatic - stale record removed and new webhook created

---

### Scenario 4: Repository Access Denied

**Logs**:
```
[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks FAILED
  - httpStatus: 403
  - githubErrorMessage: "Resource not accessible by integration"
  - possibleCauses: ["Insufficient permissions", "Token invalid", "Repository private"]
```

**Solution**: Verify GitHub token has `repo:admin_hook` permissions

---

## Implementation Notes

### New Validation Function Added
```javascript
function validateRepositoryParams(owner, repo)
```
- Validates owner and repo parameters before any GitHub API calls
- Returns array of specific validation error messages
- Prevents unnecessary API calls for invalid parameters

### Enhanced Logging Coverage
- **Before**: ~10 log messages
- **After**: ~40+ log messages with full context
- Each API call logged with request/response details
- All error scenarios handled with specific messages

### 404 Handling Strategy
1. **GET /repos/{owner}/{repo}/hooks → 404**: Repository doesn't exist or inaccessible
   - Throw error with troubleshooting suggestions
2. **POST /repos/{owner}/{repo}/hooks → 404**: Repository not found or permission issue
   - Throw error with endpoint details
3. **GET /repos/{owner}/{repo}/hooks/{hookId}/deliveries → 404**: Webhook deleted
   - Log as non-critical warning
   - Don't fail deployment

### Error Messages
- Include GitHub API endpoint called
- Include HTTP status code
- Include exact GitHub error message
- Include troubleshooting suggestions
- Include user-friendly context

---

## Deployment Instructions

### For Production Deployment

1. **Backup Database**: Save webhook configuration collection
2. **Deploy Code**: Update `githubWebhookConfigService.js`
3. **Verify Syntax**: Run `npm run lint`
4. **Test Scenarios**:
   - [x] Fresh webhook creation (successful)
   - [x] Webhook creation with valid repo
   - [x] Webhook creation with invalid repo (expect specific 404 error)
   - [x] Webhook creation with stale DB record
   - [x] Check logs for all detailed messages

5. **Monitor Logs**: Watch for `[GitHub Webhook]` log messages

---

## Logging Verification Checklist

**After deployment, verify these logs appear**:

- [ ] `[GitHub Webhook] ========== WEBHOOK CREATION START ==========`
- [ ] `[GitHub Webhook] Input Parameters:` (shows userId, owner, repo, webhook URL)
- [ ] `[GitHub Webhook] Repository validated` (shows normalized values)
- [ ] `[GitHub Webhook] Jenkins status verified`
- [ ] `[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks SUCCESS` or `FAILED`
- [ ] For success: `[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks SUCCESS` (shows status 200, hook count)
- [ ] For failure: Detailed error with httpStatus, githubErrorMessage, endpoint
- [ ] `[GitHub Webhook] ========== WEBHOOK CREATION SUCCESS (NEW/REUSED/RECOVERED FROM 422) ==========`

**If 404 occurs, these logs will appear**:
- [ ] `[GitHub Webhook] GitHub API GET /repos/{owner}/{repo}/hooks FAILED`
- [ ] `httpStatus: 404` (in logs)
- [ ] Endpoint URL (in logs)
- [ ] GitHub error message (in logs)
- [ ] Error message with troubleshooting suggestions

---

## Summary

This enhanced implementation provides:

✅ **Complete API audit trail** - Every GitHub API call logged with full context  
✅ **Pre-flight validation** - Repository parameters checked before API calls  
✅ **Specific error messages** - 404 errors include endpoint, repository, and suggestions  
✅ **Stale record detection** - Automatically cleans up and recreates webhooks  
✅ **Comprehensive logging** - 40+ log points for complete visibility  
✅ **404 troubleshooting** - Specific guidance for each 404 scenario  

The logs will make it easy to diagnose why webhook creation is failing when a 404 occurs.
