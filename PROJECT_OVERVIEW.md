# DevOps Dashboard - Comprehensive Project Overview

## 1. Frontend Components Structure

### ✅ Components in `src/components/`

#### 1. **ProtectedRoute.jsx**
- **Purpose**: Route guard component for authenticated pages
- **Data Source**: Uses `AuthContext` from authentication system
- **Functionality**: 
  - Checks if user is authenticated
  - Shows loading spinner while checking auth status
  - Redirects to `/login` if not authenticated
  - Renders protected content if authenticated
- **Type**: Guard component (not data-driven)

#### 2. **MonitoringDashboard.jsx**
- **Purpose**: Real-time monitoring dashboard displaying system and pipeline status
- **Data Sources**: **REAL API DATA**
  - `/monitoring/pipeline-status` - GET
  - `/monitoring/logs` - GET
  - `/monitoring/metrics` - GET
  - `/monitoring/alerts` - GET
- **Key Features**:
  - Auto-refreshes every 10 seconds
  - Displays pipeline status with logs, metrics, and alerts
  - Graceful error handling with fallback states
  - Shows last updated timestamp
  - Real-time data from backend monitoring system
- **State Management**: 
  - `pipelineStatus` - Pipeline CI/CD status
  - `logs` - System logs array
  - `metrics` - Performance metrics
  - `alerts` - System alerts array
  - `loading` & `error` - UI states

#### 3. **LogAnalysisForm.jsx**
- **Purpose**: Allows users to submit logs for AI-based failure prediction analysis
- **Data Sources**: **REAL API DATA**
  - POST `/analyze` - Submit logs for analysis
  - Expected request body: `{ logs: string, pipelineId: string }`
  - Returns: Analysis results with failure probability, severity, root cause, suggested fixes
- **Key Features**:
  - Form to input logs and select pipeline ID
  - Submits logs to backend for AI analysis
  - Displays results via `AnalysisPrediction` component
  - Error handling and validation
  - Form reset capability
- **State Management**:
  - `logs` - User-entered logs text
  - `pipelineId` - Selected pipeline ID
  - `analysis` - AI analysis results
  - `loading` & `error` - UI states
  - `showForm` - Toggle between form and results view

#### 4. **AnalysisPrediction.jsx**
- **Purpose**: Displays AI-based failure prediction analysis results
- **Data Source**: Receives analysis object as prop (from LogAnalysisForm)
- **Key Features**:
  - Shows failure probability (0-100%)
  - Displays severity level with color coding:
    - Critical (Red) - `from-red-500 to-red-700`
    - High (Orange) - `from-orange-500 to-orange-700`
    - Medium (Yellow) - `from-yellow-500 to-yellow-700`
    - Low (Green) - `from-green-500 to-green-700`
  - Displays root cause analysis
  - Shows explanation of findings
  - Lists suggested fixes with expandable details
  - Shows analysis metadata and timestamp
- **Props**:
  - `analysis` - Analysis data object
  - `loading` - Loading state (optional)

---

## 2. Frontend Pages Structure

### ✅ Pages in `src/pages/`

#### 1. **Dashboard.jsx**
- **Purpose**: Main authenticated dashboard showing system overview and monitoring
- **Data Sources**: **REAL API DATA**
  - `/dashboard` - GET (main dashboard endpoint)
  - Real-time subscriptions:
    - `subscribeToMetrics()` - WebSocket metrics updates
    - `subscribeToAlerts()` - WebSocket alerts updates
    - `subscribeToLogs()` - WebSocket logs updates
- **Key Features**:
  - Displays system metrics (CPU, Memory, Containers, Latency)
  - Shows pipeline status
  - Container management (start/stop/restart)
  - Action controls (Deploy, Rollback, Restart)
  - Real-time updates via WebSocket
  - Menu for Settings, Help, Support
  - User profile and logout
