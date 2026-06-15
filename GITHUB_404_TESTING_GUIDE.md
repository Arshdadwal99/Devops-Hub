# Testing Guide - GitHub 404 Error Fix

## Quick Start

### Run the backend
```bash
cd backend
npm start
```

### Send test request
Use the test endpoint to trigger Jenkinsfile generation.

---

## What to Look For in Console Output

### ✅ Successful Scenario

**Step 1:** See handler start
```
========================================
=== GENERATE PIPELINE HANDLER START ===
========================================
[JENKINS_HANDLER] Calling generateJenkinsPipeline with: {
  owner: 'valid-owner',
  repo: 'valid-repo',
  branch: 'main',
  repositoryUrl: 'https://github.com/valid-owner/valid-repo.git'
}
```

**Step 2:** See pipeline function start with same parameters
```
========================================
=== GENERATE JENKINS PIPELINE START ===
========================================
[GENERATE_PIPELINE] Input parameters received: {
  owner: 'valid-owner',
  repo: 'valid-repo',
  branch: 'main',
  repositoryUrl: 'https://github.com/valid-owner/valid-repo.git'
}
[GENERATE_PIPELINE] Validated parameters: {...}
```

**Step 3:** See token verification
```
--- STEP 1: Token Verification ---
=== GITHUB TOKEN VERIFICATION ===
[GITHUB] Token user verified: { 
  username: 'your-username', 
  id: 12345678, 
  type: 'User' 
}
```

**Step 4:** See repository verification  
```
--- STEP 2: Repository Verification ---
[GITHUB] Verifying repository exists: GET /repos/valid-owner/valid-repo
[GITHUB] Repository verified: {
  full_name: 'valid-owner/valid-repo',
  default_branch: 'main',
  private: false,
  permissions: { admin: true, push: true, pull: true },
  status: 200
}
```

**Step 5:** See branch auto-detection
```
--- STEP 4: Branch Detection ---
[GITHUB] Using repository default branch: main
```

**Step 6:** See the actual PUT request being made
```
--- STEP 8: Commit to GitHub ---
=== GITHUB PUT REQUEST ===
{
  owner: 'valid-owner',
  repo: 'valid-repo',
  branch: 'main',
  endpoint: '/repos/valid-owner/valid-repo/contents/Jenkinsfile',
  fullUrl: 'https://api.github.com/repos/valid-owner/valid-repo/contents/Jenkinsfile'
}
```

**Step 7:** See success
```
[GITHUB] ✅ Commit successful!
```

---

### ❌ Failure Scenarios

#### Scenario 1: Invalid Repository (404)

**Expected Output:**
```
--- STEP 2: Repository Verification ---
[GITHUB] Verifying repository exists: GET /repos/invalid-owner/invalid-repo

=== GITHUB API ERROR ===
REQUEST DETAILS: {
  method: 'GET',
  endpoint: '/repos/invalid-owner/invalid-repo',
  requestUrl: 'https://api.github.com/repos/invalid-owner/invalid-repo'
}
RESPONSE ERROR: {
  status: 404,
  statusText: 'Not Found',
  message: 'Request failed with status code 404'
}
RESPONSE BODY: {
  message: 'Not Found',
  documentation_url: 'https://docs.github.com/rest/repos/contents...'
}

❌ Repository not found or inaccessible: invalid-owner/invalid-repo
```

**Frontend receives:**
```json
{
  "success": false,
  "error": {
    "type": "GITHUB_NOT_FOUND",
    "statusCode": 404,
    "details": {
      "owner": "invalid-owner",
      "repo": "invalid-repo",
      "branch": "main"
    },
    "githubResponse": {
      "message": "Not Found"
    }
  }
}
```

---

#### Scenario 2: Invalid Branch (404)

**Expected Output:**
```
--- STEP 5: Branch Verification ---
[GITHUB] Verifying branch exists: GET /repos/valid-owner/valid-repo/branches/invalid-branch

=== GITHUB API ERROR ===
RESPONSE ERROR: { status: 404, statusText: 'Not Found' }
RESPONSE BODY: { message: 'Branch not found' }

❌ Branch does not exist: invalid-branch
```

---

#### Scenario 3: Missing Token Permission (403)

**Expected Output:**
```
--- STEP 3: Permission Verification ---
[GITHUB] Checking push permission for repository...
❌ No push permission on repository

=== GITHUB PERMISSION ERROR ===
{
  owner: 'valid-owner',
  repo: 'valid-repo',
  permissions: { admin: false, push: false, pull: true }
}

❌ Token does not have push permission
```

---

#### Scenario 4: Invalid Token (401)

