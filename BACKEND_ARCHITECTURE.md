# Backend Architecture & Integration Guide

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            DEVOPS HUB FRONTEND                          │
│                        (React + Firebase Auth)                          │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼ REST API     ▼ Socket.io    ▼ Webhooks
                    
┌─────────────────────────────────────────────────────────────────────────┐
│                      EXPRESS.JS BACKEND SERVER                          │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐ │
│ │  AUTH MIDDLEWARE │  │ REAL-TIME EVENTS │  │ ERROR HANDLING & LOGGING  │ │
│ │ (Firebase Token) │  │ (Socket.io)      │  │ (Comprehensive)          │ │
│ └─────────────────┘  └──────────────────┘  └──────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ ROUTE HANDLERS                                                     │  │
│ │ ├─ /api/dashboard → Real-time pipeline + metrics + alerts         │  │
│ │ ├─ /api/metrics   → CPU, Memory, Uptime, Container stats          │  │
│ │ ├─ /api/deployments → Deploy, Restart, Rollback                   │  │
│ │ ├─ /api/alerts    → Alert management & statistics                 │  │
│ │ ├─ /api/webhooks  → GitHub push events → Jenkins trigger          │  │
│ │ └─ /api/analyze   → AI log analysis                                │  │
│ └────────────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────────────────┐  │
│ │ SERVICES & INTEGRATIONS                                            │  │
│ │ ├─ Jenkins Service      → Build triggers, status, logs, stages    │  │
│ │ ├─ Docker Service       → Container management, stats             │  │
│ │ ├─ Metrics Service      → System info, resource monitoring        │  │
│ │ ├─ Alert Service        → Alert generation, escalation            │  │
│ │ ├─ AI Analysis Service  → Pattern detection, NLP, OpenAI          │  │
│ │ ├─ Firebase Admin SDK   → Token verification                      │  │
│ │ └─ Database Service     → MongoDB operations                      │  │
│ └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                 ▲                    ▲                ▲
                 │                    │                │
        ┌────────┴─────────┐   ┌──────┴──────┐   ┌────┴─────────┐
        │                  │   │             │   │              │
        ▼                  ▼   ▼             ▼   ▼              ▼
┌──────────────┐     ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  MONGODB     │     │   JENKINS    │  │    DOCKER    │  │    AWS EC2   │
│   Atlas      │     │   CI/CD      │  │  Containers  │  │  Deployment  │
│              │     │   Pipelines  │  │   Orchestration│  │   Server    │
│ ┌──────────┐ │     │              │  │              │  │              │
│ │Pipelines │ │     └──────────────┘  └──────────────┘  └──────────────┘
│ │Deployments     
│ │Alerts    │ │
│ │Metrics   │ │
│ │Logs      │ │
│ │Users     │ │
│ └──────────┘ │
└──────────────┘
```

## Data Flow Diagram

### 1. Dashboard Load Flow
```
User Opens Dashboard
    ↓
Frontend: Firebase Auth Token
    ↓
Backend: /api/dashboard
    ↓
Verify Token (Firebase Admin SDK)
    ↓
Parallel Fetch:
├─ Get Metrics → systeminformation
├─ Get Pipeline Status → Jenkins API
├─ Get Containers → Docker CLI
├─ Get Recent Logs → MongoDB
└─ Get Recent Deployments → MongoDB
    ↓
Compile Dashboard Response
    ↓
Frontend: Render with Real Data
```

### 2. Deployment Flow
```
User Clicks "Deploy"
    ↓
Frontend: POST /api/deployments/deploy
    ↓
Backend Receives Request:
├─ Validate token
├─ Extract deployment config
└─ Create deployment record (in-progress)
    ↓
Docker Operations:
├─ Get current container
├─ Stop old container
├─ Pull new image
├─ Run new container
└─ Health check
    ↓
Create Deployment Logs
    ↓
Update deployment status (success/failed)
    ↓
Generate Alert (deployment success/failed)
    ↓
Emit Socket.io event (alerts:new, metrics:update)
    ↓
Frontend: Update UI + Show notification
```

### 3. CI/CD Pipeline Flow
```
Developer: git push
    ↓
GitHub Webhook
    ↓
Backend: POST /api/webhooks/github
    ↓
Verify Webhook Signature
    ↓
Extract Git Info:
├─ Repository name
├─ Commit SHA
├─ Commit message
├─ Author name
└─ Branch
    ↓
Store Event in MongoDB (Webhook collection)
    ↓
Trigger Jenkins Pipeline:
├─ API call to Jenkins
├─ Pass build parameters
└─ Get build number
    ↓
Create Log Entry in MongoDB
    ↓
Emit Socket.io event (pipeline:update)
    ↓
Jenkins Execution:
├─ Build stage
├─ Test stage
├─ Deploy stage
└─ Generate logs
    ↓
