# One-Click Deployment - Quick Fix Guide

## ✅ Status: BACKEND API FULLY OPERATIONAL

---

## Test These URLs in Your Browser Right Now

### Health Checks (No Auth Required)

**1. General Health**
```
http://localhost:5000/api/health
```
Expected Response:
```json
{
  "ok": true,
  "message": "Server is running",
  "dbConnected": true,
  "timestamp": "..."
}
```

**2. Deployment API Health**
```
http://localhost:5000/api/deployment/health
```
Expected Response:
```json
{
  "status": "ok",
  "service": "deployment",
  "ready": true,
  "dbConnected": true,
  "endpoints": { ... }
}
```

**3. Deployment Test Endpoint**
```
POST http://localhost:5000/api/deployment/test
```
Expected Response:
```json
{
  "success": true,
  "message": "Deployment test endpoint is working",
  "dbConnected": true
}
```

---

## If Browser Shows Connection Refused

1. **Check backend is running**
   - Terminal should show: `✅ Backend listening on port 5000`
   - If not, run: `cd backend && npm start`

2. **Check frontend environment**
   - Open browser DevTools (F12)
   - Console tab, run:
   ```javascript
   console.log(import.meta.env.VITE_API_URL)
   ```
   - Should show: `http://localhost:5000/api`

3. **Rebuild frontend**
   - If API URL changed: `cd frontend && npm run build`

4. **Check localhost:5000 accessibility**
   - Can you access http://localhost:5000 ?
   - Can you access http://localhost:5000/api/health ?
   - If no → Port 5000 not accessible (firewall/network issue)

---

## For Development/Testing

### 1. Start Backend with Logging Visible
```bash
cd backend
npm start
```
**Watch for**:
- `✅ [Routes] Deployment routes registered on /api/deployment`
- `✅ Backend listening on port 5000`

### 2. Check Frontend Can Connect
Open browser console:
```javascript
fetch('http://localhost:5000/api/deployment/health')
  .then(r => r.json())
  .then(d => console.log('✅ Backend:', d))
  .catch(e => console.error('❌ Error:', e.message))
```

### 3. Test One-Click Flow Manually
```javascript
const token = localStorage.getItem('authToken');
fetch('http://localhost:5000/api/deployment/one-click-validate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    repositoryUrl: 'https://github.com/example/repo'
  })
})
.then(r => r.json())
.then(d => console.log('Response:', d))
.catch(e => console.error('Error:', e.message))
```

---

## Route Summary

### Public Routes (No Auth)
- ✅ `GET /api/health` - Basic health check
- ✅ `GET /api/deployment/health` - Deployment service health
- ✅ `POST /api/deployment/test` - Test endpoint

### Protected Routes (Require Auth Token)
- ✅ `POST /api/deployment/one-click-validate` - Validate integrations
- ✅ `POST /api/deployment/one-click-deploy` - Start deployment
- ✅ `POST /api/deployment/start` - Alias for deploy
- ✅ `GET /api/deployment/status/:id` - Get deployment status
- ✅ `GET /api/deployment/:deploymentId/progress` - Get progress

---

## Error Troubleshooting

### ERR_CONNECTION_REFUSED
**Cause**: Cannot reach backend at all
**Solution**: 
1. Check backend is running: `cd backend && npm start`
2. Check port 5000 is not blocked
3. Check frontend API URL: `VITE_API_URL=http://localhost:5000/api`

### 401 Unauthorized
**Cause**: Request missing or invalid auth token
**Solution**:
1. Log in to get token
2. Check localStorage has `authToken`
3. Verify token is sent in Authorization header

### 404 Not Found
**Cause**: Endpoint doesn't exist or wrong path
**Solution**:
1. Check exact endpoint URL
2. Use public endpoints for testing (`/health`, `/test`)
3. Check backend logs for "Unhandled request" message

### 500 Internal Server Error
**Cause**: Backend error processing request
**Solution**:
1. Check backend logs for error stack trace
2. Verify request body is valid JSON
3. Check MongoDB is connected
4. Check all required parameters are provided

---

## What Was Fixed

### Backend Improvements
✅ Enhanced logging for deployment routes
✅ Added public health check endpoints
✅ Added detailed error logging to handlers
✅ Added catch-all route handler for debugging
✅ Improved startup messages

### What's Now Working
✅ Deployment routes registered correctly
✅ Public endpoints for health checks
✅ Protected endpoints with auth
✅ Comprehensive error logging
✅ Easy debugging with public test endpoints

---

## Next Step

**For Frontend**: If still getting errors, rebuild with:
```bash
cd frontend
npm run build
npm run preview
```

Then test again in browser.

**Backend is ready to go!** ✅
