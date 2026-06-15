# GitHub Integration API Reference

## Base URL
```
http://localhost:5000/api/github
```

All endpoints require authentication (JWT token in Authorization header).

## Endpoints

### 1. Get GitHub Authorization URL

**Request:**
```http
GET /api/github/connect
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "authUrl": "https://github.com/login/oauth/authorize?client_id=xxx&redirect_uri=xxx&scope=user%3Aemail%2Cread%3Auser&state=xxx",
  "message": "Redirect user to this URL to authenticate with GitHub"
}
```

**Error (400):**
```json
{
  "success": false,
  "error": "GITHUB_CLIENT_ID environment variable not set"
}
```

---

### 2. Handle GitHub OAuth Callback

**Request:**
```http
GET /api/github/callback?code=<authorization_code>
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "GitHub account connected successfully",
  "data": {
    "id": "user_id_123",
    "githubConnected": true,
    "githubUsername": "octocat",
    "githubAvatar": "https://avatars.githubusercontent.com/u/1?v=4",
    "githubConnectedAt": "2026-05-29T12:34:56.789Z"
  }
}
```

**Error (400):**
```json
{
  "success": false,
  "error": "GitHub OAuth error: invalid_code"
}
```

---

### 3. Get GitHub Connection Status

**Request:**
```http
GET /api/github/status
Authorization: Bearer <token>
```

**Response (200 OK) - Connected:**
```json
{
  "success": true,
  "data": {
    "githubConnected": true,
    "githubUsername": "octocat",
    "githubAvatar": "https://avatars.githubusercontent.com/u/1?v=4",
    "githubConnectedAt": "2026-05-29T12:34:56.789Z"
  }
}
```

**Response (200 OK) - Not Connected:**
```json
{
  "success": true,
  "data": {
    "githubConnected": false,
    "githubUsername": null,
    "githubAvatar": null,
    "githubConnectedAt": null
  }
}
```

---

### 4. Disconnect GitHub Account

**Request:**
```http
POST /api/github/disconnect
Authorization: Bearer <token>
Content-Type: application/json
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "GitHub account disconnected successfully",
  "data": {
    "id": "user_id_123",
    "githubConnected": false
  }
}
```

**Error (400):**
```json
{
  "success": false,
  "error": "User not found"
}
```

---

## User Model Changes

### Added Fields

```javascript
{
  // ... existing fields ...
  
  // GitHub Integration (NEW)
  githubConnected: {
    type: Boolean,
    default: false,
  },
  githubUsername: {
    type: String,
    default: null,
  },
  githubAvatar: {
    type: String,
    default: null,
  },
  githubAccessToken: {
    type: String,
    default: null,
    select: false, // Not included in API responses
  },
  githubConnectedAt: {
    type: Date,
    default: null,
  },
}
```

---

## Authentication

All GitHub integration endpoints require a valid JWT token.

**Header:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

The token is obtained by logging in with:
- Google OAuth
- Firebase
- Local email/password

---

## OAuth Flow Diagram

```
User                Frontend              Backend              GitHub
  |                   |                      |                   |
  |-- Click Connect --|                      |                   |
  |                   |-- GET /api/github/connect                |
  |                   |                      |                   |
  |                   |<--- authUrl ---------|                   |
  |                   |                      |                   |
  |-- Redirect to GitHub ----------------------------------------->
  |                                          |                   |
  |<----- Authenticate & Approve -----------|<--- auth code ----|
  |                                          |                   |
  |-- Redirect to /api/github/callback ------->                 |
  |                   |                      |                   |
  |                   |-- GET /callback?code=xxx                |
  |                   |                      |                   |
  |                   |                      |-- Exchange code ->|
  |                   |                      |<--- Access token -|
  |                   |                      |                   |
  |                   |                      |-- Fetch user info->
  |                   |                      |<--- User data ----
  |                   |                      |                   |
  |                   |<--- Success response---|                 |
  |-- Connected! ------|                      |                   |
```

---

## Error Handling

### Common Errors

**Missing/Invalid Token:**
```json
{
  "status": 401,
  "error": "Unauthorized"
}
```

**GitHub Configuration Missing:**
```json
{
  "success": false,
  "error": "GitHub OAuth credentials not configured"
}
```

**Code Exchange Failed:**
```json
{
  "success": false,
  "error": "Failed to exchange code for token: GitHub API error"
}
```

**User Not Found:**
```json
{
  "success": false,
  "error": "User not found"
}
```

---

## Testing with cURL

### Get Connect URL
```bash
curl -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/github/connect
```

### Get Status
```bash
curl -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/github/status
```

### Disconnect
```bash
curl -X POST \
     -H "Authorization: Bearer <token>" \
     http://localhost:5000/api/github/disconnect
```

---

## Rate Limiting

GitHub OAuth endpoints have standard GitHub rate limits:
- Anonymous: 60 requests/hour
- Authenticated: 5,000 requests/hour

Backend caches availability checks for:
- GitHub connect status: 30 seconds

---

## Security Considerations

✅ **Token Security:**
- Stored with `select: false` in database
- Never included in API responses
- Expires if GitHub user revokes app access

✅ **Scopes:**
- `user:email` - Read user email (currently unused)
- `read:user` - Read user profile

⚠️ **Future Scope Expansion:**
- `repo` - For accessing repositories
- `workflow` - For GitHub Actions

---

## Frontend Integration

### React Hook Example

```jsx
import { getGitHubConnectUrl, getGitHubStatus, disconnectGitHub } from "./lib/api";

export function GitHubIntegration() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetchStatus();
  }, []);

  async function fetchStatus() {
    const response = await getGitHubStatus();
    setStatus(response.data);
  }

  async function handleConnect() {
    const response = await getGitHubConnectUrl();
    window.location.href = response.authUrl;
  }

  async function handleDisconnect() {
    await disconnectGitHub();
    await fetchStatus();
  }

  if (!status) return <div>Loading...</div>;

  return (
    <div>
      {status.githubConnected ? (
        <>
          <p>Connected as @{status.githubUsername}</p>
          <button onClick={handleDisconnect}>Disconnect</button>
        </>
      ) : (
        <button onClick={handleConnect}>Connect GitHub</button>
      )}
    </div>
  );
}
```

---

**Last Updated:** 2026-05-29  
**API Version:** 1.0