Backend Polls Jenkins:
├─ Check build status every 10s
├─ Fetch console logs
└─ Extract stage information
    ↓
Generate Alerts if failed
    ↓
Frontend: Real-time updates via Socket.io
```

### 4. Metrics & Alerts Flow
```
Backend: Every 10 seconds
    ↓
Collect System Metrics:
├─ CPU % (systeminformation)
├─ Memory % (systeminformation)
├─ Disk % (systeminformation)
├─ Network stats
├─ Container stats (Docker API)
└─ System uptime
    ↓
Save to MongoDB (Metrics collection)
    ↓
Check Thresholds:
├─ CPU > 85%?
├─ Memory > 85%?
├─ Disk > 90%?
├─ Containers failed?
└─ Latency high?
    ↓
If threshold exceeded:
├─ Check if alert exists (within 5 min)
├─ Create new Alert in MongoDB
└─ Emit Socket.io event
    ↓
Emit metrics:update via Socket.io
    ↓
Frontend: Real-time dashboard update
```

### 5. Log Analysis Flow
```
User: POST /api/analyze/logs
    ↓
Backend Receives Logs
    ↓
Extract Patterns:
├─ Error keywords
├─ Warning patterns
├─ Timeout indicators
├─ Memory issues
├─ Network problems
└─ Database errors
    ↓
If OpenAI Enabled:
├─ Send to GPT-4 with patterns
├─ Get AI analysis with:
│   ├─ Failure probability
│   ├─ Root cause
│   ├─ Suggested fixes
│   └─ Affected stage
└─ Return AI response
    ↓
Fallback (if AI unavailable):
├─ Use rule-based analysis
├─ Pattern matching
└─ Heuristics-based scoring
    ↓
Save Analysis to MongoDB (Log collection)
    ↓
Frontend: Display analysis results
```

## Integration Points

### 1. Firebase Authentication
**File:** `src/middleware/authMiddleware.js`

```javascript
// Flow:
1. Frontend sends Firebase ID token in Authorization header
2. Backend extracts token
3. Firebase Admin SDK verifies token
4. Extract user info (uid, email, name)
5. Attach to req.user
6. Proceed with request
```

**Environments:**
- `process.env.FIREBASE_ADMIN_KEY` (JSON string)
- or `backend/serviceAccountKey.json` (file)

### 2. Jenkins Integration
**File:** `src/services/jenkinsService.js`

**Functions:**
- `triggerJenkinsPipeline()` - Start build
- `getJenkinsBuildStatus()` - Check status
- `getJenkinsBuildLogs()` - Fetch console logs
- `getJenkinsPipelineStages()` - Get stage details
- `getPipelineStatus()` - Overall status
- `getBuildHistory()` - Build history

**Configuration:**
```env
JENKINS_URL=http://jenkins:8080
JENKINS_USERNAME=admin
JENKINS_TOKEN=<api-token>
JENKINS_JOB_NAME=devops-hub-deploy
```

### 3. Docker Integration
**File:** `src/services/dockerService.js`

**Functions:**
- `getContainers()` - List all containers
- `getContainerStats()` - CPU, memory usage
- `buildImage()` - Build Docker image
- `runContainer()` - Start container
- `stopContainer()` - Stop container
- `deployContainer()` - Full deployment flow
- `getContainerLogs()` - Container logs

**Configuration:**
```env
DOCKER_HOST=unix:///var/run/docker.sock
# or tcp://localhost:2375
```

### 4. MongoDB Integration
**File:** `src/db.js`

**Models:**
- User
- Pipeline
- Deployment
- Alert
- Metrics
- Traffic
- Log

**Connection:**
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/db
```

### 5. GitHub Webhooks
**File:** `src/routes/webhookRoutes.js`

**Flow:**
```
GitHub Push
  ↓
POST /api/webhooks/github
  ↓
Verify Signature (HMAC SHA256)
  ↓
Extract repository, commit, author
  ↓
Save to Database
  ↓
Trigger Jenkins Pipeline
  ↓
Return 200 OK
```

**Configuration:**
```env
GITHUB_WEBHOOK_SECRET=<generated-secret>
GITHUB_TOKEN=<personal-access-token>
```

### 6. Real-Time Updates (Socket.io)
**File:** `src/server.js`

**Events:**
- `metrics:update` - System metrics every 10s
- `alerts:new` - New alerts generated
- `pipeline:update` - Pipeline status change
- `logs:new` - New logs created

**Client Subscription:**
```javascript
socket.emit('subscribe:metrics');
socket.emit('subscribe:alerts');
socket.emit('subscribe:pipeline');
socket.emit('subscribe:logs');
```

### 7. AI Log Analysis
**File:** `src/services/aiAnalysisService.js`

