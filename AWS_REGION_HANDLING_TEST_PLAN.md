# AWS Region Handling - Test Plan & Verification Guide

## Quick Start Test

### Prerequisites
- Backend running on port 5000
- Frontend running on port 5173 (Vite dev server)
- Browser developer tools console available
- MongoDB connected and operational

## Test Scenario 1: AWS Connection with Region Code

### Steps
1. **Navigate to AWS Connection Page**
   - URL: `http://localhost:5173/aws/connection`
   - Verify UI loads without errors

2. **Create New Connection**
   - Click "New Connection" button
   - Enter Connection Name: `test-region-handling`
   - Enter AWS Access Key ID
   - Enter AWS Secret Access Key
   - **Select Region:** Choose "N. Virginia (us-east-1)" from dropdown
   - Click "Connect"

3. **Verify in Console (Frontend)**
   - Open browser DevTools → Console tab
   - Look for log message: `[AWS Connection] Loaded AWS connections`
   - Verify region shows as `us-east-1` (NOT "N. Virginia (us-east-1)")
   - **Expected:** Connection card shows region code in UI

4. **Verify in Backend Logs**
   - Check terminal running backend
   - Look for logs showing:
     ```
     AWS Connection: Input validation, regionCode: us-east-1
     AWS Connection: Credentials validated, regionCode: us-east-1
     AWS Connection: Connection created, regionCode: us-east-1
     ```

### Expected Outcomes
✅ Connection page loads without errors
✅ Console shows region code (us-east-1) not label
✅ Backend logs show region code in each step
✅ Connection established successfully
✅ Database stores region code (us-east-1)

---

## Test Scenario 2: Infrastructure Provisioning with Region Code

### Prerequisites
- Completed Test Scenario 1
- AWS connection established

### Steps
1. **Navigate to Infrastructure Provisioning**
   - Click "Create Infrastructure" from connection dashboard
   - Or go to: `http://localhost:5173/infrastructure/provision/{connectionId}`

2. **Verify Region is Loaded**
   - Check browser console for log: `[AWS Provisioning] Connection loaded successfully`
   - Verify it shows: `region: "us-east-1"`
   - Verify no errors about invalid region code

3. **Configure Infrastructure**
   - Step 1: Select Instance Type (default: t3.micro)
   - Step 2: Select OS (Ubuntu 22.04 LTS)
   - Step 3: Set Storage (30 GB slider)
   - Step 4: Enter Name: `test-instance-region-handling`
   - Review shows Region: `us-east-1`

4. **Start Provisioning**
   - Click "Create Infrastructure"
   - Watch progress bar and steps

5. **Verify Console Logs (Frontend)**
   - Should see: `[AWS Provisioning] Starting infrastructure provisioning`
   - Should show: `region: "us-east-1"`
   - Each step should log with region code

6. **Verify Backend Logs**
   - Check terminal for logs like:
     ```
     Infrastructure provisioning: Initialization, regionCode: us-east-1
     Infrastructure provisioning: Creating security group, regionCode: us-east-1
     Infrastructure provisioning: Fetching AMI, regionCode: us-east-1
     Infrastructure provisioning: Creating EC2 instance, regionCode: us-east-1
     Infrastructure provisioning: Waiting for running state, regionCode: us-east-1
     ```

### Expected Outcomes
✅ Infrastructure provisioning completes without region errors
✅ EC2 instance created in correct AWS region
✅ Backend logs show region code throughout pipeline
✅ Frontend progress shows all steps completing
✅ Success screen displays instance details with region

---

## Test Scenario 3: Error Handling - Invalid Region

### Steps
1. **Trigger Invalid Region (via API)**
   - Use Postman or curl to send invalid region:
   ```bash
   POST http://localhost:5000/api/aws/connect
   {
     "accessKeyId": "valid-key",
     "secretAccessKey": "valid-secret",
     "region": "invalid-region-format",
     "connectionName": "error-test"
   }
   ```

2. **Verify Error Response**
   - Response should include:
     ```json
     {
       "error": "Invalid region format",
       "details": "Region must be a valid AWS region code like 'us-east-1'. Received: 'invalid-region-format'",
       "regionCode": "invalid-region-format"
     }
   ```

3. **Check Backend Logs**
   - Logs should indicate invalid region format

### Expected Outcomes
✅ Error message clearly indicates region issue
✅ Error response includes region code for debugging
✅ Backend logs the region code in error context
✅ HTTP status 400 (Bad Request)

---

## Test Scenario 4: Error Handling - Invalid Credentials

### Steps
1. **Connect with Invalid Credentials**
   - Region: us-east-1 (valid)
   - Access Key: invalid-key-12345
   - Secret: invalid-secret-12345

2. **Verify Error Message**
   - Frontend should show clear error
   - Error should NOT mention region as the problem
   - Error should identify which credential is wrong

3. **Check Backend Logs**
   - Logs should show region code was validated OK
   - Error should be about credentials, not region

### Expected Outcomes
✅ Clear error message about credentials
✅ Backend logs show region was valid
✅ Error message distinguishes between Access Key vs Secret Key issues

---

## Test Scenario 5: Multi-Region Connections

### Steps
1. **Create Connection in us-west-1**
   - Region: us-west-1
   - Name: `west-coast`

2. **Create Connection in eu-west-1**
   - Region: eu-west-1
   - Name: `europe`

3. **List Connections**
   - Click "View All Connections"
   - Verify console shows:
     ```
     [AWS Connection] Loaded AWS connections
       - Connection "west-coast": region code us-west-1
       - Connection "europe": region code eu-west-1
     ```

