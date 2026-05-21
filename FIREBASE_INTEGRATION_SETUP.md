# Firebase Integration Setup Guide

This guide will help you integrate Firebase Authentication into your DevOps Dashboard project.

## Overview

Your project now has full Firebase integration:
- **Frontend**: Firebase SDK for authentication (email/password, Google)
- **Backend**: Firebase Admin SDK for token verification
- **Database**: Automatic user creation/sync with MongoDB and local database
- **Google Sign-In**: One-click authentication with Google accounts

## Setup Steps

### 1. Frontend Firebase Configuration

Create or update `.env.local` in the `frontend` directory:

```env
VITE_FIREBASE_API_KEY=<your_api_key>
VITE_FIREBASE_AUTH_DOMAIN=<your_auth_domain>
VITE_FIREBASE_PROJECT_ID=<your_project_id>
VITE_FIREBASE_STORAGE_BUCKET=<your_storage_bucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<your_messaging_sender_id>
VITE_FIREBASE_APP_ID=<your_app_id>
```

**To get these values:**
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or select existing
3. Click the Settings icon → Project Settings
4. Scroll to "Your Apps" section
5. Click "Web" and copy the config object values

### 2. Backend Firebase Admin SDK Configuration

The backend uses Firebase Admin SDK for token verification. You have two options:

#### Option A: Using Environment Variables (Recommended for Production)

Add to `backend/.env`:

```env
FIREBASE_ADMIN_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}
```

#### Option B: Using Service Account File (Recommended for Local Development)

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project → Settings → Service Accounts
3. Click "Generate New Private Key"
4. Save the downloaded JSON file as `backend/serviceAccountKey.json`
5. **⚠️ IMPORTANT**: Add `serviceAccountKey.json` to `.gitignore`

```bash
echo "serviceAccountKey.json" >> backend/.gitignore
```

### 3. Enable Authentication in Firebase

1. Go to Firebase Console → Your Project
2. In the left sidebar: Authentication → Sign-in method
3. Enable these providers:
   - ✅ **Email/Password** - for email & password authentication
   - ✅ **Google** - for Google Sign-In (optional but recommended)

### 4. Configure Google OAuth Credentials (for Google Sign-In)

1. In Firebase Console → Authentication → Sign-in method
2. Click on "Google" provider
3. The console will show "Web SDK configuration"
4. Your Google OAuth credentials are automatically configured
5. Users can now sign in with their Google accounts

### 5. Verify the Integration

#### Start the Backend:
```bash
cd backend
npm install  # if not done yet, installs firebase-admin
npm run dev
```

#### Start the Frontend:
```bash
cd frontend
npm run dev
```

#### Test Email/Password Sign-Up:
1. Go to http://localhost:5173/signup
2. Create an account with email and password
3. Check backend console for:
   ```
   🔐 [Firebase Auth] Processing firebase with Firebase token
   ✅ Firebase token verified for user: email@example.com
   ```

#### Test Email/Password Sign-In:
1. Go to http://localhost:5173/login
2. Sign in with your Firebase account
3. Should redirect to dashboard after successful authentication

#### Test Google Sign-In:
1. Go to http://localhost:5173/login
2. Click **"Sign in with Google"** button
3. Select your Google account
4. Should redirect to dashboard automatically
5. Backend console will show:
   ```
   🔐 [Firebase Auth] Processing firebase with Firebase token
   ✅ Firebase token verified for user: your.email@gmail.com
   ```

#### Test Google Sign-Up:
1. Go to http://localhost:5173/signup
2. Click **"Sign up with Google"** button
3. Select your Google account (new or existing)
4. Should redirect to dashboard
5. User is automatically created in the system

## Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     EMAIL/PASSWORD OR GOOGLE                   │
└──────────────────────────┬──────────────────────────────────────┘
                           ↓
             ┌─────────────────────────────┐
             │  Firebase Client SDK Auth  │
             │  (Email/Password or Google)│
             └──────────────┬──────────────┘
                           ↓
              ┌────────────────────────────┐
              │ Get Firebase ID Token      │
              │ (jwt format from Firebase) │
              └──────────────┬─────────────┘
                           ↓
        ┌──────────────────────────────────────┐
        │ POST /auth/firebase                  │
        │ Send: { firebaseToken, name(opt) }  │
        └──────────────┬───────────────────────┘
                       ↓
    ┌─────────────────────────────────────────┐
    │ Backend: Verify Firebase Token          │
    │ (using Firebase Admin SDK)              │
    └──────────────┬──────────────────────────┘
                   ↓
    ┌──────────────────────────────────────────┐
    │ Create/Update User in Database           │
    │ (MongoDB or Local DB)                    │
    └──────────────┬───────────────────────────┘
                   ↓
    ┌──────────────────────────────────────────┐
    │ Generate JWT Token                       │
    │ Return: { user, token }                  │
    └──────────────┬───────────────────────────┘
                   ↓
    ┌──────────────────────────────────────────┐
    │ Frontend: Store JWT in localStorage      │
    │ Use for subsequent API requests          │
    └──────────────┬───────────────────────────┘
                   ↓
            ┌──────────────┐
            │ Redirect to  │
            │  Dashboard   │
            └──────────────┘