- **State Management**:
  - `dashboard` - Main dashboard data object
  - `error` - Error messages
  - `menuOpen` - Menu toggle state
  - `lastUpdated` - Timestamp of last update
  - Various UI toggle states (settings, help, support)
- **Integrations**:
  - WebSocket subscriptions for real-time data
  - Uses `useTransition` for pending states
  - Integrates with `LogAnalysisForm` component

#### 2. **Login.jsx**
- **Purpose**: User authentication page
- **Data Sources**: **REAL API DATA**
  - POST `/auth/login` - Email/password login
  - POST `/auth/firebase` - Firebase authentication
  - Firebase SDK integration for Google OAuth
  - GET `/auth/me` - Get current user (via API)
- **Authentication Methods**:
  1. Email/Password login (Firebase + backend)
  2. Google OAuth (Firebase)
- **Key Features**:
  - Email and password input fields
  - Google Sign-In button
  - Error handling and validation
  - Redirect to dashboard on successful login
  - Firebase token exchange with backend
- **Data Flow**:
  1. Firebase authentication (client-side)
  2. Send Firebase token to backend `/auth/firebase`
  3. Backend verifies and returns JWT token
  4. JWT token stored in localStorage
  5. User redirected to dashboard

#### 3. **Signup.jsx**
- **Purpose**: User registration page
- **Data Sources**: **REAL API DATA**
  - POST `/auth/signup` - Create new account with email/password
  - POST `/auth/firebase` - Firebase signup
  - Firebase SDK integration for Google OAuth
- **Registration Methods**:
  1. Email/Password signup (Firebase + backend)
  2. Google OAuth (Firebase)
- **Key Features**:
  - Name, email, password, confirm password fields
  - Password validation (min 6 characters, must match)
  - Google Sign-Up button
  - Error handling (Firebase errors, validation)
  - Auto-logout on backend registration failure
  - Redirect to dashboard on successful signup
- **Data Flow**:
  1. Client-side validation
  2. Firebase signup
  3. Send Firebase token + name to backend `/auth/firebase`
  4. Backend creates user record and returns JWT
  5. JWT stored in localStorage
  6. User redirected to dashboard

---

## 3. Backend API Routes & Endpoints

### ✅ API Base URL Configuration
```javascript
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api"
```

### 📊 Route Files Breakdown

---

## 3.1 Authentication Routes (`backend/src/routes/authRoutes.js`)

| Method | Endpoint | Auth | Purpose | Request Body | Response |
|--------|----------|------|---------|--------------|----------|
| POST | `/auth/signup` | ❌ No | Register new user | `{email, password, name}` | `{user, token}` |
| POST | `/auth/login` | ❌ No | Login with email/password | `{email, password}` | `{user, token}` |
| POST | `/auth/google` | ❌ No | Google OAuth authentication | `{token: googleToken}` | `{user, token}` |
| POST | `/auth/firebase` | ❌ No | Firebase authentication | `{firebaseToken, name?}` | `{user, token}` |
| GET | `/auth/me` | ✅ Yes | Get current authenticated user | N/A | `{user object}` |

---

## 3.2 Monitoring Routes (`backend/src/routes/monitoringRoutes.js`)

| Method | Endpoint | Auth | Purpose | Request Body | Response |
|--------|----------|------|---------|--------------|----------|
| GET | `/monitoring/` | ✅ Yes | Get all monitoring data | N/A | `{status, metrics, logs, alerts, timestamp}` |
| GET | `/monitoring/pipeline-status` | ✅ Yes | GitHub pipeline CI/CD status | N/A | Pipeline status object |
| GET | `/monitoring/logs` | ✅ Yes | Docker container logs | N/A | `{logs: array, fallback: array}` |
| GET | `/monitoring/metrics` | ✅ Yes | System metrics (CPU, memory, uptime) | N/A | Metrics object |
| GET | `/monitoring/alerts` | ✅ Yes | System alerts | N/A | `{alerts: array}` |

---

