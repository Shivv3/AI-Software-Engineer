$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $PSScriptRoot
$PidDir = Join-Path $Root ".run"

if (-not (Test-Path $PidDir)) {
  Write-Host "No .run directory found. Nothing to stop."
  exit 0
}

Get-ChildItem -Path $PidDir -Filter "*.pid" | ForEach-Object {
  $Name = $_.BaseName
  $PidValue = Get-Content $_.FullName -ErrorAction SilentlyContinue
  if ($PidValue) {
    $Proc = Get-Process -Id ([int]$PidValue) -ErrorAction SilentlyContinue
    if ($Proc) {
      Stop-Process -Id $Proc.Id -Force
      Write-Host "Stopped $Name (PID $PidValue)"
    } else {
      Write-Host "$Name was not running."
    }
  }
  Remove-Item $_.FullName -Force
}

Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq 'node.exe' -and
    $_.CommandLine -match 'server\.js' -and
    $_.CommandLine -match [regex]::Escape((Join-Path $Root 'backend'))
  } |
  ForEach-Object {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped backend node process (PID $($_.ProcessId))"
  }
