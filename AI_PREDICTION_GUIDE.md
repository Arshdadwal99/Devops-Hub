# AI-Based Failure Prediction System

A comprehensive guide to using the AI-powered log analysis and failure prediction system in PulseOps Dashboard.

## Overview

The AI-Based Failure Prediction System analyzes CI/CD logs using OpenAI's GPT-4 model to:
- **Predict failure probability** (0-100%)
- **Classify severity** (Low, Medium, High, Critical)
- **Identify root causes** with detailed explanations
- **Suggest actionable fixes** to prevent future failures
- **Provide confidence scores** for the analysis

## Features

### 🤖 AI Analysis
- **Real-time Processing**: Instant analysis of CI/CD logs
- **Smart Preprocessing**: Extracts key information (errors, warnings, failures, timeouts, test results)
- **Security Sanitization**: Removes passwords, API keys, tokens before sending to AI
- **Fallback Analysis**: Heuristic-based analysis when AI service is unavailable

### 📊 Structured Output
```json
{
  "failure_probability": 85,
  "severity": "High",
  "root_cause": "Test suite failures in integration tests",
  "explanation": "Detailed analysis of what went wrong...",
  "suggested_fixes": [
    "Fix failing database migration",
    "Update test fixtures",
    "Increase test timeout values"
  ],
  "affected_stage": "test",
  "confidence": 92
}
```

### 💾 History Tracking
- Save all analyses to MongoDB
- Access previous analyses
- Track failure patterns over time
- Compare multiple pipeline runs

## Setup

### 1. Get OpenAI API Key