**APIs:**
- OpenAI GPT-4 (if configured)
- Fallback: Rule-based pattern analysis

**Configuration:**
```env
OPENAI_API_KEY=sk-<api-key>
ENABLE_AI_ANALYSIS=true
```

## Error Handling Strategy

### 1. Service Level Errors
```javascript
try {
  // Operation
} catch (error) {
  console.error("❌ [Service] Error:", error.message);
  return {
    success: false,
    error: error.message,
    details: error.stack
  };
}
```

### 2. Database Fallback
- If MongoDB unavailable → Use local SQLite database
- Enables development without MongoDB
- Automatic sync when DB comes online

### 3. External Service Failures
- Jenkins unavailable → Return cached last known status
- Docker unavailable → Return mock data
- OpenAI unavailable → Fallback to rule-based analysis
- GitHub webhook validation fails → Reject request

### 4. API Response Format
```javascript
// Success
res.json({
  success: true,
  data: {...}
})

// Error
res.status(400|500|503).json({
  success: false,
  error: "Error message",
  details: "Optional details"
})
```

## Performance Considerations

### 1. Caching Strategy
- **Metrics:** 5-second cache
- **Pipeline Status:** 30-second cache (Jenkins API limit)
- **Container List:** 2-second cache
- **Build History:** 1-minute cache

### 2. Database Indexing
```javascript
// Automatic indexes created on startup
pipelineSchema.index({ userId: 1, createdAt: -1 });
deploymentSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ severity: 1, resolved: 1 });
metricsSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });
```

### 3. TTL Indexes (Auto-Delete Old Data)
- Metrics: 30 days
- Logs: 90 days
- Traffic: 7 days

### 4. Batch Operations
- Collect metrics every 10 seconds (not 1s)
- Batch Socket.io emissions
- Debounce high-frequency updates

### 5. Connection Pooling
```javascript
// Mongoose handles pooling automatically
mongoose.connect(uri, {
  maxPoolSize: 10,
  minPoolSize: 5
});
```

## Security Measures

### 1. Authentication
- ✅ Firebase token verification on all protected routes
- ✅ Token in Authorization header: `Bearer <token>`
- ✅ Token verification middleware on all protected routes

### 2. CORS Protection
```javascript
cors({
  origin: process.env.CLIENT_ORIGIN.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
})
```

### 3. GitHub Webhook Verification
```javascript
// HMAC SHA256 signature verification
const signature = `sha256=${crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex')}`;
assert(signature === provided_signature);
```

### 4. Environment Variables
- All secrets in `.env`
- Never commit `.env` to git
- Use `.env.example` for template

### 5. No Sensitive Data in Logs
- Filter passwords, tokens before logging
- Don't log full request/response bodies
- Sanitize error messages

## Deployment Architecture

### Development
```
Frontend (http://localhost:3000)
    ↓
Backend (http://localhost:5000)
    ↓
MongoDB (localhost:27017)
Docker (unix socket)
```

### Production
```
Frontend (https://domain.com)
    ↓
Nginx Reverse Proxy (SSL/TLS)
    ↓
Backend Container (Port 5000)
    ↓
MongoDB Atlas
Docker Daemon
Jenkins Server
AWS EC2
```

### High Availability (Optional)
```
Load Balancer
    ├─ Backend Instance 1
    ├─ Backend Instance 2
    └─ Backend Instance 3
         ↓
    MongoDB Atlas (replicated)
    Docker Registry (shared)
    Jenkins Master
```

## Monitoring & Observability

### Metrics Collection
- **Interval:** Every 10 seconds
- **Metrics:** CPU, Memory, Disk, Network, Containers, Uptime
- **Storage:** MongoDB (30-day retention)

### Logging
- **Level:** INFO, WARN, ERROR, DEBUG
- **Sink:** Console + MongoDB
- **Retention:** 90 days
- **Formats:** Structured JSON logs

### Alerting
- **Triggers:** CPU > 85%, Memory > 85%, Disk > 90%, Containers failed
- **Storage:** MongoDB Alerts collection
- **Escalation:** Socket.io real-time notifications
- **Resolution:** Manual or automatic (TTL)

### Health Checks
- Database connectivity
- Jenkins availability
- Docker daemon accessibility
- External API status

## Troubleshooting Guide

### Service Startup Issues
1. Check environment variables
2. Verify database connection
3. Check port availability
4. Review startup logs

### Real-Time Updates Not Working
1. Check Socket.io connection
2. Verify CORS configuration
3. Check browser console for errors
4. Verify subscription events

### Database Issues
1. Check MongoDB Atlas IP whitelist
2. Verify connection string
3. Check user credentials
4. Review MongoDB logs

### Jenkins Integration Failures
1. Verify Jenkins URL
2. Check API token validity
3. Verify job name exists
4. Review Jenkins logs

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for detailed solutions.
