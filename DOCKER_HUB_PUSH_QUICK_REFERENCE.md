# Docker Hub Push & Image Registry - Quick Reference

## API Endpoints

### 1. Push Image
```bash
POST /api/deployments/push
Content-Type: application/json

{
  "buildId": "build-xxx",
  "dockerHubUsername": "your-username",
  "dockerHubPassword": "your-token",
  "dockerHubRepo": "my-app"
}

Response:
{
  "success": true,
  "imageId": "img-xxx",
  "status": "PUSHING",
  "targetImageTag": "your-username/my-app:tag",
  "image": {...}
}
```

### 2. Get Image History
```bash
GET /api/deployments/images/history?limit=50
Authorization: Bearer {token}

Response:
{
  "success": true,
  "images": [
    {
      "_id": "...",
      "imageId": "img-xxx",
      "imageName": "username/repo",
      "tag": "v1.0.0",
      "status": "SUCCESS",
      "pushedAt": "2026-05-30T10:30:00Z",
      "pushDuration": 45000,
      "dockerHubUrl": "https://...",
      "createdAt": "..."
    }
  ],
  "total": 5
}
```

### 3. Get Image Details
```bash
GET /api/deployments/images/{imageId}
Authorization: Bearer {token}

Response:
{
  "success": true,
  "image": {
    "imageId": "img-xxx",
    "buildId": "build-xxx",
    "imageName": "username/repo",
    "tag": "v1.0.0",
    "status": "SUCCESS",
    "pushLogs": [
      {"timestamp": "...", "message": "...", "level": "info"}
    ],
    "dockerHubUrl": "...",
    ...
  }
}
```

### 4. Get Images by Build
```bash
GET /api/deployments/builds/{buildId}/images
Authorization: Bearer {token}

Response:
{
  "success": true,
  "images": [...]
}
```

---

## Socket Events

### Subscribe to Updates
```javascript
socket.emit('subscribe:images');
```

### Listen to Events
```javascript
// When push starts
socket.on('push:started', (event) => {
  console.log('Push started:', event);
  // {imageId, buildId, sourceImageTag, targetImageTag, status}
});

// Real-time log updates
socket.on('push:log', (event) => {
  console.log('Log:', event.message);
  // {imageId, buildId, message, level}
});

// When push completes
socket.on('push:completed', (event) => {
  console.log('Push completed:', event);
  // {imageId, buildId, targetImageTag, status, duration, dockerHubUrl}
});
```

---

## Frontend Usage

### Import & Use Push Modal
```javascript
import PushModal from "../components/PushModal";

function MyComponent() {
  const [showPush, setShowPush] = useState(false);
  const [build, setBuild] = useState(null);

  return (
    <>
      <button onClick={() => setShowPush(true)}>Push Image</button>
      
      <PushModal
        build={build}
        isOpen={showPush}
        onClose={() => setShowPush(false)}
        onPushStarted={(result) => {
          console.log('Push started:', result);
          // Navigate or update UI
        }}
      />
    </>
  );
}
```

### Get Image History
```javascript
import { getImageHistory, getImageDetails } from "../lib/api";

// Load history
const history = await getImageHistory(50);
console.log(history.images);

// Load specific image
const details = await getImageDetails(imageId);
console.log(details.image.pushLogs);
```

### Push Image
```javascript
import { pushImageToDockerHub } from "../lib/api";

const result = await pushImageToDockerHub({
  buildId: "build-xxx",
  dockerHubUsername: "username",
  dockerHubPassword: "token",
  dockerHubRepo: "my-app"
});

console.log(result.status); // "PUSHING"
console.log(result.targetImageTag); // "username/my-app:tag"
```

---

## Database Schema

### Image Collection
```javascript
{
  _id: ObjectId,
  imageId: "img-1234567890-abcd",
  buildId: "build-xxx",
  userId: "user-xxx",
  imageName: "username/repo",
  tag: "v1.0.0",
  repository: "repo",
  dockerHubUrl: "https://hub.docker.com/...",
  size: 123456789,
  digest: "sha256:abc123...",
  status: "SUCCESS",                    // PENDING|PUSHING|SUCCESS|FAILED
  pushedAt: ISODate("2026-05-30T..."),
  pushStartedAt: ISODate("2026-05-30T..."),
  pushDuration: 45000,
  pushLogs: [
    {
      timestamp: ISODate("..."),
      message: "Pushing layer...",
      level: "info"
    }
  ],
  pushError: null,
  deploymentId: "deploy-xxx",
  dockerConfig: {
    username: "username",
    registry: "docker.io"
  },
  createdAt: ISODate("2026-05-30T..."),
  updatedAt: ISODate("2026-05-30T...")
}
```

