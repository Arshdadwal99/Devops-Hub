# Firebase Setup - Quick Reference

## ⚡ QUICK START (2 minutes)

### Step 1: Get Firebase Config
1. Go to https://console.firebase.google.com/
2. Create/select project
3. Click Settings ⚙️ → Project Settings
4. Scroll to "Your apps" → Copy the config

### Step 2: Add to Frontend
Edit `frontend/.env.local`:
```
VITE_FIREBASE_API_KEY=<your api key>
VITE_FIREBASE_AUTH_DOMAIN=<your domain>
VITE_FIREBASE_PROJECT_ID=<your project id>
VITE_FIREBASE_STORAGE_BUCKET=<your bucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<your sender id>
VITE_FIREBASE_APP_ID=<your app id>
```

### Step 3: Enable Auth Methods
In Firebase Console:
- Go to Authentication → Sign-in method
- ✅ Enable Email/Password
- ✅ Enable Google

### Step 4: Test
```bash
cd frontend && npm run dev
```
Then test signup/login at http://localhost:5173

## Files Added/Modified

### New Files (Ready to Use)
- `frontend/src/lib/firebaseAuth.js` - Firebase auth functions
- `frontend/.env.local` - Your Firebase credentials (create this)
- `frontend/.env.example` - Template
- `backend/src/services/firebaseAdmin.js` - Firebase admin (optional)
- `backend/.env.firebase` - Firebase admin config template
- `FIREBASE_SETUP.md` - Full setup guide

### Modified Files
- `frontend/src/pages/Signup.jsx` - Now uses Firebase
- `frontend/src/pages/Login.jsx` - Now uses Firebase
- `backend/src/middleware/authMiddleware.js` - Supports Firebase tokens

## ✨ Features Available

✅ Email/Password signup and login
✅ Google OAuth sign in/sign up
✅ Secure password handling (Firebase)
✅ JWT token backup support
✅ Protected API routes
✅ Automatic token refresh
✅ User persistence

## Testing Credentials
After setup, test with:
- **Email:** test@example.com
- **Password:** Test123456

Or use Google account for instant signup.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Firebase initialization warning" | Check .env.local has correct credentials |
| Signup fails silently | Open browser DevTools console for errors |
| Google popup blocked | Allow popups for localhost:5173 |
| Token expired | Refresh page or re-login |

## Backend Integration (Optional)

For Firebase token verification on backend:
1. Get service account key from Firebase Console
2. Set `FIREBASE_ADMIN_KEY` in backend `.env`
3. Backend will automatically verify Firebase tokens

Without Firebase Admin SDK:
- Backend still works with JWT tokens
- Use Firebase tokens on frontend only
- All protected routes still secure

## Support
See FIREBASE_SETUP.md for detailed documentation
