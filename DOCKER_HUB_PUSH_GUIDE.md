# Docker Hub Push & Image Registry - Quick Start Guide

## Overview

DevOps Hub now supports pushing Docker images directly to Docker Hub and managing your image history through an Image Registry interface.

## What's New

### 1. **Image Model** (`backend/src/models/Image.js`)
- Tracks pushed images with comprehensive metadata
- Stores push logs, status, and Docker Hub URLs
- Supports image history tracking

### 2. **Docker Hub Push Service** (`backend/src/services/dockerHubPushService.js`)
- Authenticates with Docker Hub using credentials
- Tags images with `<username>/<repo>:<tag>` format
- Pushes images to Docker Hub with real-time logging
- Handles authentication failures gracefully
- Returns Docker Hub URLs after successful push

### 3. **Backend Endpoints**

#### POST `/api/deployments/push`
Push a built Docker image to Docker Hub.

**Request:**
```json
{
  "buildId": "build-1234567890-abcd",
  "dockerHubUsername": "your-username",
  "dockerHubPassword": "your-password-or-token",
  "dockerHubRepo": "my-app"
}
```

**Response (Success):**
```json
{
  "success": true,
  "imageId": "img-1234567890-efgh",
  "buildId": "build-1234567890-abcd",
  "targetImageTag": "your-username/my-app:tag",
  "status": "PUSHING",
  "image": { ... }
}
```

#### GET `/api/deployments/images/history?limit=50`
Get image push history for current user.

**Response:**
```json
{
  "success": true,
  "images": [...],
  "total": 15
}
```

#### GET `/api/deployments/images/:imageId`
Get details for a specific image including push logs.

#### GET `/api/deployments/builds/:buildId/images`
Get all images pushed from a specific build.

### 4. **Socket Events (Real-time)**

#### `push:started`
Emitted when push begins
```json
{
  "imageId": "img-xxx",
  "buildId": "build-xxx",
  "sourceImageTag": "devopshub/app:tag",
  "targetImageTag": "username/my-app:tag",
  "status": "PUSHING"
}
```

#### `push:log`
Emitted for each log line during push
```json
{
  "imageId": "img-xxx",
  "buildId": "build-xxx",
  "message": "Pushing layer...",
  "level": "info"
}
```

#### `push:completed`
Emitted when push finishes
```json
{
  "imageId": "img-xxx",
  "buildId": "build-xxx",
  "targetImageTag": "username/my-app:tag",
  "status": "SUCCESS",
  "duration": 45000,
  "dockerHubUrl": "https://hub.docker.com/r/username/my-app/tags?name=tag"
}
```

### 5. **Frontend Components**

#### Image Registry Page (`/deployments/images`)
- View all pushed images
- See push status (PENDING, PUSHING, SUCCESS, FAILED)
- View live push logs
- Copy image URLs to clipboard
- Access Docker Hub links

#### Push Modal Component
- Built into BuildProgress page
- Shows build information
- Collects Docker Hub credentials
- Displays real-time push logs
- Shows final push result

### 6. **Image Statuses**

| Status | Description |
|--------|-------------|
| PENDING | Push queued, waiting to start |
| PUSHING | Image is being pushed to Docker Hub |
| SUCCESS | Image successfully pushed to Docker Hub |
| FAILED | Push failed with error |

## How to Use

### Step 1: Build an Image
1. Navigate to GitHub Repositories
2. Select a repository
3. Confirm repository analysis
4. Click "Build Image"
5. Wait for build to complete (status = SUCCESS)

### Step 2: Push to Docker Hub
1. Once build is complete, click **"🚀 Push to Docker Hub"** button
2. Enter your Docker Hub credentials:
   - **Username**: Your Docker Hub username
   - **Password**: Your Docker Hub password or access token
   - **Repository**: Repository name (e.g., "my-app")
3. Click "Push to Docker Hub"
4. Monitor real-time push logs
5. On success, you'll see the Docker Hub link

### Step 3: View Image Registry
1. Navigate to **"📦 View Image Registry"** or visit `/deployments/images`
2. Browse all pushed images
3. View push details, logs, and timestamps
4. Access Docker Hub links directly

## Environment Variables

Add to `.env`:
```bash
# Docker Hub configuration (optional pre-fill)
DOCKER_HUB_USERNAME=optional-default-username
```

