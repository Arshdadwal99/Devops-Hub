# Authentication Setup Guide

This guide will walk you through setting up the authentication system for the DevOps Dashboard, including Google OAuth integration.

## Overview

The authentication system includes:
- **Email/Password Authentication**: Register and login with email and password
- **Google OAuth 2.0**: One-click login using Google accounts
- **JWT Tokens**: Secure API authentication with Bearer tokens
- **Protected Routes**: Dashboard is only accessible to authenticated users

## Step 1: Get Google OAuth Credentials

### Create a Google Cloud Project

1. Visit [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a Project" → "New Project"
3. Enter a project name (e.g., "DevOps Dashboard") and click "Create"
4. Wait for the project to be created

### Enable Google+ API

1. In the Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google+ API"
3. Click on it and press "Enable"

### Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, configure the OAuth consent screen first:
   - Select "External" user type
   - Fill in the required fields (app name, user support email)
   - In "Scopes", search for and add "email", "profile", "openid"
   - Add test users (optional)
   - Save and continue
4. For the credential type, select "Web application"
5. Add authorized redirect URIs:
   - `http://localhost:5173`
   - `http://localhost:8080`
   - `http://localhost:3000` (if testing on different ports)
6. Click "Create"
7. Copy your **Client ID** and **Client Secret**

## Step 2: Configure Environment Variables

### Backend Configuration

Create or update `backend/.env`:

```bash
PORT=5000
MONGODB_URI=mongodb://localhost:27017/devops-dashboard
CLIENT_ORIGIN=http://localhost:5173

# JWT Configuration
JWT_SECRET=your-super-secret-key-change-in-production

# Google OAuth
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID_HERE
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET_HERE
```

### Frontend Configuration

Create or update `frontend/.env`:

```bash
VITE_API_URL=http://localhost:5000/api
VITE_GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID_HERE
```

## Step 3: Start the Application

### Option A: Local Development

1. **Start MongoDB** (if not using Docker):
```bash
# Using MongoDB locally
mongod
```

2. **Terminal 1 - Backend**:
```bash
cd backend
npm install
npm run dev
```

3. **Terminal 2 - Frontend**:
```bash
cd frontend
npm install
npm run dev
```

The dashboard will be available at `http://localhost:5173`

### Option B: Docker Compose

```bash
docker compose up --build
```

The dashboard will be available at `http://localhost:8080`

## Step 4: Test Authentication

### Test Email/Password Authentication

1. Open `http://localhost:5173/signup`
2. Fill in the form with:
   - Name: Test User
   - Email: test@example.com
   - Password: password123
3. Click "Sign Up"
4. You should be redirected to the dashboard

### Test Google Authentication

1. Open `http://localhost:5173/login`
2. Click the "Sign in with Google" button
3. Sign in with your Google account
4. You should be redirected to the dashboard

### Test Protected Routes

1. Open the browser console and check that a token is stored:
```javascript
localStorage.getItem('authToken')
```

2. Try accessing the API directly:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:5000/api/dashboard
```

## File Structure

New authentication files added:

```
backend/
├── src/
│   ├── models/
│   │   └── User.js              # User schema with password hashing
│   ├── middleware/
│   │   └── authMiddleware.js    # JWT verification and token generation
│   ├── services/
│   │   └── authService.js       # Auth business logic
│   └── routes/
│       └── authRoutes.js        # Auth endpoints
├── .env                         # Environment variables
└── .env.example                 # Template for env variables

frontend/
├── src/
│   ├── pages/
│   │   ├── Login.jsx            # Login page with Google button
│   │   ├── Signup.jsx           # Signup page with Google button
│   │   └── Dashboard.jsx        # Protected dashboard
│   ├── components/
│   │   └── ProtectedRoute.jsx   # Route protection HOC
│   ├── lib/
│   │   ├── api.js               # API client with auth header
│   │   └── AuthContext.jsx      # Auth state management
│   └── App.jsx                  # Router setup
├── .env                         # Environment variables
└── .env.example                 # Template for env variables
```

## Authentication Flow

### Signup Flow
1. User fills signup form
2. Frontend sends POST to `/api/auth/signup`
3. Backend creates user with hashed password
4. Returns JWT token and user data
5. Frontend stores token in localStorage
6. Redirects to dashboard

### Login Flow
1. User enters email/password
2. Frontend sends POST to `/api/auth/login`
3. Backend verifies password and returns JWT
4. Frontend stores token and redirects to dashboard

### Google OAuth Flow
1. User clicks "Sign in with Google"
2. Google library handles OAuth flow
3. Frontend receives credential token
4. Frontend sends POST to `/api/auth/google` with token
5. Backend verifies and creates/updates user
6. Returns JWT token
7. Frontend stores token and redirects to dashboard

### API Requests
- All API requests (except auth routes) require Authorization header
- Format: `Authorization: Bearer <JWT_TOKEN>`
- If token is invalid or expired, user is redirected to login

## Troubleshooting

### "Google login failed" error
- Check that `VITE_GOOGLE_CLIENT_ID` is set in frontend `.env`
- Verify Client ID is correct in Google Cloud Console
- Check that `http://localhost:5173` is in authorized redirect URIs

### "Invalid token" error
- Ensure both backend and frontend have the same `JWT_SECRET`
- Token may have expired (7 days default)
- Clear localStorage and login again

### "CORS error" when calling API
- Check `CLIENT_ORIGIN` in backend `.env` matches frontend URL
- Default is `http://localhost:5173`

### Database connection error
- Ensure MongoDB is running
- Check `MONGODB_URI` in backend `.env`
- For Docker, it's `mongodb://mongo:27017/devops-dashboard`

## Security Notes

⚠️ **For Production:**

1. Change `JWT_SECRET` to a strong random string
2. Use HTTPS (not HTTP)
3. Update `CLIENT_ORIGIN` to your domain
4. Use environment variables, not hardcoded values
5. Set secure cookies if using session-based auth
6. Enable CORS only for trusted origins
7. Use `.env` files with proper permissions (not in git)

## Next Steps

- Customize login/signup page branding
- Add password reset functionality
- Implement role-based access control
- Add email verification
- Set up OAuth for other providers (GitHub, Microsoft, etc.)
