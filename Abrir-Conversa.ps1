$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$dataDir = Join-Path $projectRoot '.data'
function Test-Conversa {
  try { $null = Invoke-WebRequest 'http://127.0.0.1:4318/healthz' -TimeoutSec 2 -UseBasicParsing; return $true } catch { return $false }
}
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
if (Test-Conversa) {
  # A running server belongs to this folder only if its lock file is here; otherwise it is another copy or an older version.
  if (-not (Test-Path -LiteralPath (Join-Path $dataDir 'server.lock'))) {
    Write-Host 'Ya hay otro Conversa abierto en este equipo (puerto 4318), de otra carpeta o de una versión anterior.'
    Write-Host 'Ciérralo o reinicia el equipo, y vuelve a abrir este archivo.'
    Read-Host 'Pulsa Enter para salir' | Out-Null
    exit 1
  }
} else {
  $nodePath = (Get-Command node).Source
  Start-Process -FilePath $nodePath -ArgumentList 'src/server.mjs' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dataDir 'server.log') -RedirectStandardError (Join-Path $dataDir 'server-error.log')
  $ready = $false
  for ($i = 0; $i -lt 20 -and -not $ready; $i++) { Start-Sleep -Seconds 1; $ready = Test-Conversa }
  if (-not $ready) {
    Write-Host 'Conversa no arrancó. Últimas líneas de .data\server-error.log:'
    Get-Content -LiteralPath (Join-Path $dataDir 'server-error.log') -Tail 15 -ErrorAction SilentlyContinue
    Write-Host 'Comprueba que ejecutaste npm ci en esta carpeta y que tienes Node.js 24 o posterior.'
    Read-Host 'Pulsa Enter para salir' | Out-Null
    exit 1
  }
}
$accessToken = (Get-Content -LiteralPath (Join-Path $dataDir 'owner-token') -Raw).Trim()
Start-Process ('http://127.0.0.1:4318/#access=' + $accessToken)