### Indexes
```
{ userId: 1, createdAt: -1 }
{ buildId: 1, createdAt: -1 }
{ status: 1, createdAt: -1 }
```

---

## Image Statuses

| Status | Description | Duration |
|--------|-------------|----------|
| PENDING | Queued, waiting to start | < 1s |
| PUSHING | Currently pushing to Docker Hub | 30-120s |
| SUCCESS | Successfully pushed | N/A |
| FAILED | Push failed with error | N/A |

---

## Push Flow Steps

```
1. User builds image (status: SUCCESS)
2. Clicks "Push to Docker Hub" button
3. PushModal opens
4. User enters credentials:
   - Docker Hub username
   - Docker Hub password/token
   - Repository name (without username)
5. Clicks "Push to Docker Hub"
6. Frontend calls: POST /api/deployments/push
7. Backend validates and creates Image record (status: PENDING)
8. Backend updates to status: PUSHING
9. Backend emits: push:started event
10. Backend executes: docker tag + docker push
11. Logs captured in real-time, emitted via: push:log
12. After each log, stored in database
13. Push completes (success or failure)
14. Backend emits: push:completed event
15. Frontend updates UI with final status
16. User can navigate to Image Registry to view history
```

---

## Error Responses

### Invalid Build Status
```json
{
  "success": false,
  "error": "Build status is FAILED, only SUCCESS builds can be pushed"
}
```

### Missing Credentials
```json
{
  "success": false,
  "error": "dockerHubUsername is required"
}
```

### Docker Unavailable
```json
{
  "success": false,
  "error": "Docker daemon unavailable. Start Docker before pushing an image."
}
```

### Invalid Credentials
```json
{
  "success": false,
  "imageId": "img-xxx",
  "status": "FAILED",
  "error": "Invalid Docker Hub credentials",
  "image": {...}
}
```

### Authentication Error
```json
{
  "success": false,
  "error": "Unauthorized"
}
```

---

## Configuration

### Environment Variables
```bash
# Backend (.env)
API_PORT=5000
MONGODB_URI=mongodb+srv://...
SOCKET_PORT=5000

# Frontend (.env)
VITE_API_URL=http://localhost:5000/api
```

### Optional
```bash
DOCKER_HUB_USERNAME=default-username   # Pre-fill form
```

---

## Testing Commands

### cURL - Push Image
```bash
curl -X POST http://localhost:5000/api/deployments/push \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "buildId": "build-1234567890-abcd",
    "dockerHubUsername": "your-username",
    "dockerHubPassword": "your-password",
    "dockerHubRepo": "my-app"
  }'
```

### cURL - Get History
```bash
curl -X GET http://localhost:5000/api/deployments/images/history?limit=10 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### cURL - Get Image Details
```bash
curl -X GET http://localhost:5000/api/deployments/images/img-xxx \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Debugging

### Enable Debug Logs
```bash
DEBUG=devops-hub:* npm run dev
```

### Check Docker Connection
```bash
docker ps
docker version
docker info
```

### Test Docker Hub Auth
```bash
echo "password" | docker login -u username --password-stdin
docker pull ubuntu
```

### Monitor Socket Connection
```javascript
// Browser DevTools → Network → WS tab
// Should show connection to Socket.io
```

### Check MongoDB Connection
```bash
mongosh "mongodb+srv://..."
db.images.countDocuments({})
db.images.find().limit(1)
```

---

## Performance Tips

1. **Image Size**
   - Large images (>500MB) take 5+ minutes
   - Optimize Dockerfile to reduce layers
   - Use multi-stage builds

2. **Network**
   - Push from server location closer to Docker Hub
   - Ensure stable internet connection
   - Monitor bandwidth usage

3. **Database**
   - Index lookups by userId for fast history
   - Purge old logs periodically (>90 days)
   - Monitor MongoDB query times

4. **Frontend**
   - Cache image history in state
   - Debounce API calls
   - Optimize re-renders with React.memo

---

## Security Checklist

- [ ] Use Docker Hub Personal Access Tokens (not passwords)
- [ ] Enable HTTPS in production
- [ ] Set up IP whitelist for MongoDB
- [ ] Rotate credentials periodically
- [ ] Monitor failed push attempts
- [ ] Audit image push history
- [ ] Encrypt environment variables
- [ ] Use secrets management for production

---

## Useful Links

- [Docker Hub API](https://docs.docker.com/docker-hub/api/)
- [Docker Push Documentation](https://docs.docker.com/engine/reference/commandline/push/)
- [Personal Access Tokens](https://hub.docker.com/settings/security)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

---

**Last Updated:** May 30, 2026
**Version:** 1.0.0
