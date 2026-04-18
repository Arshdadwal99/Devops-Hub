# PulseOps Control Center

PulseOps is a mini DevOps control center built for demos, coursework, and portfolio use. It includes:

- React + Tailwind + Framer Motion frontend with a dark glassmorphism dashboard
- Node.js + Express backend with JWT authentication
- MongoDB-backed user and dashboard state
- Google OAuth 2.0 authentication
- Dockerized frontend, backend, and database
- GitHub Actions workflow for build, lint, and container image checks

## Features

- User authentication (email/password and Google OAuth)
- CI/CD pipeline status
- Deployment logs and error logs
- Live infrastructure metrics cards and charts
- Deploy, restart, and rollback actions
- Alert feed for failures and recommendations
- Auto-refresh dashboard for demo readiness
- Protected dashboard routes
- **AI-Based Failure Prediction** - Real-time log analysis with OpenAI for failure prediction, severity classification, and fix suggestions

## Authentication Setup

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URIs:
   - `http://localhost:5173` (development)
   - Your production domain (for deployment)
6. Copy the Client ID and Client Secret

### Environment Configuration

Update environment files with your Google OAuth credentials:

**Backend (.env):**
```
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
JWT_SECRET=your-secret-key
OPENAI_API_KEY=your-openai-api-key
```

**Frontend (.env):**
```
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

## AI-Based Failure Prediction Setup

The dashboard includes an integrated AI system powered by OpenAI GPT-4 that analyzes CI/CD logs to predict failures.

### Quick Setup (3 steps)

1. **Get OpenAI API Key**
   - Visit https://platform.openai.com/account/api-keys
   - Create new API key

2. **Add to backend/.env**
   ```env
   OPENAI_API_KEY=sk-proj-your-actual-key-here
   ```

3. **Start servers and use!**
   - Go to dashboard
   - Scroll to "Log Analysis for Failure Prediction"
   - Paste CI/CD logs
   - Get AI-powered predictions

### Features

- Analyzes CI/CD logs in real-time
- Predicts failure probability (0-100%)
- Classifies severity (Low/Medium/High/Critical)
- Provides root cause analysis
- Suggests actionable fixes
- Falls back to heuristic analysis if AI unavailable
- Stores all analyses for history

### Documentation

- **Quick Start**: See `AI_SETUP.md`
- **Full Guide**: See `AI_PREDICTION_GUIDE.md`
- **API Reference**: See `API_REFERENCE.md`

### Cost

- ~$0.02-0.05 per analysis (with GPT-4)
- No API key needed for basic heuristic analysis
- Recommended budget: $100-200/month for active use

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create environment files:

- Copy `backend/.env.example` to `backend/.env` and fill in values
- Copy `frontend/.env.example` to `frontend/.env` and fill in values

3. Start MongoDB locally or with Docker, then run these in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Frontend runs on `http://localhost:5173` and backend runs on `http://localhost:5000`.

## Docker

```bash
docker compose up --build
```

Then open `http://localhost:8080`.

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Login with email/password
- `POST /api/auth/google` - Login/signup with Google
- `GET /api/auth/me` - Get current user (requires authentication)

### Protected Routes (require JWT token)
- `GET /api/pipeline-status`
- `GET /api/metrics`
- `GET /api/logs`
- `GET /api/dashboard`
- `POST /api/deploy`
- `POST /api/restart`
- `POST /api/rollback`
- `POST /api/analyze-logs` - Analyze CI/CD logs for failure prediction
- `GET /api/analyze-logs/history` - Get user's analysis history
- `GET /api/analyze-logs/:id` - Get specific analysis by ID