1. Visit [OpenAI Platform](https://platform.openai.com/account/api-keys)
2. Sign in or create an account
3. Generate a new API key
4. Copy the key securely

### 2. Configure Environment

Add your API key to `backend/.env`:

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
```

**Important**: Never commit your API key to version control!

### 3. Usage Limits

OpenAI API charges are based on token usage:
- GPT-4 Turbo: ~$0.01 per 1K input tokens, ~$0.03 per 1K output tokens
- Recommended: Set monthly spending limit in OpenAI dashboard

## API Endpoints

### Analyze Logs (Protected)

**POST** `/api/analyze-logs`

Analyzes CI/CD logs and returns failure predictions.

**Request**:
```json
{
  "logs": "full CI/CD log output...",
  "pipelineId": "deploy-prod"
}
```

**Response**:
```json
{
  "success": true,
  "analysis": {
    "failure_probability": 45,
    "severity": "Medium",
    "root_cause": "Memory leak in service",
    "explanation": "...",
    "suggested_fixes": ["...", "..."],
    "affected_stage": "deploy",
    "confidence": 78
  },
  "metadata": {
    "processingTime": 2341,
    "usedFallback": false,
    "timestamp": "2024-01-15T10:30:00Z",
    "analysisId": "507f1f77bcf86cd799439011"
  }
}
```

**Error Response**:
```json
{
  "error": "Analysis failed",
  "message": "Invalid request or API error"
}
```

### Get Analysis History (Protected)

**GET** `/api/analyze-logs/history?limit=10&skip=0`

Retrieves user's previous analyses.

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "userId": "507f191e810c19729de860ea",
      "pipelineId": "deploy-prod",
      "analysis": {...},
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 10,
    "skip": 0
  }
}
```

### Get Specific Analysis (Protected)

**GET** `/api/analyze-logs/:id`

Retrieves a specific analysis by ID.

**Response**:
```json
{
  "success": true,
  "data": {...}
}
```

## Frontend Integration

### LogAnalysisForm Component

The main component for log submission and analysis display.

**Location**: `frontend/src/components/LogAnalysisForm.jsx`

**Features**:
- Log input textarea with 1MB size limit
- Optional pipeline ID field
- Real-time error handling
- Download analysis reports as JSON
- Submit and reset functionality

**Usage**:
```jsx
import LogAnalysisForm from '../components/LogAnalysisForm';

export default function MyComponent() {
  return <LogAnalysisForm />;
}
```

### AnalysisPrediction Component

Displays structured analysis results with interactive UI.

**Location**: `frontend/src/components/AnalysisPrediction.jsx`

**Features**:
- Animated failure probability progress bar
- Color-coded severity badges
- Expandable suggested fixes
- Confidence score visualization
- Metadata display

**Props**:
```jsx
<AnalysisPrediction 
  analysis={{
    failure_probability: 75,
    severity: "High",
    root_cause: "...",
    explanation: "...",
    suggested_fixes: [...],
    affected_stage: "test",
    confidence: 85
  }}
  loading={false}
/>
```

## Log Preprocessing

### What Gets Extracted

The system automatically extracts the most important 50 lines from logs using 24 regex patterns:

- **Error keywords**: "error", "exception", "failed", "fatal", etc.
- **Warning indicators**: "warning", "warn", "deprecated", etc.
- **Test failures**: "test failed", "assertion error", etc.
- **Timeouts**: "timeout", "timed out", etc.
- **Build issues**: "build failed", "compilation error", etc.
- **Dependency problems**: "dependency", "module not found", etc.

### What Gets Removed (Security)

Before sending to OpenAI, these are sanitized:
- Password patterns: `password=`, `passwd=`, `pwd=`
- API keys: Various API key formats
- Tokens: Bearer tokens, JWT tokens, etc.
- Secrets: AWS keys, database credentials, etc.

**Example**:
```
Input:  "Error: Failed to connect to mongodb://user:pass123@db:27017"
Output: "Error: Failed to connect to mongodb://***:***@db:27017"
```

## Usage Examples

### Example 1: Analyzing Build Failures

```javascript
const logs = `
[INFO] Building application...
[ERROR] Compilation failed: syntax error at line 42
[ERROR] File: src/components/Button.jsx
[WARNING] Unused import at line 10
[ERROR] Build process terminated with exit code 1
`;

// Submit via form, get response:
{
  "failure_probability": 95,
  "severity": "Critical",
  "root_cause": "Syntax error in Button component",
  "explanation": "A JavaScript syntax error prevents compilation...",
  "suggested_fixes": [
    "Fix syntax error in Button.jsx line 42",
    "Remove unused imports",
    "Run linter before committing"
  ],
  "affected_stage": "build",
  "confidence": 98
}
```

### Example 2: Analyzing Test Failures

```javascript
const logs = `
[INFO] Running test suite...
[FAIL] Integration tests failed
[INFO] Expected 5 tests, 2 failed
[ERROR] Test 'API endpoint' timed out after 5000ms
[ERROR] Test 'Database connection' failed: Connection refused
[INFO] Retry attempt 1/3...
[SUCCESS] Final result: 2 failures, 3 passed
`;

// Response:
{
  "failure_probability": 78,
  "severity": "High",
  "root_cause": "Timeout in API endpoint test and database connection issues",
  "explanation": "Two critical tests are failing due to timeout and connection issues...",
  "suggested_fixes": [
    "Increase test timeout to 10000ms",
    "Start database service before running tests",
    "Check database credentials",
    "Verify network connectivity"
  ],
  "affected_stage": "test",
  "confidence": 89
}
```

### Example 3: Analyzing Deployment Issues

```javascript
const logs = `
[INFO] Starting deployment to production...
[INFO] Pulling latest image...
[ERROR] Failed to pull image: connection timeout
[WARNING] Retrying pull operation (attempt 1/3)
[ERROR] Failed again: network unreachable
[ERROR] Deployment failed: unable to pull container image
[INFO] Rollback initiated
[SUCCESS] Rolled back to previous version v1.2.3
`;

// Response:
{
  "failure_probability": 88,
  "severity": "Critical",
  "root_cause": "Network connectivity issue preventing Docker image pull",
  "explanation": "The deployment process cannot download the container image...",
  "suggested_fixes": [
    "Check network connectivity to container registry",
    "Verify Docker registry credentials",
    "Check firewall rules",
    "Verify container image exists in registry",
    "Implement retry logic with exponential backoff"
  ],
  "affected_stage": "deploy",
  "confidence": 94
}
```

## Database Schema

### LogAnalysis Model

```javascript
{
  userId: ObjectId,                    // User who initiated analysis
  pipelineId: String,                  // Pipeline identifier
  originalLogs: String,                // First 100KB of logs
  logMetrics: {
    errorCount: Number,
    warningCount: Number,
    failureCount: Number,
    timeoutCount: Number,
    testCount: Number,
    totalLines: Number
  },
  analysis: {
    failure_probability: Number,       // 0-100
    severity: String,                  // Low/Medium/High/Critical
    root_cause: String,
    explanation: String,
    suggested_fixes: [String],
    affected_stage: String,            // build/test/deploy/integration
    confidence: Number                 // 0-100
  },
  aiModel: String,                     // "gpt-4-turbo-preview"
  usedFallback: Boolean,               // If AI unavailable
  processingTime: Number,              // milliseconds
  status: String,                      // pending/completed/failed
  errorMessage: String,                // If status is failed
  createdAt: Date,
  updatedAt: Date
}
```

## Fallback Analysis

If OpenAI API is unavailable or reaches rate limits, the system uses heuristic analysis:

1. **Counts** log patterns (errors, warnings, failures, timeouts)
2. **Calculates** failure probability: `(issues / 10) * 100`
3. **Classifies** severity based on probability
4. **Provides** generic but useful suggestions

**Note**: Fallback analysis has lower confidence (60%) than AI analysis (75-98%).

## Best Practices

### 1. Optimize Logs for Analysis

✅ **Good**:
```
[ERROR] Database connection failed: Connection refused
[ERROR] Stack trace: at connectDB() in db.js:42
[ERROR] Root cause: MongoDB service not running
```

❌ **Bad**:
```
Error at line 12343
Stack trace... (1000+ lines)
```

### 2. Include Complete Context

- Timestamps
- Service/component names
- Error messages
- Stack traces
- Related warnings

### 3. Frequency Recommendations

- **Production failures**: Immediate analysis
- **Test failures**: After test runs (CI/CD)
- **Build errors**: After compilation attempts
- **Post-mortem**: Analyze historical logs

### 4. Cost Optimization

- Preprocess logs to remove verbose output
- Analyze only recent, relevant lines
- Use pagination for large datasets
- Monitor API usage in OpenAI dashboard

## Troubleshooting

### Issue: "OPENAI_API_KEY not set"

**Solution**: Add API key to `.env`:
```env
OPENAI_API_KEY=sk-your-key-here
```

### Issue: "Failed to analyze logs"

**Possible causes**:
1. API key is invalid or expired
2. Rate limit exceeded
3. Network connectivity issue
4. Logs exceed 1MB limit

**Solution**: 
- Verify API key
- Wait and retry
- Check network
- Split logs into smaller chunks

### Issue: Fallback analysis is being used

**Indicates**: OpenAI API is unavailable

**Solution**:
1. Check API key
2. Check OpenAI service status
3. Verify network connectivity
4. Check rate limits in OpenAI dashboard

### Issue: "Very high" confidence for unexpected results

**Consider**:
- Logs might be incomplete
- Edge cases not covered by patterns
- Manual review recommended

## Performance Metrics

### Processing Times
- **Preprocessing**: 10-50ms
- **AI Analysis**: 1000-3000ms
- **Database Save**: 50-200ms
- **Total**: ~1-4 seconds

### API Costs (GPT-4 Turbo)
- **Per analysis**: ~$0.02-0.05
- **1000 analyses**: ~$20-50
- **Monthly budget**: Recommend $100-200

## Advanced Configuration

### Custom System Prompt

Edit `backend/src/services/aiAnalysisService.js`:

```javascript
const systemPrompt = `
You are an expert DevOps AI assistant...
// Customize instructions here
`;
```

### Model Switching

Change in `aiAnalysisService.js`:
```javascript
model: "gpt-3.5-turbo"  // Cheaper, faster
model: "gpt-4"          // More expensive, more accurate
```

## Security Considerations

1. **API Key**: Never commit to version control
2. **Log Sanitization**: Always enabled before sending to AI
3. **User Isolation**: Each user can only see their own analyses
4. **Rate Limiting**: Implement per-user limits (optional)
5. **Audit Logging**: Track who analyzed what logs

## Monitoring & Maintenance

### Regular Tasks

- [ ] Monitor OpenAI API costs
- [ ] Check error rates in MongoDB logs
- [ ] Review user feedback
- [ ] Update preprocessing patterns if needed
- [ ] Test fallback analysis regularly

### Metrics to Track

- Average processing time
- Success/failure rates
- Confidence scores over time
- Most common failure types
- AI model accuracy vs fallback

## Support & Documentation

- **API Reference**: `API_REFERENCE.md`
- **Quick Start**: `QUICK_START.md`
- **Authentication**: `AUTHENTICATION.md`
- **General Docs**: `INDEX.md`

## Future Enhancements

- [ ] Custom model fine-tuning with pipeline data
- [ ] Real-time streaming log analysis
- [ ] Webhook integration for automatic analysis
- [ ] ML-based pattern recognition
- [ ] Comparative analysis across pipelines
- [ ] Predictive maintenance scheduling