## 3.3 Analysis Routes (`backend/src/routes/analyzeRoutes.js`)

| Method | Endpoint | Auth | Purpose | Request Body | Response |
|--------|----------|------|---------|--------------|----------|
| POST | `/analyze/` | ✅ Yes | AI-based log failure prediction | `{logs: string, pipelineId?: string}` | `{success, analysis, metrics, message}` |
| POST | `/analyze/analyze-logs` | ✅ Yes | Alternative analysis endpoint (backwards compatible) | `{logs: string, pipelineId?: string}` | Same as above |

**Analysis Response Structure**:
```javascript
{
  success: true,
  analysis: {
    failure_probability: 0-100,
    severity: "Low|Medium|High|Critical",
    root_cause: string,
    explanation: string,
    suggested_fixes: [string],
    affected_stage: "build|test|deploy|integration",
    confidence: 0-100,
    metrics: {...}
  },
  metrics: {
    errorCount, warningCount, failureCount, 
    timeoutCount, testCount, totalLines
  }
}
```

---

## 3.4 Metrics Routes (`backend/src/routes/metricsRoutes.js`)

| Method | Endpoint | Auth | Purpose | Request Body | Response |
|--------|----------|------|---------|--------------|----------|
| GET | `/metrics/` | ❌ No | Comprehensive dashboard data | N/A | `{status, metrics, pipeline, docker, recentPipelines, recentLogs}` |
| GET | `/metrics/metrics` | N/A | System metrics | N/A | Metrics object |
| GET | `/metrics/metrics/history` | N/A | Metrics history | query: `duration` (ms) | Historical metrics |
| GET | `/metrics/pipeline` | N/A | Pipeline status | N/A | Pipeline status |
| GET | `/metrics/pipeline/builds` | N/A | Build history | query: `limit` (default 10) | Build history array |
| GET | `/metrics/pipeline/last-successful` | N/A | Last successful build | N/A | Build object |
| GET | `/metrics/containers` | N/A | Docker containers | N/A | Containers array |

---

## 3.5 Dashboard Routes (`backend/src/routes/dashboardRoutes.js`)

| Method | Endpoint | Auth | Purpose | Request Body | Response |
|--------|----------|------|---------|--------------|----------|
| GET | `/dashboard/` | ❌ No | Complete dashboard data | N/A | Full dashboard object |
| GET | `/dashboard/health` | ❌ No | Dashboard service health check | N/A | `{ok: true, message}` |
| GET | `/dashboard/pipeline-status` | ❌ No | Pipeline status from real Jenkins | N/A | Pipeline object |
| GET | `/dashboard/metrics` | ❌ No | Current system metrics | N/A | Metrics object |
| GET | `/dashboard/logs` | ❌ No | Recent logs | N/A | Logs array |
| GET | `/dashboard/alerts` | ❌ No | Recent alerts | N/A | Alerts array |
| POST | `/dashboard/deploy` | ❌ No | Trigger manual deployment | `{version, containerName, image, environment}` | `{success, deployment, dashboard}` |
| POST | `/dashboard/rollback` | ❌ No | Trigger rollback | `{containerName, previousVersion, reason}` | `{success, deployment, dashboard}` |
| POST | `/dashboard/restart` | ❌ No | Restart containers | `{containerName}` | `{success, dashboard}` |

---

## 3.6 Deployment Routes (`backend/src/routes/deploymentRoutes.js`)

| Method | Endpoint | Auth | Purpose | Request Body | Response |
|--------|----------|------|---------|--------------|----------|
| POST | `/deployments/deploy` | ✅ Yes | Deploy new container version | `{containerName, image, ports[], env[], volumes[], version}` | `{success, deployment, logs}` |
| POST | `/deployments/restart` | ✅ Yes | Restart container | `{containerName}` | `{success, logs}` |
| GET | `/deployments/history` | ✅ Yes | Deployment history | N/A | Deployments array |
| POST | `/deployments/rollback` | ✅ Yes | Rollback to previous version | `{containerName, previousVersion, reason}` | `{success, deployment, logs}` |

