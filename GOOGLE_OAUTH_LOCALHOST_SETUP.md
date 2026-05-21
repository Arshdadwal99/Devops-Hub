# Firebase Google OAuth Setup - Localhost Configuration

## Step 1: Add Localhost to Firebase Authorized Domains

1. Go to **Firebase Console** → Your project
2. Go to **Authentication** → **Settings** tab
3. Scroll to **Authorized domains**
4. Click **"Add domain"**
5. Add these domains:
   - `localhost:5174`
   - `localhost:5173`
   - `127.0.0.1:5174`

## Step 2: Verify Google OAuth Configuration

1. Go to **Authentication** → **Sign-in method** tab
2. Click on **Google** provider
3. Ensure it's **Enabled** ✓
4. Check that the **Client ID** is properly configured

## Step 3: Test in Your Browser

1. **Restart backend** (it already restarted)
2. Open **http://localhost:5174/signup** in your browser
3. Click **"Sign up with Google"**
4. **You should now see the Google account picker popup!**

## If Popup Still Doesn't Appear:

Try these troubleshooting steps:
1. **Clear browser cache**: Ctrl+Shift+Delete → Clear all
2. **Disable popup blockers** for localhost
3. **Try a different browser** (Chrome usually works best)
4. **Check browser console** for errors (F12 → Console tab)

## Expected Flow:

1. User clicks "Sign in with Google"
2. **Google account picker popup appears** ← This should show all your Google accounts
3. User selects their account
4. Redirects to dashboard
5. Account created in database

---

**Try this now and let me know if the popup appears!** 🎯