4. **Provision Infrastructure from Each Region**
   - Create instance from us-west-1 connection
   - Verify logs show region: us-west-1
   - Create instance from eu-west-1 connection
   - Verify logs show region: eu-west-1

### Expected Outcomes
✅ Multiple connections each maintain correct region code
✅ Provisioning uses correct region for each connection
✅ Logs show different region codes for different connections

---

## Test Scenario 6: Logging Verification

### Browser Console (Frontend)

**Expected Log Pattern:**
```javascript
// Connection loading
[AWS Connection] Connection loaded successfully {
  connectionId: "conn-id-123",
  region: "us-east-1",
  regionLabel: "N. Virginia",
  accountId: "123456789012"
}

// Provisioning start
[AWS Provisioning] Starting infrastructure provisioning {
  name: "test-instance",
  instanceType: "t3.micro",
  os: "ubuntu",
  storageSize: "30 GB",
  region: "us-east-1",
  regionLabel: "N. Virginia"
}

// Each provisioning step
[AWS Provisioning] Creating infrastructure with region code: us-east-1
```

### Backend Terminal (Backend Logs)

**Expected Log Pattern:**
```
AWS Connection: Input validation, regionCode: us-east-1
AWS Connection: Credentials validated, regionCode: us-east-1, accountId: 123456789012
Infrastructure provisioning: Initialization, regionCode: us-east-1
Infrastructure provisioning: Creating security group, regionCode: us-east-1
Infrastructure provisioning: Fetching AMI, regionCode: us-east-1
Infrastructure provisioning: Creating EC2 instance, regionCode: us-east-1
Infrastructure provisioning: Waiting for running state, regionCode: us-east-1
```

### Database Verification (MongoDB)

**Check AWS Connection Record:**
```json
{
  "_id": ObjectId("..."),
  "userId": "user-123",
  "connectionName": "test-region-handling",
  "region": "us-east-1",
  "accountId": "123456789012",
  "connected": true,
  "validatedAt": ISODate("2026-02-06T00:00:00Z")
}
```

**Check AWS Infrastructure Record:**
```json
{
  "_id": ObjectId("..."),
  "userId": "user-123",
  "instanceId": "i-0123456789abcdef0",
  "region": "us-east-1",
  "operatingSystem": "ubuntu",
  "instanceType": "t3.micro",
  "status": "running"
}
```

### Expected Outcomes
✅ All logs show region codes (e.g., us-east-1) not labels
✅ Logs appear at expected points in the flow
✅ Database records store region codes
✅ Error logs include region code for context

---

## Performance Metrics

### Expected Execution Times
- AWS Connection Creation: 2-5 seconds (credential validation)
- Infrastructure Provisioning:
  - Security Group Creation: 1-2 seconds
  - EC2 Instance Creation: 5-10 seconds
  - Instance Running State: 20-40 seconds
  - Total: 30-60 seconds

### Console Message Frequency
- Log messages should appear for each major step
- No more than 5-second gaps between log entries during provisioning

---

## Cleanup After Testing

### Delete Test Infrastructure (AWS Console or API)
```bash
# Via CLI
aws ec2 terminate-instances --instance-ids i-0123456789abcdef0 --region us-east-1
aws ec2 delete-security-group --group-id sg-0123456789abcdef0 --region us-east-1
```

### Delete Test Connections (MongoDB)
```javascript
db.awsconnections.deleteOne({ connectionName: "test-region-handling" })
```

---

## Validation Checklist

### Region Code Separation
- [ ] Frontend displays region labels to user (N. Virginia)
- [ ] Frontend sends region codes to backend (us-east-1)
- [ ] Backend stores region codes in database
- [ ] Backend uses region codes when calling AWS SDK
- [ ] AWS SDK receives valid region codes

### Error Handling
- [ ] Invalid region format caught with clear message
- [ ] Invalid credentials show appropriate error
- [ ] Access denied errors mention permissions
- [ ] Request limits are handled gracefully
- [ ] All errors include region code in logs

### Logging
- [ ] Frontend console shows region codes
- [ ] Backend logs show region codes throughout pipeline
- [ ] Each major step logs with region context
- [ ] Errors logged with region code for debugging

### User Experience
- [ ] Region selection dropdown clear and intuitive
- [ ] Region code visible in UI (as hint or confirmation)
- [ ] Error messages help user identify region issues
- [ ] Success messages confirm correct region

### AWS SDK Integration
- [ ] EC2 client created with region code
- [ ] STS client validates with region code
- [ ] All services receive consistent region code
- [ ] No silent failures from region mismatches

---

## Common Issues & Solutions

### Issue: "Invalid region format" error
**Cause:** Region dropdown may be sending label instead of code
**Solution:** Verify AWS_REGIONS.value is being sent, not label

### Issue: EC2 instance created in wrong region
**Cause:** Backend not using provided region parameter
**Solution:** Check awsProviderService.getEC2Client() is using region parameter

### Issue: No logs showing region code
**Cause:** Logger not formatting logs with regionCode field
**Solution:** Verify logger calls include regionCode field

### Issue: Connection succeeds but region not saved
**Cause:** AWSConnection model not storing region field
**Solution:** Verify connection.region = region before save()

---

## Success Criteria

✅ **All Test Scenarios Pass**
- Connections created with valid region codes
- Infrastructure provisioned in correct regions
- Error handling provides clear messages
- Logging shows region codes throughout

✅ **AWS SDK Compatibility**
- No region-related errors from AWS SDK
- EC2 instances created successfully
- Security groups created in correct regions

✅ **User Experience**
- Users understand which region is being used
- Clear error messages guide problem resolution
- Provisioning progress shows region context

✅ **Code Quality**
- No syntax errors in modified files
- All imports resolve correctly
- Logging is consistent across components
- Error messages are user-friendly
