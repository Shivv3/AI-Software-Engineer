param(
  [string]$BaseUrl = "http://127.0.0.1:4000",
  [string]$MlUrl = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
$CookieJar = Join-Path $PSScriptRoot "..\.run\backend-smoke.cookies.txt"
New-Item -ItemType Directory -Force -Path (Split-Path $CookieJar) | Out-Null
if (Test-Path $CookieJar) {
  Remove-Item $CookieJar -Force
}

function Invoke-Smoke {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Url,
    [object]$Body = $null,
    [int[]]$Accept = @(200),
    [switch]$UseCookie
  )

  $CurlArgs = @("-s", "-w", "`n%{http_code}", "-X", $Method, $Url)
  if ($UseCookie) {
    $CurlArgs += @("-b", $CookieJar, "-c", $CookieJar)
  }
  if ($null -ne $Body) {
    $Json = $Body | ConvertTo-Json -Depth 20 -Compress
    $BodyFile = [System.IO.Path]::GetTempFileName()
    Set-Content -LiteralPath $BodyFile -Value $Json -Encoding UTF8
    $CurlArgs += @("-H", "Content-Type: application/json", "--data-binary", "@$BodyFile")
  }

  try {
    $Raw = & curl.exe @CurlArgs
  } finally {
    if ($BodyFile -and (Test-Path $BodyFile)) {
      Remove-Item -LiteralPath $BodyFile -Force
    }
  }
  $Lines = @($Raw)
  $Status = [int]$Lines[-1]
  $Payload = ($Lines[0..($Lines.Count - 2)] -join "`n")

  if ($Accept -notcontains $Status) {
    throw "[$Name] expected HTTP $($Accept -join '/') but got $Status. Body: $Payload"
  }

  Write-Host "PASS $Name ($Status)"
  if ($Payload) {
    try {
      return $Payload | ConvertFrom-Json
    } catch {
      return $Payload
    }
  }
  return $null
}

Write-Host "Checking ML service..."
Invoke-Smoke -Name "ml health" -Method GET -Url "$MlUrl/health" | Out-Null

$Suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$Register = Invoke-Smoke -Name "auth register" -Method POST -Url "$BaseUrl/api/auth/register" -UseCookie -Body @{
  name = "Smoke Tester"
  email = "smoke-$Suffix@example.com"
  user_id = "smoke_$Suffix"
  password = "password123"
}

Invoke-Smoke -Name "auth me" -Method GET -Url "$BaseUrl/api/auth/me" -UseCookie | Out-Null

$Project = Invoke-Smoke -Name "project create" -Method POST -Url "$BaseUrl/api/project" -UseCookie -Body @{
  title = "Smoke Project $Suffix"
  project_text = "A test project for API smoke coverage."
}
$ProjectId = $Project.id

Invoke-Smoke -Name "projects list" -Method GET -Url "$BaseUrl/api/projects" -UseCookie | Out-Null
Invoke-Smoke -Name "project get" -Method GET -Url "$BaseUrl/api/project/$ProjectId" -UseCookie | Out-Null
Invoke-Smoke -Name "sdlc recommend validation" -Method POST -Url "$BaseUrl/api/sdlc/recommend" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "plan generate validation" -Method POST -Url "$BaseUrl/api/plan/generate" -UseCookie -Accept @(400) -Body @{} | Out-Null

$SrsText = "The system shall authenticate users within 2 seconds.`nThe system should be fast.`nThe system shall allow guest checkout.`nThe system shall not allow guest checkout."
$Doc = Invoke-Smoke -Name "document create" -Method POST -Url "$BaseUrl/api/projects/$ProjectId/documents" -UseCookie -Accept @(201) -Body @{
  name = "Smoke SRS"
  type = "SRS"
  mime = "text/plain"
  content = $SrsText
  useAsContext = $true
}

Invoke-Smoke -Name "documents list" -Method GET -Url "$BaseUrl/api/projects/$ProjectId/documents" -UseCookie | Out-Null
Invoke-Smoke -Name "document patch" -Method PATCH -Url "$BaseUrl/api/projects/$ProjectId/documents/$($Doc.id)" -UseCookie -Body @{
  useAsContext = $true
} | Out-Null

