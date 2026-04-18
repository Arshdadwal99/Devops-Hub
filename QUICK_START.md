# 🚀 Quick Start: Google Authentication Setup

Your DevOps Dashboard now has **Login & Signup** with **Google OAuth 2.0** authentication!

## What's New

✅ Email/Password authentication (signup & login)  
✅ Google OAuth 2.0 integration  
✅ Protected dashboard routes  
✅ JWT-based API authentication  
✅ User profile management  

## 🔧 Setup in 3 Steps

### Step 1: Get Google OAuth Credentials (5 minutes)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google+ API
4. Create OAuth 2.0 Web Application credentials
5. Add `http://localhost:5173` to Authorized Redirect URIs
6. Copy your **Client ID** and **Client Secret**

### Step 2: Update Environment Variables

**Backend** (`backend/.env`):
```
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
JWT_SECRET=dev-secret-key-change-in-production
```

**Frontend** (`frontend/.env`):
```
VITE_GOOGLE_CLIENT_ID=your-client-id
```

### Step 3: Start & Test

Frontend is running at **http://localhost:5173**

- 🔑 Login page: http://localhost:5173/login
- 📝 Signup page: http://localhost:5173/signup
- 📊 Dashboard: http://localhost:5173/ (protected)

## 🧪 Test It Out

1. **Email/Password**: 
   - Go to signup and create an account
   - Login with your email and password

2. **Google OAuth**:
   - Click "Sign in with Google" button
   - Use your Google account
   - Automatically creates/logs in user

## 📁 New Files Created

```
Backend:
├── src/models/User.js              (User schema with password hashing)
├── src/middleware/authMiddleware.js (JWT verification)
├── src/services/authService.js     (Auth logic)
├── src/routes/authRoutes.js        (Login/signup endpoints)
└── .env                            (Updated with auth config)

Frontend:
├── src/pages/Login.jsx             (Login page)
├── src/pages/Signup.jsx            (Signup page)
├── src/pages/Dashboard.jsx         (Protected dashboard)
├── src/components/ProtectedRoute.jsx (Route protection)
├── src/lib/AuthContext.jsx         (Auth state management)
└── src/App.jsx                     (Routing setup)
```

## 📚 Full Documentation

- **AUTHENTICATION.md** - Complete authentication setup guide
- **README.md** - Updated with auth endpoints and info

## 🔑 API Endpoints

### Public (No Auth Required)
- `POST /api/auth/signup` - Register
- `POST /api/auth/login` - Login
- `POST /api/auth/google` - Google OAuth

### Protected (Require JWT Token)
- `GET /api/auth/me` - Get current user
- `GET /api/dashboard` - Get dashboard data
- `POST /api/deploy` - Deploy
- `POST /api/restart` - Restart services
- `POST /api/rollback` - Rollback

## ⚠️ Important Notes

**For Development:**
- Use the provided `.env` files
- Frontend redirects to login if unauthorized
- Token stored in localStorage (expires in 7 days)

**For Production:**
- Change JWT_SECRET to a strong random key
- Use HTTPS instead of HTTP
- Update CLIENT_ORIGIN to your domain
- Add production Google OAuth credentials
- Never commit .env files to git

## 🆘 Troubleshooting

**"Google login failed"?**
- Check VITE_GOOGLE_CLIENT_ID in frontend/.env
- Verify Client ID in Google Cloud Console
- Confirm http://localhost:5173 is in Authorized URIs

**"Invalid token"?**
- Clear localStorage and login again
- Check JWT_SECRET matches in backend/.env

**"CORS error"?**
- Ensure CLIENT_ORIGIN=http://localhost:5173 in backend/.env

## 🎉 You're All Set!

Your authentication system is ready. Users can:
- Create accounts with email/password
- Login with credentials
- Sign in with Google
- Access protected dashboard
- See their profile info and logout

Enjoy your secure DevOps dashboard!
