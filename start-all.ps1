# Start both backend and frontend simultaneously

Write-Host "Starting DevOps Dashboard..." -ForegroundColor Green

# Terminal 1: Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'c:\Users\Arsh dadwal\Desktop\devops dashboard\backend'; npm run dev"

# Wait 3 seconds for backend to start
Start-Sleep -Seconds 3

# Terminal 2: Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd 'c:\Users\Arsh dadwal\Desktop\devops dashboard\frontend'; npm run dev"

Write-Host "✅ Backend and Frontend started!" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "Backend: http://localhost:5000" -ForegroundColor Cyan
