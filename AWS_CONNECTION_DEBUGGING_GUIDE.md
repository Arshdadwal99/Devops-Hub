# AWS Connection Debugging Guide

## Overview

This guide explains how to debug AWS connection issues in DevOps Hub with detailed logging and error reporting.

## Architecture

### Backend Logging (Node.js Console)

The backend logs detailed information for every AWS connection attempt through:
- **File**: `backend/src/routes/awsController.js`
- **Endpoint**: `POST /api/aws/connect`
- **Request ID**: Unique identifier for tracking each connection attempt

### Frontend Error Display (Browser)

The frontend displays:
- Error message from backend
- Detailed error description  
- Browser console logs with full debugging context
- Request ID for correlation with backend logs

---

## Connection Flow with Debugging

### Step 1: Request Received

**Backend Log:**
```
POST /api/aws/connect - Request received
- requestId: abc123def456
- userId: user_id
- step: request_received
- payload:
  - connectionName: "Production AWS"
  - region: "us-east-1"
  - accessKeyPrefix: "AKIA***" (only first 4 chars shown)
  - accessKeyIdLength: 20
  - secretAccessKeyLength: 40
```

**What to Check:**
- Verify the region code is correct (e.g., `us-east-1`, `eu-west-1`)
- Confirm access key and secret key lengths match expected AWS format

### Step 2: Input Validation

**Backend Log (Success):**
```
POST /api/aws/connect - Validations passed
- step: input_validation_passed
- connectionName: "Production AWS"
- region: "us-east-1"
```

**Backend Log (Failure):**
```
POST /api/aws/connect - Input validation failed
- step: input_validation_failed
- missingFields: ["accessKeyId"]
```

**What to Check:**
- Ensure all required fields are provided
- Field names must be exact: `connectionName`, `region`, `accessKeyId`, `secretAccessKey`

### Step 3: Region Validation

**Backend Log (Success):**
```
POST /api/aws/connect - Region validation passed
- step: region_validation_passed
- region: "us-east-1"
```

**Backend Log (Failure):**
```
POST /api/aws/connect - Region validation failed
- step: region_validation_failed
- regionCode: "invalid-region"
- regionRegex: "/^[a-z]{2}-[a-z]+-\d{1}$/"
```

**Valid AWS Regions:**
- US: `us-east-1`, `us-east-2`, `us-west-1`, `us-west-2`
- EU: `eu-west-1`, `eu-central-1`, `eu-west-2`, `eu-west-3`
- Asia Pacific: `ap-south-1`, `ap-southeast-1`, `ap-southeast-2`, `ap-northeast-1`, `ap-northeast-2`
- Other: `ca-central-1`, `sa-east-1`

### Step 4: AWS Credential Validation (STS GetCallerIdentity)

**Backend Log (Success):**
```
POST /api/aws/connect - Credentials validated
- step: aws_credential_validation_success
- accountId: "123456789012"
- arn: "arn:aws:iam::123456789012:user/devops-user"
- userId: "AIDAI3EXAMPLE5Q5EXAMPLE"
- region: "us-east-1"
```

**Backend Sub-steps:**
1. AWS SDK initialization
2. STS GetCallerIdentity request
3. Account information retrieval

**Backend Log (SDK Init Failure):**
```
POST /api/aws/connect - AWS SDK Initialization Failed
- step: aws_sdk_initialization
- error: "The provided credentials could not be validated"
- errorCode: "InvalidClientTokenId"
- errorType: "INVALID_ACCESS_KEY"
```

**Backend Log (STS Request Failure):**
```
POST /api/aws/connect - Credential validation failed
- step: aws_credential_validation_failed
- errorMessage: "The AWS Access Key Id you provided does not exist..."
- errorCode: "InvalidClientTokenId"
- errorType: "INVALID_ACCESS_KEY"
- requestId: "abc123def456"
```

---

## Common Error Types and Solutions

### 1. Invalid AWS Access Key ID
**Error Message:** "Invalid AWS Access Key ID"  
**Error Code:** `InvalidClientTokenId`  
**Error Type:** `INVALID_ACCESS_KEY`

**Debugging:**
- Verify the Access Key ID is correct
- Check that the key hasn't been deleted from AWS IAM
- Ensure the key format starts with "AKIA" (for long-term credentials) or "ASIA" (for temporary credentials)

**Solution:**
1. Go to AWS IAM → Users → Your User
2. Click "Security credentials"
3. Create a new Access Key ID
4. Update the credentials in DevOps Hub

### 2. Invalid AWS Secret Access Key
**Error Message:** "Invalid AWS Secret Access Key"  
**Error Code:** `SignatureDoesNotMatch`  
**Error Type:** `INVALID_SECRET_KEY`

