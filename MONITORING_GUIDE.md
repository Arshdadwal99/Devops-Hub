# Real Monitoring Implementation Guide

## Overview

Your DevOps Dashboard now has **complete real-time monitoring** for:
- GitHub Actions Pipeline Status
- Docker Container Logs
- System Metrics (CPU, Memory, Uptime)
- Automated Alerts

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

(The monitoring code uses Node.js built-in modules and the OpenAI SDK already installed)

### 2. Configure Environment Variables

Edit `backend/.env` and add:

```env
# GitHub Monitoring (Required for pipeline status)
GITHUB_TOKEN=your-github-personal-access-token
REPO_OWNER=your-github-username
REPO_NAME=devops-dashboard

# Docker Monitoring (Required for logs)
CONTAINER_NAME=devops-dashboard-backend
```

#### How to Get GitHub Token:
1. Go to https://github.com/settings/tokens
2. Click "Generate new token"
3. Select scopes: `repo`, `workflow`, `read:org`
4. Copy and paste in `.env`

### 3. Restart Backend

```bash
cd backend
npm run dev
```

## Frontend Usage

### Access Monitoring Dashboard

1. Login at http://localhost:5173
2. Click "Real-Time Monitoring" or navigate to:
   ```
   http://localhost:5173/monitoring
   ```

### Features

#### Pipeline Status
- Shows latest GitHub workflow run
- Displays status: `success`, `failure`, `in_progress`
- Shows branch and commit message

#### Metrics Cards
- **CPU Usage**: Shows percentage and core count
- **Memory Usage**: Shows used/total memory
- **Server Uptime**: Shows uptime in hours/minutes

#### Alerts System
- Automatic warnings when CPU > 80%
- Critical alerts when Memory > 85%
- Info alerts for server uptime > 24 hours

#### Logs Viewer
- Displays last 50 Docker container logs
- Expandable view for more logs
- Error logs highlighted in red

#### Auto Refresh
- Data refreshes automatically every 10 seconds
- Timestamp shows last update

## API Endpoints

### 1. GET /api/monitoring/pipeline-status
Returns GitHub pipeline status

**Response:**
```json
{
  "status": "completed",
  "conclusion": "success",
  "workflow_name": "Build & Deploy",
  "last_commit": "Fix: Update dependencies",
  "timestamp": "2026-04-19T10:30:00Z",
  "run_number": 42,
  "branch": "main"
}
```

### 2. GET /api/monitoring/logs
Returns Docker container logs

**Response:**
```json
{
  "container": "devops-dashboard-backend",
  "logs": [
    {
      "timestamp": "2026-04-19T10:30:00Z",
      "message": "[2026-04-19 10:30:00] Server started",
      "type": "info"
    },
    {
      "timestamp": "2026-04-19T10:30:05Z",
      "message": "[2026-04-19 10:30:05] Error: Connection timeout",
      "type": "error"
    }
  ],
  "count": 2
}
```

### 3. GET /api/monitoring/metrics
Returns system metrics

**Response:**
```json
{
  "cpu": {
    "usage": 45,
    "cores": 8,
    "load": [1.23, 1.45, 1.32]
  },
  "memory": {
    "total": 16384,
    "used": 8192,
    "free": 8192,
    "percent": 50,
    "process": {
      "rss": 256,
      "heapUsed": 128
    }
  },
  "uptime": 3600,
  "timestamp": "2026-04-19T10:30:00Z"
}
```

### 4. GET /api/monitoring/alerts
Returns system alerts

**Response:**
```json
{
  "alerts": [
    {
      "id": "cpu-1234567890",
      "severity": "warning",
      "title": "High CPU Usage",
      "message": "CPU usage is at 82%",
      "timestamp": "2026-04-19T10:30:00Z",
      "resolved": false
    }
  ],
  "total": 1,
  "critical": 0,
  "warnings": 1,
  "timestamp": "2026-04-19T10:30:00Z"
}
```

## File Structure

```
backend/
  ├── src/
  │   ├── controllers/
  │   │   └── monitoringController.js    ← NEW
  │   ├── routes/
  │   │   └── monitoringRoutes.js        ← NEW
  │   └── server.js                      ← UPDATED
  └── .env                               ← UPDATED

frontend/
  ├── src/
  │   ├── components/
  │   │   └── MonitoringDashboard.jsx    ← NEW
  │   ├── App.jsx                        ← UPDATED (added /monitoring route)
  │   └── lib/
  │       └── api.js                     ← (no changes needed)
```

## Testing

### Test Pipeline Status
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/monitoring/pipeline-status
```

### Test System Metrics
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/monitoring/metrics
```

### Test Alerts
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/monitoring/alerts
```

### Test Docker Logs
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/monitoring/logs
```

## Troubleshooting

### Docker Logs Not Showing
- Make sure container name in `.env` is correct
- Verify Docker is running: `docker ps`
- Check if container exists: `docker logs <container_name>`

### Pipeline Status Returns Error
- Verify GitHub token has correct permissions
- Check `REPO_OWNER` and `REPO_NAME` are correct
- Test token: `curl -H "Authorization: Bearer YOUR_TOKEN" https://api.github.com/user`

### Metrics Not Updating
- Backend should be running
- Check browser console for errors
- Verify JWT token is valid

## Performance Notes

- Monitoring data refreshes every 10 seconds (configurable)
- Docker logs limited to last 50 lines (configurable in controller)
- CPU calculation uses first core as sample
- Memory values in MB for readability

## Security

All monitoring endpoints are **protected with JWT authentication**. 
- Requires valid auth token in `Authorization: Bearer <token>` header
- Tokens expire in 7 days
- Invalid tokens redirect to login

## Future Enhancements

1. Add database persistence for metrics history
2. Create charts showing CPU/memory over time
3. Add log filtering and search
4. Email/Slack alerts for critical issues
5. Custom alert thresholds
6. Metrics export (CSV, JSON)

## Support

For issues or questions:
1. Check backend logs: `npm run dev`
2. Check browser console for API errors
3. Verify all environment variables are set
4. Ensure MongoDB and Docker are running (if needed)
