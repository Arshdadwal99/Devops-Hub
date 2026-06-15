# GitHub OAuth Integration Setup Guide

## Overview
This guide explains how to set up GitHub OAuth integration for the DevOps Hub application.

## Step 1: Create GitHub OAuth Application

1. Go to GitHub Settings → Developer settings → OAuth Apps
   - URL: https://github.com/settings/developers

2. Click "New OAuth App" button

3. Fill in the application details:
   - **Application name:** `DevOps Hub`
   - **Homepage URL:** `http://localhost:5000` (or your production URL)
   - **Application description:** `DevOps Hub - Deployment and Infrastructure Management`
   - **Authorization callback URL:** `http://localhost:5000/api/github/callback` (or your production URL)

4. Click "Register application"

5. You'll see:
   - Client ID
   - Client Secret (keep this safe!)

## Step 2: Configure Environment Variables

Add the following to your `.env` file in the `backend/` directory:

```env
# GitHub OAuth Configuration
GITHUB_CLIENT_ID=your_client_id_here
GITHUB_CLIENT_SECRET=your_client_secret_here
BACKEND_URL=http://localhost:5000
```

For production, replace with:
```env
BACKEND_URL=https://your-domain.com
```

## Step 3: Restart Backend Server

After adding the environment variables, restart the backend server:

```bash
cd backend
npm run dev
```

You should see a message confirming GitHub configuration is loaded.

## How It Works

### User Flow:
1. User clicks "Connect GitHub" in the Integrations page
2. User is redirected to GitHub for authentication
3. User approves the OAuth app
4. GitHub redirects back to `/api/github/callback` with an authorization code
5. Backend exchanges the code for an access token
6. Access token is stored securely in the database
7. GitHub account status is displayed in the UI

### Backend Routes:
- `GET /api/github/connect` - Get OAuth authorization URL
- `GET /api/github/callback` - Handle OAuth callback
- `GET /api/github/status` - Check connection status
- `POST /api/github/disconnect` - Disconnect GitHub account

### Data Stored:
The following fields are added to the User model:
- `githubConnected` - Boolean flag indicating connection status
- `githubUsername` - GitHub username
- `githubAvatar` - GitHub profile picture URL
- `githubAccessToken` - OAuth access token (stored securely, not exposed in API)
- `githubConnectedAt` - Timestamp of connection

## Security Considerations

✅ **What's secure:**
- Access tokens are stored with `select: false` to prevent accidental exposure
- GitHub connection is separate from authentication
- Users can disconnect at any time to revoke access
- Access tokens are never sent to the frontend

⚠️ **Important:**
- Never commit `GITHUB_CLIENT_SECRET` to version control
- Use different OAuth apps for development and production
- GitHub OAuth is limited to read-only user scope (no repo access yet)

## Testing

### Frontend:
1. Go to Dashboard → Click user menu → Click "Integrations"
2. Click "Connect GitHub" in the GitHub Integration card
3. Authenticate with your GitHub account
4. Upon successful connection, you should see your GitHub username and avatar
5. You can then click "Disconnect" to remove the connection

### Backend Logs:
Look for these messages when connecting:
```
🔐 [GitHub] Connect request from user: <userId>
🔄 [GitHub] Processing callback with code...
📝 [GitHub] Fetching user information...
🔗 [GitHub] Connecting account to user: <userId>
✅ [GitHub] Successfully connected account
```

## Troubleshooting

### "Failed to initiate GitHub connection"
- Check that `GITHUB_CLIENT_ID` is set in `.env`
- Restart the backend server after setting environment variables

### "GitHub OAuth error: invalid_code"
- The authorization code may have expired (valid for 10 minutes)
- Try connecting again

### "Failed to fetch GitHub user info"
- Check that `GITHUB_CLIENT_SECRET` is correct
- Verify backend can reach `api.github.com`

### "localhost:5000/api/github/callback: Not Found"
- Make sure backend is running
- Check that GitHub redirect URL matches the callback route

## Next Steps

After GitHub integration is working, you can:
1. Add repository fetching functionality
2. Integrate with Jenkins for deployments
3. Display GitHub repositories in the dashboard
4. Trigger deployments from GitHub repositories

Currently, the integration stores the connection details but doesn't fetch repositories. This can be added later without modifying existing authentication or deployment logic.