Invoke-Smoke -Name "requirements sync" -Method POST -Url "$BaseUrl/api/projects/$ProjectId/requirements/sync" -UseCookie -Body @{
  text = $SrsText
  section = "smoke"
} | Out-Null
Invoke-Smoke -Name "project health" -Method GET -Url "$BaseUrl/api/projects/$ProjectId/health" -UseCookie | Out-Null
Invoke-Smoke -Name "project traceability" -Method GET -Url "$BaseUrl/api/projects/$ProjectId/traceability" -UseCookie | Out-Null

Invoke-Smoke -Name "ml requirements analyze" -Method POST -Url "$BaseUrl/api/ml/requirements/analyze" -UseCookie -Body @{
  project_id = $ProjectId
  requirements = @(
    "The system should be fast.",
    "The user shall authenticate within 2 seconds."
  )
} | Out-Null

Invoke-Smoke -Name "ml conflict detect" -Method POST -Url "$BaseUrl/api/ml/conflict/detect" -UseCookie -Body @{
  project_id = $ProjectId
  requirements = @(
    "The system shall allow guest checkout.",
    "The system shall not allow guest checkout."
  )
} | Out-Null

Invoke-Smoke -Name "ml defect predict" -Method POST -Url "$BaseUrl/api/ml/defect/predict" -UseCookie -Body @{
  language = "JavaScript"
  code = "function risky(x){ if(x){ for(let i=0;i<x;i++){ if(i%2){ console.log(i) } } } return x }"
} | Out-Null

Invoke-Smoke -Name "ml traceability analyze" -Method POST -Url "$BaseUrl/api/ml/traceability/analyze" -UseCookie -Body @{
  requirements = @("The system shall authenticate users.")
  code_functions = @(@{
    name = "authenticateUser"
    signature = "function authenticateUser(token)"
    docstring = "Authenticates users with a token"
  })
} | Out-Null

Invoke-Smoke -Name "ai rag answer no key or answer" -Method POST -Url "$BaseUrl/api/ai/rag/answer" -UseCookie -Accept @(200, 503) -Body @{
  project_id = $ProjectId
  question = "Which requirement mentions authentication?"
} | Out-Null

Invoke-Smoke -Name "code generate validation" -Method POST -Url "$BaseUrl/api/code/generate" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "code translate validation" -Method POST -Url "$BaseUrl/api/code/translate" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "code test validation" -Method POST -Url "$BaseUrl/api/code/test" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "code review validation" -Method POST -Url "$BaseUrl/api/code/review" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "design system validation" -Method POST -Url "$BaseUrl/api/design/system" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "design schema validation" -Method POST -Url "$BaseUrl/api/design/schema" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "design export validation" -Method POST -Url "$BaseUrl/api/design/export" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "design diagram validation" -Method POST -Url "$BaseUrl/api/design/diagram" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "documents extract validation" -Method POST -Url "$BaseUrl/api/documents/extract-text" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "srs edit validation" -Method POST -Url "$BaseUrl/api/srs/edit" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "srs apply validation" -Method POST -Url "$BaseUrl/api/srs/apply" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "srs generate questions validation" -Method POST -Url "$BaseUrl/api/srs/generate-questions" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "srs generate content validation" -Method POST -Url "$BaseUrl/api/srs/generate-content" -UseCookie -Accept @(400) -Body @{} | Out-Null
Invoke-Smoke -Name "srs sections list" -Method GET -Url "$BaseUrl/api/srs/sections/$ProjectId" -UseCookie | Out-Null
Invoke-Smoke -Name "srs status" -Method GET -Url "$BaseUrl/api/srs/status/$ProjectId" -UseCookie | Out-Null
Invoke-Smoke -Name "project versions" -Method GET -Url "$BaseUrl/api/project/$ProjectId/versions" -UseCookie | Out-Null
Invoke-Smoke -Name "ai decompose validation" -Method POST -Url "$BaseUrl/api/ai/requirements/decompose" -UseCookie -Accept @(422) -Body @{} | Out-Null
Invoke-Smoke -Name "ai adversarial validation" -Method POST -Url "$BaseUrl/api/ai/requirements/adversarial" -UseCookie -Accept @(422) -Body @{} | Out-Null

Invoke-Smoke -Name "document delete" -Method DELETE -Url "$BaseUrl/api/projects/$ProjectId/documents/$($Doc.id)" -UseCookie | Out-Null
Invoke-Smoke -Name "project delete" -Method DELETE -Url "$BaseUrl/api/project/$ProjectId" -UseCookie | Out-Null
Invoke-Smoke -Name "auth logout" -Method POST -Url "$BaseUrl/api/auth/logout" -UseCookie | Out-Null

Write-Host "Backend smoke suite completed."