## Security Considerations

1. **Credentials Storage**: 
   - Docker Hub credentials are NOT stored in the database
   - Username is saved to browser localStorage for convenience (you can disable this)
   - Password is never persisted

2. **Access Tokens**:
   - Recommended: Use Docker Hub Personal Access Tokens instead of passwords
   - Tokens can be revoked independently
   - Create at: https://hub.docker.com/settings/security

3. **HTTPS Only**:
   - Always use HTTPS in production
   - Credentials are only sent to your backend, never exposed to frontend

## API Examples

### Push Image Using curl
```bash
curl -X POST http://localhost:5000/api/deployments/push \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "buildId": "build-xxx",
    "dockerHubUsername": "your-username",
    "dockerHubPassword": "your-password",
    "dockerHubRepo": "my-app"
  }'
```

### Get Image History
```bash
curl -X GET http://localhost:5000/api/deployments/images/history?limit=10 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Image Details
```bash
curl -X GET http://localhost:5000/api/deployments/images/img-xxx \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Troubleshooting

### "Build status is FAILED, only SUCCESS builds can be pushed"
- Ensure your build completed successfully before pushing
- Check build logs for errors

### "Docker daemon unavailable"
- Make sure Docker is running on your machine
- On Mac: Start Docker Desktop
- On Linux: Ensure Docker daemon is running

### "Docker push failed"
Check common causes:
1. Invalid Docker Hub credentials
2. Repository name conflicts (might exist under different account)
3. Network connectivity issues
4. Docker Hub service outage

### Push logs not appearing in real-time
- Check if WebSocket connection is active
- Open Browser DevTools → Network → WS tab
- Should see connection to Socket.io

### "Unauthorized" error when accessing image
- You can only view images you pushed
- Images are scoped by userId from authentication

## Database Schema

### Image Collection
```javascript
{
  imageId: String,                    // Unique ID
  buildId: String,                    // Reference to Build
  userId: String,                     // Owner
  imageName: String,                  // e.g., "username/repo"
  tag: String,                        // e.g., "latest" or deployment ID
  repository: String,                 // Repository name
  dockerHubUrl: String,              // Full Docker Hub link
  size: Number,                       // In bytes
  digest: String,                     // Image digest hash
  status: String,                     // PENDING, PUSHING, SUCCESS, FAILED
  pushedAt: Date,                    // When push completed
  pushStartedAt: Date,               // When push began
  pushDuration: Number,              // In milliseconds
  pushLogs: [{
    timestamp: Date,
    message: String,
    level: String                    // info, warning, error
  }],
  pushError: String,                 // Error message if failed
  deploymentId: String,              // Reference to Deployment
  dockerConfig: {
    username: String,
    registry: String                 // "docker.io" by default
  },
  createdAt: Date,
  updatedAt: Date
}
```

## Performance Notes

- Typical push time: 30-120 seconds depending on image size
- Large images (> 500MB) may take longer
- WebSocket connection enables real-time log streaming
- Push logs stored in database for 90 days

## Next Steps

1. **Add auto-push on successful build** - Configure automatic push after build completes
2. **Registry filtering** - Filter images by date, status, repository
3. **Image tagging strategies** - Support different tagging conventions
4. **Registry cleanup** - Delete old images or implement retention policies
5. **Multi-registry support** - Push to multiple registries (ECR, GCR, etc.)

## Files Modified/Created

### Backend
- `backend/src/models/Image.js` - NEW
- `backend/src/services/dockerHubPushService.js` - NEW
- `backend/src/services/socketEventsService.js` - UPDATED (push events)
- `backend/src/routes/deploymentRoutes.js` - UPDATED (push endpoints)

### Frontend
- `frontend/src/pages/ImageRegistry.jsx` - NEW
- `frontend/src/components/PushModal.jsx` - NEW
- `frontend/src/styles/ImageRegistry.css` - NEW
- `frontend/src/styles/PushModal.css` - NEW
- `frontend/src/lib/api.js` - UPDATED (image API functions)
- `frontend/src/pages/BuildProgress.jsx` - UPDATED (push button)
- `frontend/src/App.jsx` - UPDATED (image registry route)

## Support

For issues or questions:
1. Check build logs first
2. Verify Docker Hub credentials
3. Ensure network connectivity
4. Check WebSocket connection in browser DevTools
