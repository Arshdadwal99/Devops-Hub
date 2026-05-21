# Firebase Integration Setup Guide

## Overview
The application now supports Firebase authentication for:
- Email/Password sign up and login
- Google OAuth sign in and sign up
- Firebase ID token verification

## Frontend Setup (Required)

### 1. Get Firebase Credentials
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing
3. Go to **Project Settings** (gear icon)
4. Select **General** tab
5. Scroll down to find **Your apps** section
6. Copy the config object values

### 2. Configure Frontend .env.local
Create or edit `frontend/.env.local`:
```
VITE_API_URL=http://localhost:5000/api
VITE_FIREBASE_API_KEY=<copy from Firebase Config>
VITE_FIREBASE_AUTH_DOMAIN=<copy from Firebase Config>
VITE_FIREBASE_PROJECT_ID=<copy from Firebase Config>
VITE_FIREBASE_STORAGE_BUCKET=<copy from Firebase Config>
VITE_FIREBASE_MESSAGING_SENDER_ID=<copy from Firebase Config>
VITE_FIREBASE_APP_ID=<copy from Firebase Config>
```

### 3. Enable Firebase Authentication
In Firebase Console:
1. Go to **Authentication** -> **Sign-in method**
2. Enable **Email/Password**
3. Enable **Google** (requires OAuth consent screen setup)

## Backend Setup (Optional for Enhanced Features)

### 1. Get Firebase Admin SDK Key
1. In Firebase Console, go to **Project Settings** -> **Service Accounts**
2. Click **Generate New Private Key**
3. Save the JSON file

### 2. Configure Backend
Option A: Using environment variable
```
FIREBASE_ADMIN_KEY='{"type": "service_account", ...}'
```

Option B: Place serviceAccountKey.json in backend/ folder

## Features

### Authentication Methods Available
1. **Email/Password**
   - Sign up with name, email, password
   - Login with email, password
   - Passwords securely hashed in Firebase

2. **Google OAuth**
   - One-click sign in/up with Google account
   - Automatically creates user profile

3. **JWT Fallback**
   - Backend still generates JWT tokens
   - Firebase tokens and JWT tokens both supported

## File Structure

```
frontend/
├── .env.local                    # Firebase config (add your credentials)
├── src/lib/
│   ├── firebaseConfig.js         # Firebase initialization
│   ├── firebaseAuth.js           # Firebase auth functions (NEW)
│   └── AuthContext.jsx           # Auth state management
├── src/pages/
│   ├── Signup.jsx                # Updated to use Firebase
│   └── Login.jsx                 # Updated to use Firebase

backend/
├── .env.firebase                 # Firebase Admin config example
├── src/middleware/
│   └── authMiddleware.js         # Updated to verify Firebase tokens
└── src/services/
    └── firebaseAdmin.js          # Firebase Admin SDK (NEW)
```

## Testing

### Test Email/Password Authentication
1. Start frontend: `npm run dev`
2. Go to http://localhost:5173/signup
3. Sign up with email and password
4. Should redirect to dashboard

### Test Google Authentication
1. Go to http://localhost:5173/signup
2. Click "Sign up with Google"
3. Select Google account
4. Should redirect to dashboard

### Test Login
1. Go to http://localhost:5173/login
2. Enter credentials
3. Should redirect to dashboard

## API Integration

The authentication flow:
1. **Frontend:** User signs up/logs in via Firebase
2. **Firebase:** Returns ID token
3. **Frontend:** Stores token in localStorage
4. **Frontend:** Sends token with API requests in Authorization header
5. **Backend:** Verifies token (Firebase or JWT)
6. **Backend:** Returns protected resource

## Troubleshooting

### "Firebase initialization warning"
- Check if .env.local has correct Firebase credentials
- Ensure VITE_FIREBASE_API_KEY is not empty

### "Invalid token"
- Ensure token is sent with "Bearer " prefix
- Check token expiration (Firebase tokens expire in 1 hour)
- Verify Firebase Admin SDK is initialized (optional for basic usage)

### "Email already in use"
- User account already exists with that email
- Try logging in instead

### "Too many failed login attempts"
- Firebase temporarily blocks account for security
- Wait a few minutes and try again

## Environment Variables Reference

### Frontend (.env.local)
- `VITE_API_URL` - Backend API base URL
- `VITE_FIREBASE_API_KEY` - Firebase public API key
- `VITE_FIREBASE_AUTH_DOMAIN` - Firebase auth domain
- `VITE_FIREBASE_PROJECT_ID` - Firebase project ID
- `VITE_FIREBASE_STORAGE_BUCKET` - Firebase storage bucket
- `VITE_FIREBASE_MESSAGING_SENDER_ID` - Firebase messaging sender ID
- `VITE_FIREBASE_APP_ID` - Firebase app ID

### Backend (.env)
- `FIREBASE_ADMIN_KEY` - Firebase Admin service account JSON (optional)

## Next Steps

1. ✅ Set up Firebase project
2. ✅ Add credentials to .env.local
3. ✅ Test signup/login flow
4. ✅ (Optional) Set up Firebase Admin SDK for backend token verification

## Additional Resources
- [Firebase Console](https://console.firebase.google.com/)
- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firebase Admin SDK Docs](https://firebase.google.com/docs/admin/setup)
