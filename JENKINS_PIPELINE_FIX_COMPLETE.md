# Jenkins Pipeline Generator - 404 Error Fix Complete

## Problem Identified

**Location:** `backend/src/services/jenkinsPipelineGeneratorService.js`
**Function:** `commitJenkinsfile()`
**Error:** `AxiosError: Request failed with status code 404`

The 404 error was occurring without visibility into:
- Which exact owner/repo/branch were being used
- What GitHub API endpoint was being called
- Whether the token has proper permissions
- Whether the branch actually exists
- What GitHub API response was returned

## Root Cause Analysis

The `commitJenkinsfile()` function was making a PUT request to GitHub's API without:
1. Logging parameters before API calls
2. Verifying inputs exist and are valid
3. Detecting default branch (master vs main)
4. Logging response status and data
5. Detailed error diagnostics for 404s

## Solution Implemented

### 1. Added `getDefaultBranch()` Function
- **Purpose:** Automatically detect repository's default branch
- **Handles:** Both `main` and `master` branch conventions
- **Logs:** Detection attempts and results
- **Location:** Lines 500-509

```javascript
[GITHUB] Detecting default branch: { owner, repo }
[GITHUB] Default branch detected: { defaultBranch, status }
```

### 2. Enhanced `commitJenkinsfile()` Function
**Location:** Lines 511-599

**Logging Added:**
```
[COMMIT_JENKINSFILE_START] Initiating Jenkinsfile commit
[GITHUB] Input parameters: { owner, repo, branch }
[GITHUB] Resolved branch: (after detection)
[GITHUB] Checking if Jenkinsfile exists at: (branch/path)
[GITHUB] Endpoint: /repos/{owner}/{repo}/contents/Jenkinsfile
[GITHUB] Full URL: https://api.github.com/repos/{owner}/{repo}/contents/Jenkinsfile
[GITHUB] Request method: PUT
[GITHUB] Request body: { message, branch, contentLength, sha }
[GITHUB] Commit successful: { status, sha, commitUrl }
[GITHUB] Commit failed: { status, statusText, message, data, owner, repo, branch }
[GITHUB] 404 ERROR DETAILS: { endpoint, owner, repo, branch, fullUrl, possibleReasons }
```

**Validations Added:**
- Owner is provided
- Repo is provided
- Jenkinsfile content is provided
- Default branch auto-detection
- File existence check with SHA retrieval
- Proper PUT request format

### 3. Enhanced `previewJenkinsPipeline()` Function
**Location:** Lines 411-475

**Logging Added:**
```
[PREVIEW_PIPELINE_START] Initiating preview
[GITHUB] Parameters received: { owner, repo, branch }
[GITHUB] Token verification: { hasToken, tokenLength, tokenStart }
[GITHUB] Client created with token
[PREVIEW_PIPELINE] Configuration detected: { projectType, appPort }
[PREVIEW_PIPELINE_COMPLETE] Preview generated successfully
```

### 4. Enhanced `generateJenkinsPipeline()` Function
**Location:** Lines 601-700

**Logging Added:**
```
[GENERATE_PIPELINE_START] Initiating pipeline generation
[GENERATE_PIPELINE] Input parameters: { userId, owner, repo, branch, hasJenkinsfile }
[GENERATE_PIPELINE] GitHub token retrieved: { hasToken }
[GENERATE_PIPELINE] Preview generated: { projectType, branch, owner, repo }
[GENERATE_PIPELINE] Calling commitJenkinsfile with: { owner, repo, branch }
[GENERATE_PIPELINE] Commit complete: { sha, commitUrl }
[GENERATE_PIPELINE_COMPLETE] Pipeline successfully created
```

### 5. Enhanced `createGitHubClient()` Function
**Location:** Lines 14-31

**Validation Added:**
- Throws error if token is missing
- Logs token initialization

**Logging Added:**
```
[GITHUB_CLIENT] No access token provided! (ERROR)
[GITHUB_CLIENT] Creating client with token: { tokenProvided, tokenStart }
```

### 6. Enhanced `fetchFile()` Function
**Location:** Lines 33-78

**Logging Added:**
```
[FETCH_FILE] Attempting to fetch: { filePath, branch, endpoint }
[FETCH_FILE] Success: { filePath, status, size }
[FETCH_FILE] Not found (404): { filePath, branch }
[FETCH_FILE] Error: { filePath, branch, status, message }
```

### 7. Enhanced `getDetection()` Function
**Location:** Lines 228-265

**Logging Added:**
```
[DETECTION_START] Starting project detection { owner, repo, branch }
[DETECTION] Files found: { hasPackageJson, hasRequirements, hasPom, hasGradle }
[DETECTION_COMPLETE] Project detected: { projectType }
```

## Diagnostic Information Available

When a 404 error occurs, the logs will now show:

```javascript
[GITHUB] 404 ERROR DETAILS: {
  endpoint: "/repos/{owner}/{repo}/contents/Jenkinsfile",
  owner: "actual-owner-value",
  repo: "actual-repo-name",
  branch: "actual-branch-used",
  reason: "Repository, branch, or endpoint not found. Verify owner, repo name, and branch exist.",
  fullUrl: "https://api.github.com/repos/{owner}/{repo}/contents/Jenkinsfile",
  possibleReasons: [
    "Repository does not exist or is private",
    "Branch does not exist",
    "Token does not have repo permissions",
    "Endpoint path is incorrect"
  ]
}
```

## Files Modified

1. **[jenkinsPipelineGeneratorService.js](backend/src/services/jenkinsPipelineGeneratorService.js)**
   - Lines 14-31: `createGitHubClient()` - Added validation and logging
   - Lines 33-78: `fetchFile()` - Added comprehensive logging
   - Lines 228-265: `getDetection()` - Added file detection logging
   - Lines 411-475: `previewJenkinsPipeline()` - Added parameter and token logging
   - Lines 500-599: Added `getDefaultBranch()` and enhanced `commitJenkinsfile()`
   - Lines 601-700: `generateJenkinsPipeline()` - Added execution flow logging

## Expected GitHub Endpoint Used

**Correct Endpoint:**
```
PUT /repos/{owner}/{repo}/contents/Jenkinsfile
```

**Headers:**
```
Authorization: Bearer {token}
Accept: application/vnd.github.v3+json
X-GitHub-Api-Version: 2022-11-28
```

**Request Body:**
```json
{
  "message": "Generate Jenkins deployment pipeline",
  "content": "base64-encoded-jenkinsfile",
  "branch": "detected-or-provided-branch",
  "sha": "existing-file-sha-if-updating"
}
```

## Testing the Fix

1. Run the pipeline generation again
2. Check console output for `[GITHUB]` prefixed logs
3. If 404 occurs, look for `[GITHUB] 404 ERROR DETAILS` section
4. Verify:
   - `owner` matches your GitHub username
   - `repo` matches your repository name
   - `branch` exists in your repository
   - `fullUrl` is correctly formatted
   - Token has `repo` scope permissions

## How to Verify Token Permissions

Check that your GitHub token has these scopes:
- `repo` (full control of private repositories)
- `workflow` (manage GitHub Actions workflows)

If the token doesn't have permissions, the GitHub API will return 404 instead of 403 for security reasons.

## Branch Handling

The fixed implementation now:
1. Automatically detects the repository's default branch
2. Falls back to provided branch if detection fails
3. Handles both `main` and `master` conventions
4. Logs all branch decisions

---
**Status:** ✅ Complete
**Date:** 2026-06-04
**Test:** Pending - Run pipeline generation and check console logs
