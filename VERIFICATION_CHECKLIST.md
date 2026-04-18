# ✅ Authentication Setup Verification Checklist

Follow this checklist to verify your authentication setup is working correctly.

## Phase 1: Configuration ✓ REQUIRED

- [ ] Create Google Cloud Project
- [ ] Enable Google+ API
- [ ] Create OAuth 2.0 Web Application credentials
- [ ] Copy Client ID and Client Secret
- [ ] Add http://localhost:5173 to Authorized Redirect URIs
- [ ] Update `backend/.env` with GOOGLE_CLIENT_ID
- [ ] Update `backend/.env` with GOOGLE_CLIENT_SECRET
- [ ] Update `frontend/.env` with VITE_GOOGLE_CLIENT_ID
- [ ] Verify JWT_SECRET is set in `backend/.env`
- [ ] Verify MONGODB_URI points to running MongoDB

## Phase 2: Backend Verification ✓

- [ ] Backend server running on http://localhost:5000
- [ ] No errors in backend console
- [ ] MongoDB connection successful (no connection errors)
- [ ] Auth routes registered (check `/api/auth/*` endpoints)

### Test Backend Endpoints

**Test Signup:**
```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User"
  }'
```
Expected: Returns `{user: {...}, token: "..."}` ✓

**Test Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```
Expected: Returns `{user: {...}, token: "..."}` ✓

**Test Protected Route (without token):**
```bash
curl http://localhost:5000/api/dashboard
```
Expected: Returns `401 Unauthorized` ✓

**Test Protected Route (with token):**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:5000/api/dashboard
```
Expected: Returns dashboard data ✓

- [ ] Signup endpoint working (/api/auth/signup)
- [ ] Login endpoint working (/api/auth/login)
- [ ] Google auth endpoint working (/api/auth/google)
- [ ] Protected routes return 401 without token
- [ ] Protected routes return data with valid token
- [ ] User data saved in MongoDB

## Phase 3: Frontend Verification ✓

- [ ] Frontend server running on http://localhost:5173
- [ ] No errors in browser console
- [ ] Google library loaded (check window.google in console)
- [ ] React Router initialized

### Test Frontend Routes

- [ ] **Login Page**: Open http://localhost:5173/login
  - [ ] Email input field visible
  - [ ] Password input field visible
  - [ ] Google button visible
  - [ ] Link to signup page works

- [ ] **Signup Page**: Open http://localhost:5173/signup
  - [ ] Name input field visible
  - [ ] Email input field visible
  - [ ] Password input field visible
  - [ ] Confirm password field visible
  - [ ] Google button visible
  - [ ] Link to login page works

- [ ] **Dashboard**: Open http://localhost:5173/
  - [ ] Redirects to login (unauthenticated)
  - [ ] Cannot access without token

## Phase 4: End-to-End Testing ✓

### Email/Password Authentication

1. [ ] Navigate to http://localhost:5173/signup
2. [ ] Fill in form:
   - Name: "Test User"
   - Email: "test@example.com"
   - Password: "password123"
   - Confirm: "password123"
3. [ ] Click "Sign Up"
4. [ ] Verify:
   - [ ] Redirected to dashboard
   - [ ] User info displays at top right
   - [ ] Token saved in localStorage
5. [ ] Check browser console:
   ```javascript
   localStorage.getItem('authToken') // Should return token
   ```
6. [ ] Logout button visible and clickable
7. [ ] Click Logout
8. [ ] Verify:
   - [ ] Redirected to login
   - [ ] localStorage cleared
9. [ ] Navigate to http://localhost:5173/login
10. [ ] Login with same credentials
11. [ ] Verify:
    - [ ] Redirected to dashboard
    - [ ] User info displays

### Google OAuth Authentication

1. [ ] Navigate to http://localhost:5173/signup
2. [ ] Click "Sign in with Google" button
3. [ ] Verify:
   - [ ] Google login popup appears
   - [ ] Can sign in with Google account
   - [ ] Redirected to dashboard after login
   - [ ] User info displays (name, email from Google)
   - [ ] Token saved in localStorage
4. [ ] Logout
5. [ ] Navigate to http://localhost:5173/login
6. [ ] Click "Sign in with Google" button
7. [ ] Verify:
   - [ ] Signs in with same Google account
   - [ ] Redirected to dashboard
   - [ ] Same user info displays