**Expected Output:**
```
--- STEP 1: Token Verification ---
=== GITHUB TOKEN VERIFICATION ===

=== GITHUB API ERROR ===
REQUEST DETAILS: {
  method: 'GET',
  endpoint: '/user',
  requestUrl: 'https://api.github.com/user'
}
RESPONSE ERROR: {
  status: 401,
  statusText: 'Unauthorized',
  message: 'Request failed with status code 401'
}
RESPONSE BODY: {
  message: 'Bad credentials',
  documentation_url: 'https://docs.github.com/rest/users/users...'
}

❌ Invalid GitHub token: 401 Unauthorized
```

---

## URL Derivation Testing

### Test Case: With Valid URL Only

**Request:**
```json
{
  "repositoryUrl": "https://github.com/Arshdadwal99/to-do-list.git"
}
```

**Expected in console:**
```
[GENERATE_PIPELINE] Owner or repo missing, attempting to derive from URL
[GENERATE_PIPELINE] ✅ Derived from URL: { 
  resolvedOwner: 'Arshdadwal99', 
  resolvedRepo: 'to-do-list' 
}
```

### Test Case: URL with SSH Format

**Request:**
```json
{
  "repositoryUrl": "git@github.com:Arshdadwal99/to-do-list.git"
}
```

**Expected in console:**
```
[GENERATE_PIPELINE] ✅ Derived from URL: { 
  resolvedOwner: 'Arshdadwal99', 
  resolvedRepo: 'to-do-list' 
}
```

---

## Error Response Structure

### Frontend Always Receives:

```json
{
  "success": false,
  "message": "Human readable error message",
  "error": {
    "type": "ERROR_TYPE",  // GITHUB_NOT_FOUND, PIPELINE_GENERATION_FAILED
    "statusCode": 404,     // HTTP status from GitHub
    "details": {
      "owner": "attempted-owner",
      "repo": "attempted-repo",
      "branch": "attempted-branch",
      "repositoryUrl": "attempted-url"
    },
    "githubResponse": {    // Full GitHub API response
      "message": "Not Found",
      "documentation_url": "..."
    }
  }
}
```

---

## Debugging Tips

### 1. Filter Console by Tag
Look for these tags:
- `[JENKINS_HANDLER]` - Controller level
- `[GENERATE_PIPELINE]` - Main pipeline function
- `[GITHUB]` - GitHub API operations
- `[VALIDATION]` - Input validation
- `[ERROR]` - Errors

### 2. Follow the 8-Step Process
Each successful run logs these steps:
```
STEP 1: Token Verification
STEP 2: Repository Verification
STEP 3: Permission Verification
STEP 4: Branch Detection
STEP 5: Branch Verification
STEP 6: File Existence Check
STEP 7: Request Preparation
STEP 8: Commit to GitHub
```

If it fails, check which step failed and why.

### 3. Look for the PUT Request Details
The actual PUT request being made is always logged:
```
=== GITHUB PUT REQUEST ===
{
  owner: '...',
  repo: '...',
  branch: '...',
  endpoint: '...',
  fullUrl: '...'
}
```

This shows exactly what URL was called.

### 4. Check Response Body on 404
When 404 occurs, the response body is logged:
```
RESPONSE BODY: {
  message: 'Not Found',
  documentation_url: '...'
}
```

This tells you why GitHub returned 404.

---

## Common Issues & Fixes

### Issue: Still Getting 404 with Valid Repo

**Check:**
1. ✅ Is the branch actually on that repository?
   ```
   console.log shows: "Branch exists: { name: 'main', commit: '...' }"
   ```

2. ✅ Does the token have push permission?
   ```
   console.log shows: "permissions: { push: true }"
   ```

3. ✅ Is the token valid?
   ```
   console.log shows: "Token user verified"
   ```

### Issue: 404 at Different Steps

- **Step 1 (Token)**: Invalid GitHub token - get new one
- **Step 2 (Repo)**: Repository doesn't exist or no access - check owner/repo
- **Step 5 (Branch)**: Branch doesn't exist - use default branch
- **Step 8 (PUT)**: File path wrong or permission issue - check logs

---

## Success Checklist

When everything is working:

✅ Console shows "Token user verified"  
✅ Console shows "Repository verified"  
✅ Console shows "Branch exists"  
✅ Console shows exact PUT request URL  
✅ Console shows "✅ Commit successful!"  
✅ HTTP response is 200 with success: true  
✅ No errors in console  

---

## Next Steps After Testing

If all tests pass:
1. Run full E2E workflow
2. Verify Jenkins job is created
3. Verify GitHub webhook is configured
4. Test that pipeline runs on push
5. Monitor auto-deploy functionality

---

**Test Date:** [Your Date]  
**Tester:** [Your Name]  
**Status:** Ready for QA
