# AI-Based Failure Prediction System - Quick Setup

Congratulations! The AI-based failure prediction system has been successfully integrated into your DevOps Dashboard. Here's how to get it working.

## What Was Added

### Backend (Node.js/Express)
- **AI Service**: `backend/src/services/aiAnalysisService.js`
  - OpenAI GPT-4 integration
  - Fallback heuristic analysis
  
- **Database Model**: `backend/src/models/LogAnalysis.js`
  - MongoDB schema for storing analyses
  
- **API Routes**: `backend/src/routes/analyzeRoutes.js`
  - POST /api/analyze-logs - Submit logs for analysis
  - GET /api/analyze-logs/history - View your analyses
  - GET /api/analyze-logs/:id - Get specific analysis

### Frontend (React)
- **LogAnalysisForm**: `frontend/src/components/LogAnalysisForm.jsx`
  - Input form for CI/CD logs
  - Shows results
  
- **AnalysisPrediction**: `frontend/src/components/AnalysisPrediction.jsx`
  - Beautiful results display
  - Animated progress bars
  - Color-coded severity
  
- **Dashboard Integration**: Form added to dashboard

## Setup Steps (5 minutes)

### 1️⃣ Get OpenAI API Key

1. Visit https://platform.openai.com/account/api-keys
2. Create new API key
3. Copy it (looks like: `sk-proj-xxxxx...`)

### 2️⃣ Add Key to Backend

Edit `backend/.env` and replace:
```env
OPENAI_API_KEY=sk-proj-your-actual-key-here
```

### 3️⃣ Start the Servers

```bash
# Terminal 1 - Backend
cd backend
npm start

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

### 4️⃣ Test It Out

1. Go to http://localhost:5173 and login
2. Scroll down to "Log Analysis for Failure Prediction"
3. Paste some CI/CD logs (sample below)
4. Click "Analyze Logs"
5. See the AI prediction results!

## Sample Logs to Try

### Build Failure
```
[INFO] Building application...
[ERROR] TypeError: Cannot read property 'map' of undefined at src/utils.js:42
[ERROR] Compilation failed
[WARN] 2 warnings, 1 error
```

### Test Failure
```
[INFO] Running tests...
[FAIL] Integration test failed: API timeout after 5000ms
[FAIL] Database connection test: Connection refused
[INFO] 3 passed, 2 failed
```

### Deployment Issue
```
[INFO] Deploying to production...
[ERROR] Failed to pull image: registry unreachable
[ERROR] Network error: getaddrinfo ENOTFOUND registry.example.com
[WARN] Retrying... (attempt 2/3)
```

## How It Works

1. **You submit logs** via the form
2. **System preprocesses** them (extracts key lines, removes secrets)
3. **AI analyzes** using OpenAI GPT-4
4. **Returns prediction** with:
   - Failure probability (0-100%)
   - Severity level (Low/Medium/High/Critical)
   - Root cause explanation
   - Suggested fixes
   - Confidence score

5. **Stores in database** for later viewing

## Features

✅ **Real-time Analysis** - Get results in 1-4 seconds
✅ **Secure** - Passwords/keys are removed from logs
✅ **Fallback Mode** - Works even if AI unavailable (heuristic analysis)
✅ **History** - All analyses saved, viewable later
✅ **Export** - Download results as JSON
✅ **Beautiful UI** - Animations and color-coded severity

## Costs

- **Free to start** (OpenAI free credits)
- **After free tier**: ~$0.02-0.05 per analysis
- **1000 analyses**: ~$20-50
- **Recommended budget**: $100-200/month for active use

## No API Key?

No problem! The system still works:
- Uses fallback heuristic analysis
- Analyzes log patterns automatically
- Lower confidence but still useful
- All features available

## Common Issues & Fixes

### "API Key not set"
→ Add OPENAI_API_KEY to backend/.env

### "Network error" 
→ Check internet connection
→ Verify firewall allows outbound to api.openai.com

### "Rate limit exceeded"
→ Too many requests in short time
→ Wait 1 minute, try again

### Fallback analysis being used
→ OpenAI service unavailable
→ Check key, network, status page

## Next Steps

1. **Read the full guide**: `AI_PREDICTION_GUIDE.md`
2. **Check API reference**: `API_REFERENCE.md`
3. **Monitor costs**: OpenAI dashboard
4. **Explore**: Try with different log types
5. **Integrate**: Add to your CI/CD pipeline

## File Structure

```
backend/
  src/
    services/
      aiAnalysisService.js ← AI integration
    models/
      LogAnalysis.js ← Database schema
    routes/
      analyzeRoutes.js ← API endpoints
    utils/
      logPreprocessor.js ← Already created
  .env ← Add OPENAI_API_KEY here

frontend/
  src/
    components/
      LogAnalysisForm.jsx ← Form component
      AnalysisPrediction.jsx ← Results display
    pages/
      Dashboard.jsx ← Integrated here
```

## Testing Checklist

- [ ] Backend server running (port 5000)
- [ ] Frontend server running (port 5173)
- [ ] Logged in to dashboard
- [ ] See "Log Analysis for Failure Prediction" section
- [ ] Can paste logs in textarea
- [ ] Submit button works
- [ ] Get results back in 1-4 seconds
- [ ] Can download report as JSON
- [ ] Can view analysis history

## Support

- **Questions?** Check `AI_PREDICTION_GUIDE.md`
- **API details?** See `API_REFERENCE.md`
- **Stuck?** Review troubleshooting section

## That's It! 🎉

You now have an AI-powered failure prediction system integrated into your DevOps Dashboard!

### What to do now:
1. Add your OpenAI API key
2. Start both servers
3. Go to dashboard and try it out
4. Watch the magic happen! ✨
