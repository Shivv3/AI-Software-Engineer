param(
  [switch]$SkipInstall,
  [switch]$SkipModelDownload,
  [switch]$SkipDefectTraining
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$PidDir = Join-Path $Root ".run"
New-Item -ItemType Directory -Force -Path $PidDir | Out-Null

function Start-ServiceProcess {
  param(
    [string]$Name,
    [string]$WorkingDirectory,
    [string]$Command,
    [string]$Arguments
  )

  $OutLog = Join-Path $PidDir "$Name.out.log"
  $ErrLog = Join-Path $PidDir "$Name.err.log"
  $Process = Start-Process -FilePath $Command `
    -ArgumentList $Arguments `
    -WorkingDirectory $WorkingDirectory `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru `
    -WindowStyle Hidden

  $Process.Id | Set-Content -Path (Join-Path $PidDir "$Name.pid")
  Write-Host "$Name started on PID $($Process.Id). Logs: $OutLog / $ErrLog"
}

if (-not (Test-Path (Join-Path $Root ".env"))) {
  Copy-Item (Join-Path $Root ".env.example") (Join-Path $Root ".env")
  Write-Host "Created .env from .env.example. Add GEMINI_API_KEY or GROQ_API_KEY for AI generation routes."
}

if (-not $SkipInstall) {
  Write-Host "Installing Node dependencies..."
  npm --prefix (Join-Path $Root "backend") install
  npm --prefix (Join-Path $Root "frontend") install
}

$Venv = Join-Path $Root "ml-service\.venv"
$PythonExe = Join-Path $Venv "Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
  Write-Host "Creating Python virtual environment..."
  python -m venv $Venv
}

Write-Host "Installing Python dependencies..."
& $PythonExe -m pip install --upgrade pip
& $PythonExe -m pip install -r (Join-Path $Root "ml-service\requirements.txt")

if (-not $SkipModelDownload) {
  Write-Host "Preparing spaCy and SBERT models..."
  Push-Location (Join-Path $Root "ml-service")
  & $PythonExe -c "import spacy; spacy.load('en_core_web_sm'); print('spaCy model already installed')"
  if ($LASTEXITCODE -ne 0) {
    & $PythonExe -m spacy download en_core_web_sm
  }
  & $PythonExe -c "from pathlib import Path; from sentence_transformers import SentenceTransformer; cache=Path('model_cache'); cache.mkdir(exist_ok=True); SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2', cache_folder=str(cache)); print('SBERT all-MiniLM-L6-v2 ready')"
  Pop-Location
}

$ModelPath = Join-Path $Root "ml-service\models\defect_rf_v1.joblib"
if (-not $SkipDefectTraining -and -not (Test-Path $ModelPath)) {
  Write-Host "Training defect predictor..."
  Push-Location (Join-Path $Root "ml-service")
  & $PythonExe "train_defect_model.py"
  Pop-Location
}

Start-ServiceProcess -Name "ml-service" -WorkingDirectory (Join-Path $Root "ml-service") -Command $PythonExe -Arguments "-m uvicorn main:app --host 127.0.0.1 --port 8000"
Start-ServiceProcess -Name "backend" -WorkingDirectory (Join-Path $Root "backend") -Command "node.exe" -Arguments "server.js"

Write-Host "Starting frontend in the foreground..."
Write-Host "Open http://localhost:5173 after Vite prints the local URL."
npm --prefix (Join-Path $Root "frontend") run dev
