$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$nodePath = (Get-Command node).Source
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot '.data') | Out-Null
try { $null = Invoke-WebRequest 'http://127.0.0.1:4318/' -TimeoutSec 2 -UseBasicParsing } catch {
  Start-Process -FilePath $nodePath -ArgumentList 'src/server.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot '.data/server.log') -RedirectStandardError (Join-Path $projectRoot '.data/server-error.log')
  Start-Sleep -Seconds 2
}
$accessToken = (Get-Content -LiteralPath (Join-Path $projectRoot '.data/owner-token') -Raw).Trim()
Start-Process ('http://127.0.0.1:4318/#access=' + $accessToken)
