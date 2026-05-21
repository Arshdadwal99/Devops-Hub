# 🔧 Troubleshooting Guide

## Common Issues & Solutions

### ❌ Error: "Failed to fetch" on Login Page

**Cause:** Backend server is not running or not responding.

**Solution:**

1. **Start the Backend Server**
   ```powershell
   npm run dev:backend
   ```
   You should see:
   ```
   ✅ MongoDB connected successfully
   ✅ Backend listening on port 5000
   📍 API Base: http://localhost:5000/api
   ```

2. **Verify MongoDB is Running**
   - MongoDB should be running on `localhost:27017`
   - Check if MongoDB is installed and running

3. **Check Network Connection**
   - Ensure frontend can reach `http://localhost:5000/api`
   - Check browser console (F12) for detailed error messages

---

### ❌ Error: "Network error: Could not connect to server"

**Cause:** Backend is not running or not accessible.

**Solution:**

1. **Start Backend (if not running)**
   ```powershell
   npm run dev:backend
   ```

2. **Check Backend Port**
   - Verify backend is running on port 5000
   - Check if port 5000 is not blocked by firewall

3. **Check Frontend Configuration**
   - Frontend `.env` should have:
     ```
     VITE_API_URL=http://localhost:5000/api
     ```

---

### ❌ Error: "Request timeout: Server is not responding"

**Cause:** Backend is slow or unresponsive.

**Solution:**

1. **Check Backend Console**
   - Look for errors in the backend terminal
   - Check if MongoDB is connected

2. **Restart Backend**
   ```powershell
   # Stop the backend (Ctrl+C)
   # Then start it again
   npm run dev:backend
   ```

3. **Check System Resources**
   - Ensure your computer has enough CPU/RAM
   - Close unnecessary applications

---

### ❌ Error: "Database unavailable"

**Cause:** MongoDB is not running or not accessible.

**Solution:**

1. **Start MongoDB**
   ```powershell
   # Windows (if MongoDB is installed as service)
   net start MongoDB
   
   # Or use MongoDB Compass to check if it's running
   ```

2. **Verify MongoDB Connection**
   - MongoDB should be running on `localhost:27017`
   - Check `backend/.env` for correct `MONGODB_URI`

3. **Test MongoDB Connection**
   ```powershell
   # Try connecting to MongoDB
   mongosh  # or mongo (depending on version)
   ```

---

### ❌ Login/Signup Fails After Credentials Entered

**Cause:** Either MongoDB is unavailable or there's an API error.

**Solution:**

1. **Check Backend Console** for error messages
2. **Verify MongoDB Connection**
3. **Check Email Format** - Make sure email is valid
4. **Check Password** - Password must be at least 6 characters
5. **Clear Browser Cache**
   - Open DevTools (F12) → Application → Local Storage
   - Delete `authToken` if it exists

---

### ❌ Google OAuth Login Not Working

**Cause:** Google credentials not configured or incorrect.

**Solution:**

1. **Verify Google OAuth Setup**
   - Check `backend/.env` has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   - Check `frontend/.env` has `VITE_GOOGLE_CLIENT_ID`

2. **Test Google Setup**
   - Credentials should be from [Google Cloud Console](https://console.cloud.google.com/)
   - Authorized redirect URIs should include `http://localhost:5173`

3. **Clear Browser Cookies**
   - Clear all cookies related to Google
   - Refresh the page

---

### ❌ Frontend Not Loading / Blank Page

**Cause:** Frontend server not running or build issues.

**Solution:**

1. **Start Frontend Server**
   ```powershell
   npm run dev:frontend
   ```
   
   You should see:
   ```
   VITE v7.3.2 ready in 389 ms
   ➜ Local: http://localhost:5174/
   ```

2. **Check Vite Configuration**
   - Verify `frontend/vite.config.js` is correct
   - Check `frontend/package.json` for dependencies

3. **Install Dependencies**
   ```powershell
   cd frontend
   npm install
   cd ..
   ```

4. **Clear Node Modules and Reinstall**
   ```powershell
   rm -r frontend/node_modules
   npm install
   ```

---

### ❌ Port Already in Use

**Cause:** Another application is using port 5000 or 5173.

**Solution:**

1. **Find Process Using Port 5000**
   ```powershell
   netstat -ano | findstr :5000
   ```

2. **Kill Process**
   ```powershell
   taskkill /PID <PID> /F
   ```

3. **Change Port (Alternative)**
   - Edit `backend/.env`: Change `PORT=5001`
   - Update `frontend/.env`: Change `VITE_API_URL=http://localhost:5001/api`

---

### ❌ "Cannot find module" Error in Backend

**Cause:** Dependencies not installed or incorrect import path.

**Solution:**

1. **Install Dependencies**
   ```powershell
   npm install
   ```

2. **Check Import Paths**
   - Verify all imports use correct relative paths
   - Check file extensions (should use `.js` even if importing from `.js` files)

3. **Clear Node Modules**
   ```powershell
   rm -r node_modules backend/node_modules
   npm install
   ```

---

### ✅ How to Set Up Fresh Start

If you're experiencing multiple issues, try a clean setup:

```powershell
# 1. Stop all servers (Ctrl+C in terminal)

# 2. Clear node modules
rm -r node_modules backend/node_modules frontend/node_modules

# 3. Install fresh dependencies
npm install

# 4. Make sure MongoDB is running

# 5. Start both servers in separate terminals
# Terminal 1:
npm run dev:backend

# Terminal 2:
npm run dev:frontend
```

---

### 📋 Verification Checklist

Before opening the app, verify:

- [ ] **Backend running**
  ```
  ✅ MongoDB connected successfully
  ✅ Backend listening on port 5000
  ```

- [ ] **Frontend running**
  ```
  VITE v7.3.2 ready
  ➜ Local: http://localhost:5174/
  ```

- [ ] **MongoDB running**
  - Should be accessible on `localhost:27017`

- [ ] **Environment variables set**
  - `backend/.env` exists with required variables
  - `frontend/.env` exists with required variables

- [ ] **All URLs accessible**
  - http://localhost:5000/api/health (should show ✅)
  - http://localhost:5174 (should show login page)

---

### 🔗 Useful Commands

```powershell
# Check if port is in use
netstat -ano | findstr :<PORT>

# Kill process on port
taskkill /PID <PID> /F

# Check running services
Get-Process | grep -i node

# Clear npm cache
npm cache clean --force

# Reinstall all dependencies
npm install --legacy-peer-deps
```

---

### 📞 Still Having Issues?

1. **Check browser console** (F12) for JavaScript errors
2. **Check backend console** for server errors
3. **Check network tab** (F12 → Network) for failed API requests
4. **Check terminal output** for error messages
5. **Restart both servers** and refresh page

---

**Last Updated:** April 19, 2026