---

## 3.7 Alerts Routes (`backend/src/routes/alertRoutes.js`)

| Method | Endpoint | Auth | Purpose | Request Body | Response |
|--------|----------|------|---------|--------------|----------|
| GET | `/alerts/` | ✅ Yes | Get alerts with filtering | query: `severity, type, resolved, limit, skip` | `{alerts: array, total, unresolved}` |
| GET | `/alerts/stats` | ✅ Yes | Alert statistics | N/A | Alert stats object |
| POST | `/alerts/` | ✅ Yes | Create new alert | `{type, severity, title, message, resourceType, resourceId, metadata}` | Created alert object |
| PUT | `/alerts/:id/resolve` | ✅ Yes | Resolve alert | `{action}` | Updated alert object |
| DELETE | `/alerts/:id` | ✅ Yes | Delete alert | N/A | Confirmation response |

**Alert Types**: `deployment_failed`, `deployment_success`, `cpu_high`, `memory_high`, `container_stopped`, `pipeline_failed`, `pipeline_success`, `health_check_failed`, `custom`

**Alert Severity**: `info`, `warning`, `critical`

---

## 3.8 Webhook Routes (`backend/src/routes/webhookRoutes.js`)

| Method | Endpoint | Auth | Purpose | Request Body | Response |
|--------|----------|------|---------|--------------|----------|
| POST | `/webhooks/github` | ❌ No | GitHub webhook receiver | GitHub payload | Webhook processed response |
| GET | `/webhooks/health` | ❌ No | Webhook service health | N/A | `{ok: true}` |
| GET | `/webhooks/history` | ✅ Yes | Webhook history | N/A | Webhooks array |
| GET | `/webhooks/stats` | ✅ Yes | Webhook statistics | N/A | Stats object |
| GET | `/webhooks/:webhookId` | ✅ Yes | Get specific webhook | N/A | Webhook object |
| GET | `/webhooks/repo/:repoName` | ✅ Yes | Get webhooks by repository | N/A | Webhooks array |
| DELETE | `/webhooks/:webhookId` | ✅ Yes | Delete webhook | N/A | Confirmation response |

---

## 4. Backend Data Models

### 📦 Model Files Location: `backend/src/models/`

#### 1. **User.js**
```javascript
{
  email: String (unique, required),
  name: String (required),
  password: String (hashed, optional for OAuth),
  googleId: String,
  firebaseUid: String,
  profilePicture: String,
  authProvider: String (enum: "local", "google", "firebase"),
  createdAt: Date,
  timestamps: true
}
```

#### 2. **Metrics.js**
```javascript
{
  userId: String (required),
  timestamp: Date,
  cpu: Number (0-100%),
  memory: Number (0-100%),
  disk: Number (0-100%),
  network: { incoming: Number, outgoing: Number },
  uptime: Number (seconds),
  latency: Number (milliseconds),
  activeConnections: Number,
  requestsPerSecond: Number,
  containerCount: Number,
  containerHealth: { running, stopped, failed },
  systemLoad: { load1, load5, load15 },
  createdAt: Date,
  TTL: 30 days auto-delete
}
```

#### 3. **Alert.js**
```javascript
{
  userId: String (required),
  type: String (enum: deployment_failed, deployment_success, cpu_high, 
                     memory_high, container_stopped, pipeline_failed, 
                     pipeline_success, health_check_failed, custom),
  severity: String (enum: "info", "warning", "critical"),
  title: String (required),
  message: String (required),
  resourceType: String (enum: "pipeline", "container", "deployment", "system", "webhook"),
  resourceId: String,
  metadata: { cpu, memory, threshold, container, version },
  resolved: Boolean,
  resolvedAt: Date,
  resolvedBy: String,
  action: String,
  createdAt: Date,
  updatedAt: Date
}
```