```

## Features

### Email/Password Authentication
✅ Sign up with email and password
- Firebase handles password hashing and security
- Passwords never sent to your backend
- Password requirements: minimum 6 characters

✅ Sign in with email and password
- Secure password verification
- Automatic session management
- Automatic logout if token expires

### Google Sign-In
✅ One-click Google sign-up
- Uses existing Google account
- Automatically creates user profile
- No password needed

✅ One-click Google sign-in
- Quick authentication
- Google account linking
- Same user across multiple sign-ins

✅ Security
- OAuth 2.0 protocol
- Secure token exchange
- No password storage

## Backend Endpoints

### Firebase Authentication
```
POST /auth/firebase
Content-Type: application/json

Request:
{
  "firebaseToken": "firebase-id-token-from-client",
  "name": "User Name" (optional, used for new signups)
}

Response (Success):
{
  "user": {
    "_id": "user-id-in-database",
    "email": "user@example.com",
    "name": "User Name",
    "authProvider": "firebase"
  },
  "token": "jwt-backend-token-for-api-requests"
}

Response (Error):
{
  "message": "Error description"
}
```

## Troubleshooting

### "Firebase initialization warning"
- Frontend is using dummy keys for development
- Set proper `VITE_FIREBASE_*` environment variables

### "Firebase Admin SDK not initialized"
- Backend missing Firebase service account
- Set `FIREBASE_ADMIN_KEY` or place `serviceAccountKey.json` in backend

### "Invalid Firebase token"
- Ensure token is from authenticated Firebase user
- Check Firebase project credentials match frontend config
- Verify service account has proper permissions

### "User already exists"
- Email already registered in Firebase
- Use different email or delete user from Firebase Console

### "Sign in with Google" button doesn't work
1. Check Firebase Console → Authentication → Google is enabled
2. Check that `VITE_FIREBASE_*` environment variables are set
3. Check browser console for specific error message
4. Ensure popup is not blocked by browser

### "Popup was blocked" Error
1. Check browser popup settings
2. Make sure localhost is allowed
3. Try signing in again
4. Use Chrome or Firefox for better popup handling

### CORS Errors
- Make sure `CLIENT_ORIGIN` in backend/.env includes frontend URL
- Default: `http://localhost:5173`
- Add new URLs if running on different port

### Database Connection Errors
- Backend falls back to local file-based DB if MongoDB unavailable
- Check MONGODB_URI in backend/.env
- Or leave empty to use local DB

## Environment Variables Summary

### Frontend (.env.local)
```
VITE_FIREBASE_API_KEY          # Firebase API Key
VITE_FIREBASE_AUTH_DOMAIN      # Firebase Auth Domain
VITE_FIREBASE_PROJECT_ID       # Firebase Project ID
VITE_FIREBASE_STORAGE_BUCKET   # Firebase Storage Bucket
VITE_FIREBASE_MESSAGING_SENDER_ID  # Firebase Sender ID
VITE_FIREBASE_APP_ID           # Firebase App ID
VITE_API_URL                   # Backend API URL (default: http://localhost:5000/api)
```

### Backend (.env)
```
FIREBASE_ADMIN_KEY             # JSON service account key (optional if using serviceAccountKey.json)
PORT                           # Backend port (default: 5000)
CLIENT_ORIGIN                  # Frontend URL for CORS
JWT_SECRET                     # Secret for JWT token signing
MONGODB_URI                    # MongoDB connection (optional, uses local DB if empty)
```

## Security Best Practices

1. **Never commit credentials**
   - Add `.env`, `.env.local`, `serviceAccountKey.json` to `.gitignore`
   - Use environment variables in production

2. **Use environment variables in production**
   - Set `FIREBASE_ADMIN_KEY` securely
   - Don't use `serviceAccountKey.json` in production
   - Use secrets management (GitHub Secrets, AWS Secrets Manager, etc.)

3. **Rotate service accounts regularly**
   - Firebase Console → Service Accounts → Rotate keys every 90 days

4. **Enable security rules in Firestore (if using)**
   - Restrict unauthorized access
   - Validate user permissions

5. **Monitor authentication logs**
   - Firebase Console → Logs
   - Check for suspicious activity

6. **Use HTTPS in production**
   - Required for OAuth 2.0
   - Use secure cookies for tokens

## Troubleshooting Checklist

- [ ] Firebase project created and configured
- [ ] `VITE_FIREBASE_*` environment variables set in frontend
- [ ] Firebase Authentication providers enabled (Email/Password, Google)
- [ ] Service account key configured in backend
- [ ] Backend running: `npm run dev` in backend folder
- [ ] Frontend running: `npm run dev` in frontend folder
- [ ] Can sign up with email/password
- [ ] Can sign in with email/password
- [ ] Can sign up with Google
- [ ] Can sign in with Google
- [ ] User data persists after page refresh
- [ ] Logout clears authentication

## Next Steps

- [ ] Get Firebase credentials from Firebase Console
- [ ] Set up `VITE_FIREBASE_*` in frontend/.env.local
- [ ] Configure Firebase Admin Key in backend/.env
- [ ] Enable Email/Password in Firebase Auth
- [ ] Enable Google OAuth in Firebase Auth
- [ ] Test all authentication flows
- [ ] Deploy to production
- [ ] Set up user profiles/roles (optional)
- [ ] Add additional OAuth providers (GitHub, etc.) (optional)
- [ ] Set up email verification (optional)
- [ ] Configure 2FA (optional)

## References

- [Firebase Console](https://console.firebase.google.com)
- [Firebase Authentication Docs](https://firebase.google.com/docs/auth)
- [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup)
- [React Firebase Auth](https://firebase.google.com/docs/auth/web/start)
- [Google Sign-In Documentation](https://developers.google.com/identity/sign-in)
- [Firebase Security Rules](https://firebase.google.com/docs/database/security)

