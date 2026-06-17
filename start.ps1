# iOcean Dashboard — Startup Script (PowerShell)
# Run this from the root of the project directory

Write-Host "=== iOcean Water Quality Dashboard ===" -ForegroundColor Cyan

# 1. Install Python dependencies
Write-Host "`n[1/3] Installing Python backend dependencies..." -ForegroundColor Yellow
Set-Location backend
pip install -r requirements.txt
Set-Location ..

# 2. Start Flask backend in background
Write-Host "`n[2/3] Starting Flask backend on port 5000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PWD\backend'; python app.py"

# Give Flask a moment to start
Start-Sleep -Seconds 2

# 3. Start Vite dev server
Write-Host "`n[3/3] Starting Vite frontend dev server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PWD\frontend'; npm run dev"

Write-Host "`n✓ Both servers started!" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend:  http://localhost:5000" -ForegroundColor Cyan