#### 4. **Deployment.js**
```javascript
{
  userId: String (required),
  pipelineId: ObjectId (ref: Pipeline),
  version: String (required),
  previousVersion: String,
  status: String (enum: "in-progress", "success", "failed", "rolled-back"),
  environment: String (enum: "development", "staging", "production"),
  containers: [{ name, image, status, ports }],
  deploymentType: String (enum: "manual", "auto", "rollback"),
  deployedBy: String,
  deploymentScript: String,
  startTime: Date,
  endTime: Date,
  duration: Number,
  rollbackReason: String,
  logs: [String],
  createdAt: Date,
  updatedAt: Date
}
```

#### 5. **LogAnalysis.js**
```javascript
{
  userId: ObjectId (ref: User, required),
  pipelineId: String (required),
  originalLogs: String (first 50KB stored),
  logMetrics: { 
    errorCount, warningCount, failureCount, 
    timeoutCount, testCount, totalLines 
  },
  analysis: {
    failure_probability: Number (0-100, required),
    severity: String (enum: "Low", "Medium", "High", "Critical"),
    root_cause: String (required),
    explanation: String (required),
    suggested_fixes: [String],
    affected_stage: String (enum: "build", "test", "deploy", "integration"),
    confidence: Number (0-100, default: 75)
  },
  aiModel: String (default: "gpt-4-turbo-preview"),
  usedFallback: Boolean,
  processingTime: Number (milliseconds),
  status: String (enum: "pending", "completed", "failed"),
  errorMessage: String,
  createdAt: Date
}
```

#### 6. **Additional Models**: Pipeline, Logs, Traffic, Webhook, DashboardState
(Similar MongoDB schema structure with indexes for performance)

---

## 5. Frontend API Client Setup

### 📡 API Configuration File: `frontend/src/lib/api.js`

#### Base Configuration
```javascript
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api"
const API_TIMEOUT = 10000 // 10 second timeout
```

#### Core Request Function
**`request(path, options = {})`** - Generic fetch wrapper
- Handles authentication token injection from `localStorage`
- Implements request timeout with AbortController
- Auto-clears invalid auth tokens (401 responses)
- Provides detailed error messages:
  - Timeout detection: Timeout message with backend start instructions
  - CORS/Network errors: Connection failure message with troubleshooting steps
  - Response errors: Server error messages

#### Key Features
1. **Authorization**: Automatically injects `Authorization: Bearer {token}` header
2. **Error Handling**: 
   - Detects timeouts vs connection vs server errors
   - Redirects to login on 401 (unauthorized)
   - Clears invalid tokens from localStorage
3. **Debugging**: Logs all API calls with method and path

#### Exported Helper Functions

**Authentication Functions**:
```javascript
signup(email, password, name) → POST /auth/signup
login(email, password) → POST /auth/login
googleAuth(googleToken) → POST /auth/google
firebaseAuth(firebaseToken, name?) → POST /auth/firebase
getCurrentUser() → GET /auth/me
logout() → Clears localStorage
```

**Dashboard Functions**:
```javascript
getDashboard() → GET /dashboard
deployRelease() → POST /deployments/deploy
rollbackRelease() → POST /deployments/rollback
restartServices() → POST /deployments/restart
```

**Monitoring Functions**:
```javascript
getMetrics() → GET /metrics
getAlerts() → GET /alerts
getLogs() → GET /logs
getPipeline() → GET /pipeline
```

**Analysis Functions**:
```javascript
analyzeLogs(logs, pipelineId = "default") → POST /analyze
```

#### Authentication Context: `frontend/src/lib/AuthContext.jsx`

```javascript
// Provides:
- user: Current user object (null if not authenticated)
- isAuthenticated: Boolean auth status
- loading: Boolean loading state
- login(userData, token): Store auth and user data
- logout(): Clear auth data and redirect

// Auto-checks authentication on app load via getCurrentUser()
// Gracefully handles auth failures (no error on login page)
```

