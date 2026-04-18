# 📡 API Reference Guide

Complete reference for all authentication and dashboard API endpoints.

## 🔒 Authentication Endpoints (Public)

### Register New User
```
POST /api/auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}

Response 201:
{
  "user": {
    "_id": "507f1f77bcf86cd799439011",
    "email": "user@example.com",
    "name": "John Doe",
    "authProvider": "local",
    "createdAt": "2025-04-16T10:30:00Z",
    "updatedAt": "2025-04-16T10:30:00Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Login with Email/Password
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}

Response 200:
{
  "user": { ... },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

Error 401:
{
  "message": "Invalid email or password"
}
```

### Google OAuth Login/Signup
```
POST /api/auth/google
Content-Type: application/json

{
  "token": "googleCredentialToken..."
}

Response 200:
{
  "user": {
    "_id": "507f1f77bcf86cd799439012",
    "email": "user@gmail.com",
    "name": "Jane Doe",
    "profilePicture": "https://...",
    "googleId": "110169947453300....",
    "authProvider": "google",
    "createdAt": "2025-04-16T10:35:00Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## 🔐 Protected Endpoints (Require JWT Token)

All protected requests must include:
```
Authorization: Bearer <JWT_TOKEN>
```

### Get Current User
```
GET /api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

Response 200:
{
  "_id": "507f1f77bcf86cd799439011",
  "email": "user@example.com",
  "name": "John Doe",
  "authProvider": "local",
  "createdAt": "2025-04-16T10:30:00Z",
  "updatedAt": "2025-04-16T10:30:00Z"
}

Error 401:
{
  "message": "No token provided"
}

Error 401:
{
  "message": "Invalid token"
}
```

### Get Dashboard
```
GET /api/dashboard
Authorization: Bearer <JWT_TOKEN>

Response 200:
{
  "pipeline": {
    "workflow": "CI/CD Pipeline",
    "buildStatus": "success",
    "deploymentStatus": "success",
    "environment": "production",
    "progress": 100,
    "lastCommit": {
      "hash": "abc1234",
      "message": "Fix authentication",
      "author": "Developer Name",
      "timestamp": "2025-04-16T10:00:00Z"
    }
  },
  "metrics": {
    "cpu": 45,
    "memory": 62,
    "activeContainers": 8,
    "latency": 120,
    "history": [
      {
        "time": "10:00 AM",
        "cpu": 40,
        "memory": 60,
        "traffic": 1200
      },
      ...
    ]
  },
  "logs": {
    "deployment": ["Deployment started", "..."],
    "errors": ["Error logs here", "..."]
  },
  "alerts": [
    {
      "severity": "warning",
      "message": "High CPU usage detected",
      "createdAt": "2025-04-16T10:25:00Z"
    }
  ],
  "controlPanel": {
    "currentVersion": "1.2.3",
    "previousVersion": "1.2.2",
    "lastDeploymentAt": "2025-04-16T09:00:00Z",
    "nextRecommendation": "Consider scaling up resources"
  }
}
```

### Deploy Release
```
POST /api/deploy
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Response 200:
{
  "pipeline": { ... },
  "metrics": { ... },
  "logs": { ... },
  "alerts": [ ... ],
  "controlPanel": { ... }
}
```

### Rollback Release
```
POST /api/rollback
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Response 200:
{
  "pipeline": { ... },
  "metrics": { ... },
  "logs": { ... },
  "alerts": [ ... ],
  "controlPanel": { ... }
}
```

### Restart Services
```
POST /api/restart
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Response 200:
{
  "pipeline": { ... },
  "metrics": { ... },
  "logs": { ... },
  "alerts": [ ... ],
  "controlPanel": { ... }
}
```

### Get Pipeline Status
```
GET /api/pipeline-status
Authorization: Bearer <JWT_TOKEN>

Response 200:
{
  "workflow": "CI/CD Pipeline",
  "buildStatus": "success",
  "deploymentStatus": "success",
  "environment": "production",
  "progress": 100,
  "lastCommit": { ... }
}
```

### Get Metrics
```
GET /api/metrics
Authorization: Bearer <JWT_TOKEN>

Response 200:
{
  "cpu": 45,
  "memory": 62,
  "activeContainers": 8,
  "latency": 120,
  "history": [ ... ]
}
```

### Get Logs
```
GET /api/logs
Authorization: Bearer <JWT_TOKEN>

Response 200:
{
  "deployment": ["Log entry 1", "Log entry 2", ...],
  "errors": ["Error 1", "Error 2", ...]
}
```

## 🔄 JWT Token Structure

JWT tokens have three parts separated by dots:
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJpYXQiOjE2NDUwODc2MjAsImV4cCI6MTY0NTY5MjQyMH0.signature
├─ Header
└─ Payload
  └─ Signature
```

**Token Payload Example:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "iat": 1645087620,
  "exp": 1645692420
}
```

**Token Expiration:** 7 days from creation

## 🧪 Example Requests

### JavaScript/Fetch
```javascript
// Signup
const response = await fetch('/api/auth/signup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123',
    name: 'John Doe'
  })
});
const { token, user } = await response.json();
localStorage.setItem('authToken', token);

// Protected request
const dashResponse = await fetch('/api/dashboard', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  }
});
const dashboard = await dashResponse.json();
```

### cURL
```bash
# Signup
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"pass123","name":"John"}'

# Protected request
TOKEN="your-jwt-token-here"
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/dashboard
```

### Python (requests)
```python
import requests

# Signup
response = requests.post('http://localhost:5000/api/auth/signup', json={
    'email': 'user@example.com',
    'password': 'password123',
    'name': 'John Doe'
})
token = response.json()['token']

# Protected request
headers = {'Authorization': f'Bearer {token}'}
dashboard = requests.get('http://localhost:5000/api/dashboard', headers=headers).json()
```

## ❌ Error Responses

### 400 Bad Request
```json
{
  "message": "Missing required fields"
}
```

### 401 Unauthorized
```json
{
  "message": "No token provided"
}
```

### 401 Invalid Token
```json
{
  "message": "Invalid token"
}
```

### 500 Server Error
```json
{
  "message": "Internal server error"
}
```

## 📋 Status Codes

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK | Successful request |
| 201 | Created | User created successfully |
| 400 | Bad Request | Missing required fields |
| 401 | Unauthorized | Invalid/missing token |
| 500 | Server Error | Internal error |

## 🔑 Authentication Headers

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## 📲 Frontend API Client

The frontend `lib/api.js` automatically handles token injection:

```javascript
// Automatically includes token in header
import { getDashboard, login, signup, googleAuth } from './lib/api';

// Signup
const { user, token } = await signup(email, password, name);

// Login
const { user, token } = await login(email, password);

// Google
const { user, token } = await googleAuth(googleToken);

// Protected routes - token automatically injected
const dashboard = await getDashboard();
```

## 🛠️ Development Tips

1. **Testing in Browser Console:**
   ```javascript
   // Get token
   localStorage.getItem('authToken')
   
   // Make API call
   fetch('/api/dashboard', {
     headers: {'Authorization': `Bearer ${localStorage.getItem('authToken')}`}
   }).then(r => r.json()).then(console.log)
   ```

2. **Decode JWT Token:**
   - Use [jwt.io](https://jwt.io) to decode tokens
   - Paste token to see payload

3. **Clear Auth State:**
   ```javascript
   localStorage.removeItem('authToken')
   location.href = '/login'
   ```