**Debugging:**
- Most common cause: typo in the Secret Access Key
- Verify the key exactly as displayed in AWS IAM
- Ensure no extra spaces at beginning or end

**Solution:**
1. Go to AWS IAM → Users → Your User
2. Click "Security credentials"
3. Create a new Access Key ID and Secret Access Key
4. Copy carefully (AWS only shows the key once)

### 3. Access Denied
**Error Message:** "Access Denied"  
**Error Code:** `AccessDenied` or `UnauthorizedOperation`  
**Error Type:** `ACCESS_DENIED`

**Debugging:**
- Your IAM user/role doesn't have permission to use STS GetCallerIdentity
- Check IAM policy attached to your user

**Solution:**
1. Go to AWS IAM → Users → Your User
2. Click "Add permissions"
3. Attach policy: "AdministratorAccess" or custom policy with:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "sts:GetCallerIdentity",
           "ec2:*",
           "iam:*",
           "s3:*"
         ],
         "Resource": "*"
       }
     ]
   }
   ```

### 4. Invalid Region
**Error Message:** "Invalid Region"  
**Error Code:** `InvalidParameterValue`  
**Error Type:** `INVALID_REGION`

**Debugging:**
- Region code format is invalid
- Check the region regex: `/^[a-z]{2}-[a-z]+-\d{1}$/`

**Solution:**
- Select a valid region from the dropdown
- Valid format examples: `us-east-1`, `eu-west-1`, `ap-northeast-1`

### 5. Network Connectivity Issue
**Error Message:** "Network Connectivity Issue"  
**Error Code:** `ECONNREFUSED`, `ETIMEDOUT`, or `ENOTFOUND`  
**Error Type:** `NETWORK_ERROR`

**Debugging:**
- Backend cannot reach AWS API endpoints
- Check firewall/VPN/proxy settings
- Verify internet connectivity

**Solution:**
1. Test AWS CLI: `aws sts get-caller-identity`
2. If AWS CLI works but DevOps Hub doesn't, it's a backend connectivity issue
3. Check backend environment variables
4. Verify security groups allow outbound HTTPS (port 443)

### 6. AWS SDK Initialization Failed
**Error Message:** "AWS SDK Initialization Failed"  
**Error Code:** `SDK_INIT_FAILED`  
**Error Type:** `AWS_SDK_INITIALIZATION_FAILED`

**Debugging:**
- Error during SDK initialization
- Usually indicates invalid region or SDK version issue

**Solution:**
1. Verify region is valid
2. Check backend Node.js version
3. Reinstall AWS SDK: `npm install @aws-sdk/client-sts@latest`

### 7. Request Limit Exceeded
**Error Message:** "Request Limit Exceeded"  
**Error Code:** `RequestLimitExceeded`  
**Error Type:** `REQUEST_LIMIT_EXCEEDED`

**Debugging:**
- Too many requests to AWS API
- STS has rate limits

**Solution:**
1. Wait 1-2 minutes
2. Retry the connection

### 8. Missing Required Fields
**Error Message:** "Missing required fields"  
**Error Type:** `INPUT_VALIDATION_ERROR`

**Debugging:**
- One or more required fields not provided
- Check which fields are missing in logs

**Solution:**
- Ensure all fields are filled:
  - Connection Name
  - Access Key ID
  - Secret Access Key
  - Region

---

## How to Use the Debugging Information

### Locate the Request ID

**In Browser Console (F12):**
```javascript
// Output shows requestId
[AWS Connection Error] {
  requestId: "abc123def456",
  // ... other details
}
```

### Find Backend Logs

**In Terminal running backend:**
```bash
# Look for logs with matching requestId
# Search for the requestId in the terminal output
grep "abc123def456" backend-logs.txt
```

### Full Debug Session Example

1. **User tries to connect** with invalid credentials
2. **Frontend shows error:** "Invalid AWS Access Key ID: The AWS Access Key Id you provided does not exist..."
3. **Browser console logs:**
   ```
   [AWS Connection Error] {
     error: "Invalid AWS Access Key ID",
     details: "The AWS Access Key Id you provided does not exist in the system.",
     failureType: "INVALID_ACCESS_KEY",
     errorCode: "InvalidClientTokenId",
     requestId: "abc123def456"
   }
   ```
4. **Backend terminal shows:**
   ```
   [DevOpsHub] ERROR: POST /api/aws/connect - Credential validation failed
   {
     requestId: "abc123def456",
     userId: "user123",
     step: "aws_credential_validation_failed",
     error: "The AWS Access Key Id you provided does not exist...",
     errorCode: "InvalidClientTokenId",
     errorType: "INVALID_ACCESS_KEY"
   }
   ```
5. **User action:** Generate new Access Key ID in AWS IAM and retry

---

## Testing AWS Connection

### Test 1: AWS CLI Verification

```bash
# This should match the credentials used in DevOps Hub
aws sts get-caller-identity