## Phase 5: API Protection Testing ✓

1. [ ] Open browser developer tools (F12)
2. [ ] Go to Console tab
3. [ ] Get authentication token:
   ```javascript
   const token = localStorage.getItem('authToken');
   console.log(token);
   ```
4. [ ] Test API calls:
   ```javascript
   // With token (should work)
   fetch('http://localhost:5000/api/dashboard', {
     headers: {'Authorization': `Bearer ${token}`}
   }).then(r => r.json()).then(console.log);
   
   // Without token (should fail with 401)
   fetch('http://localhost:5000/api/dashboard')
     .then(r => r.json()).then(console.log);
   ```
5. [ ] Verify:
   - [ ] API works with valid token
   - [ ] API returns 401 without token
   - [ ] Invalid token also returns 401

## Phase 6: Database Verification ✓

1. [ ] Connect to MongoDB:
   ```bash
   mongosh mongodb://localhost:27017/devops-dashboard
   ```
2. [ ] Check users collection:
   ```javascript
   db.users.find().pretty()
   ```
3. [ ] Verify:
   - [ ] User documents created
   - [ ] Email field present
   - [ ] Name field present
   - [ ] Password hashed (not plaintext)
   - [ ] authProvider field set correctly
   - [ ] Google signup users have googleId

## Phase 7: Error Handling ✓

### Test Invalid Credentials
- [ ] Login with wrong password → shows error message
- [ ] Login with non-existent email → shows error message
- [ ] Signup with existing email → shows error message
- [ ] Signup with mismatched passwords → shows error message
- [ ] Signup with short password → shows error message

### Test Error Recovery
- [ ] Error message displays clearly
- [ ] Can retry after error
- [ ] Form data persists after error (optional)

## Phase 8: Browser Features ✓

- [ ] Page refresh while authenticated → stays logged in
- [ ] Page refresh while logout → redirects to login
- [ ] Browser back button after logout → doesn't access dashboard
- [ ] Multiple tabs → share same authentication state
- [ ] Clearing localStorage → forces re-login

## Phase 9: Security Verification ✓

1. [ ] Check that passwords are hashed:
   ```javascript
   // Should NOT see plaintext passwords in DB
   db.users.findOne() // password field should be hashed
   ```

2. [ ] Verify token format:
   ```javascript
   // Should be JWT format (three parts separated by dots)
   localStorage.getItem('authToken')
   // Example: eyJhbGc...iLCJ1c2VySWQi...Ny41NzYwMjU
   ```

3. [ ] Check API security:
   - [ ] CORS properly configured
   - [ ] Can't access API from different origin (if applicable)
   - [ ] Authorization header required for protected routes

## Phase 10: Production Readiness ✓

- [ ] JWT_SECRET changed from default value
- [ ] Not hardcoding secrets in code
- [ ] .env file in .gitignore
- [ ] Error messages don't expose sensitive info
- [ ] HTTPS ready (for production deployment)
- [ ] Environment variables documented
- [ ] Deployment instructions clear

## 🎯 Final Checklist

### If All Above Pass ✅
- [ ] Authentication fully functional
- [ ] Google OAuth working
- [ ] Routes properly protected
- [ ] Database storing users correctly
- [ ] Security measures in place
- [ ] Ready for development/deployment

### If Issues Found ❌
Check:
- [ ] Google Client ID correct in both files
- [ ] MongoDB running and accessible
- [ ] Port 5000 (backend) available
- [ ] Port 5173 (frontend) available
- [ ] VITE_GOOGLE_CLIENT_ID matches GOOGLE_CLIENT_ID
- [ ] .env files in correct locations
- [ ] No typos in configuration
- [ ] Browser console for errors
- [ ] Backend console for errors

## 📝 Notes

- Default JWT expiration: 7 days
- Password hash rounds: 10 (bcryptjs)
- Token stored in: localStorage
- CORS origin: http://localhost:5173
- MongoDB collection: users

## 🆘 Support

If you encounter issues:
1. Check AUTHENTICATION.md for detailed guide
2. Review IMPLEMENTATION_SUMMARY.md for architecture
3. Check browser console (F12) for errors
4. Check backend terminal for error messages
5. Verify all environment variables are set
6. Ensure MongoDB is running