---

## 6. Data Flow Architecture

### 🔄 Authentication Flow
```
User (Login/Signup)
    ↓
Firebase Auth (email/password or OAuth)
    ↓
Send Firebase Token → Backend `/auth/firebase`
    ↓
Backend verifies token, creates/updates user
    ↓
Backend returns JWT token + User data
    ↓
Frontend stores JWT in localStorage
    ↓
AuthContext.login() sets user state
    ↓
Redirect to Dashboard
```

### 🔄 Monitoring Flow
```
Dashboard.jsx
    ↓
useEffect: getDashboard() → `/dashboard` GET
    ↓
WebSocket Subscriptions (real-time updates):
  - subscribeToMetrics()
  - subscribeToAlerts()
  - subscribeToLogs()
    ↓
Update state with real data
    ↓
Render metrics, pipeline status, alerts
```

### 🔄 Log Analysis Flow
```
User submits logs in LogAnalysisForm.jsx
    ↓
POST `/analyze` with {logs, pipelineId}
    ↓
Backend preprocesses logs, extracts metrics
    ↓
Try AI analysis (GPT-4), fallback to heuristic
    ↓
Save analysis to LogAnalysis collection
    ↓
Return analysis object with:
  - failure_probability
  - severity
  - root_cause
  - suggested_fixes
    ↓
AnalysisPrediction component displays results
```

---

## 7. Data Source Summary

| Component/Page | Data Source | Type | Real/Dummy |
|---|---|---|---|
| ProtectedRoute | AuthContext | Auth state | Real |
| MonitoringDashboard | `/monitoring/*` endpoints | Real API | Real |
| LogAnalysisForm | `/analyze` endpoint | Real API | Real |
| AnalysisPrediction | Props from LogAnalysisForm | Real API | Real |
| Dashboard | `/dashboard` + WebSocket | Real API | Real |
| Login | `/auth/firebase` + Firebase SDK | Real API | Real |
| Signup | `/auth/firebase` + Firebase SDK | Real API | Real |

**✅ All components use REAL API data - No dummy/mock data**

---

## 8. Key Technical Stack

### Frontend
- **Framework**: React 18
- **Router**: React Router v6
- **API Client**: Fetch API (custom wrapper)
- **Authentication**: Firebase + JWT
- **Real-time**: WebSocket (socket.io based)
- **UI Components**: Framer Motion (animations), Recharts (charts), Tailwind CSS
- **Build Tool**: Vite

### Backend
- **Framework**: Express.js
- **Database**: MongoDB (Mongoose ODM)
- **Authentication**: JWT + Firebase Admin SDK
- **AI Analysis**: OpenAI GPT-4 Turbo Preview (with fallback heuristics)
- **Real-time**: WebSocket support
- **Container**: Docker
- **Deployment**: Docker Compose

### External Services
- **Authentication**: Firebase (Google OAuth support)
- **AI**: OpenAI API (for log analysis)
- **CI/CD Integration**: GitHub, Jenkins
- **Webhooks**: GitHub webhooks for pipeline events

---

## 9. Environment Configuration

### Frontend (.env)
```
VITE_API_URL=http://localhost:5000/api
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
```

### Backend (.env)
```
PORT=5000
MONGODB_URI=...
FIREBASE_PROJECT_ID=...
OPENAI_API_KEY=...
GITHUB_TOKEN=...
JENKINS_URL=...
DOCKER_SOCKET=...
```

---

## Summary

✅ **Fully integrated real-time DevOps dashboard with:**
- Real-time monitoring (via WebSocket)
- AI-powered log analysis for failure prediction
- Docker container management
- Deployment automation
- Alert management
- GitHub webhook integration
- Jenkins CI/CD integration
- Firebase authentication with Google OAuth
- Complete API documentation with 30+ endpoints
- Comprehensive data models with MongoDB persistence