# Expected output:
{
    "UserId": "AIDAI3EXAMPLE5Q5EXAMPLE",
    "Account": "123456789012",
    "Arn": "arn:aws:iam::123456789012:user/devops-user"
}
```

### Test 2: Backend Logging

1. Open terminal running backend server
2. Watch for detailed logs when connecting
3. Look for all these steps:
   - ✅ request_received
   - ✅ input_validation_passed
   - ✅ region_validation_passed
   - ✅ aws_credential_validation_start
   - ✅ aws_credential_validation_success
   - ✅ account_info_retrieval_start
   - ✅ account_info_retrieval_success
   - ✅ connection_save_success

### Test 3: Frontend Error Display

1. Open DevOps Hub in browser
2. Go to AWS Connections
3. Try to connect with incorrect credentials
4. Verify error message displays
5. Open browser DevTools (F12) → Console
6. Look for [AWS Connection Error] log with requestId

---

## Troubleshooting Checklist

- [ ] AWS CLI `aws sts get-caller-identity` works
- [ ] Access Key ID is correct (starts with AKIA or ASIA)
- [ ] Secret Access Key is correct (no typos, no extra spaces)
- [ ] Region is valid (check dropdown list)
- [ ] IAM user has permission to use STS GetCallerIdentity
- [ ] Backend is running (`npm run dev:backend`)
- [ ] Frontend can reach backend (check Network tab in DevTools)
- [ ] Internet connection is stable
- [ ] No proxy/firewall blocking AWS API calls
- [ ] Check browser console (F12) for detailed error logs
- [ ] Check backend terminal for matching requestId logs

---

## Logging Format Reference

### Backend Log Fields

Every log entry includes:
- `requestId`: Unique identifier for correlation
- `userId`: User making the request
- `step`: Step in the connection process
- `error`: Error message (if applicable)
- `errorCode`: AWS error code
- `errorType`: Categorized error type
- `stackTrace`: Full stack trace (if applicable)
- `duration`: Time taken (milliseconds)

### Error Response Format

```json
{
  "success": false,
  "error": "Display error title",
  "details": "Detailed error message",
  "failureType": "ERROR_TYPE",
  "errorCode": "ErrorCode",
  "errorType": "ERROR_CLASSIFICATION",
  "requestId": "unique-request-id",
  "duration": 1234
}
```

---

## Next Steps

If you still encounter issues after following this guide:

1. Collect the `requestId` from error message
2. Find corresponding backend logs
3. Note all error codes and types
4. Share with support team with:
   - Browser error screenshot
   - Backend logs with matching requestId
   - AWS CLI test result (`aws sts get-caller-identity`)
   - Backend and frontend version information

---

## Key Failing Lines Reference

When debugging fails, these are the exact lines to check:

### Backend (`src/routes/awsController.js`):
- **Line ~32**: Request payload logging
- **Line ~49**: Input validation
- **Line ~71**: Region validation
- **Line ~89**: Credential validation start
- **Line ~98**: Error handling for credentials

### Backend (`src/services/awsProviderService.js`):
- **Line ~103**: STS client initialization
- **Line ~139**: GetCallerIdentity request
- **Line ~155**: STS error handling
- **Line ~200**: Error classification

### Frontend (`src/pages/AWSConnection.jsx`):
- **Line ~130**: Error extraction from response
- **Line ~147**: Console logging for debugging
- **Line ~238**: Error display component

---

## Log Examples

### Successful Connection
```
POST /api/aws/connect - Request received
POST /api/aws/connect - Validations passed
POST /api/aws/connect - Starting credential validation
POST /api/aws/connect - Credentials validated
POST /api/aws/connect - Retrieving account info
POST /api/aws/connect - Account info retrieved
POST /api/aws/connect - Creating new connection
POST /api/aws/connect - Success
```

### Failed Connection (Invalid Key)
```
POST /api/aws/connect - Request received
POST /api/aws/connect - Validations passed
POST /api/aws/connect - Starting credential validation
POST /api/aws/connect - Credential validation failed
  error: "The AWS Access Key Id you provided does not exist..."
  errorCode: "InvalidClientTokenId"
  errorType: "INVALID_ACCESS_KEY"
```

### Failed Connection (Access Denied)
```
POST /api/aws/connect - Request received
POST /api/aws/connect - Validations passed
POST /api/aws/connect - Starting credential validation
POST /api/aws/connect - Credential validation failed
  error: "User: arn:aws:iam::123456789012:user/test is not authorized..."
  errorCode: "AccessDenied"
  errorType: "ACCESS_DENIED"
```
