$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$dataDir = Join-Path $projectRoot '.data'
$onWindows = $env:OS -eq 'Windows_NT'
function Test-Conversa {
  try { $null = Invoke-WebRequest 'http://127.0.0.1:4318/healthz' -TimeoutSec 2 -UseBasicParsing; return $true } catch { return $false }
}
function Stop-WithMessage([string[]]$lines) {
  foreach ($line in $lines) { Write-Host $line }
  Read-Host 'Pulsa Enter para salir' | Out-Null
  exit 1
}
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
if (Test-Conversa) {
  # A running server belongs to this folder only if its lock file is here; otherwise it is another copy or an older version.
  if (-not (Test-Path -LiteralPath (Join-Path $dataDir 'server.lock'))) {
    Stop-WithMessage @('Ya hay otro Conversa abierto en este equipo (puerto 4318), de otra carpeta o de una versión anterior.', 'Ciérralo o reinicia el equipo, y vuelve a abrir este archivo.')
  }
} else {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if (-not $node) {
    Write-Host 'Conversa necesita Node.js 24 o posterior y no está instalado.'
    if ($onWindows -and (Get-Command winget -ErrorAction SilentlyContinue) -and ((Read-Host '¿Instalarlo ahora? (S/N)') -match '^[sS]')) {
      winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
      Stop-WithMessage @('Cuando termine la instalación, cierra esta ventana y vuelve a abrir Abrir-Conversa.cmd.')
    }
    Stop-WithMessage @('Instálalo desde https://nodejs.org (versión LTS) y vuelve a abrir este archivo.')
  }
  $major = [int](& $node.Source -p "process.versions.node.split('.')[0]")
  if ($major -lt 24) { Stop-WithMessage @("Tienes Node.js $major y Conversa necesita la versión 24 o posterior.", 'Actualízalo desde https://nodejs.org (versión LTS) y vuelve a abrir este archivo.') }
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    Write-Host 'Instalando lo necesario. Solo la primera vez; puede tardar un minuto...'
    $npm = if ($onWindows) { 'npm.cmd' } else { 'npm' }
    Push-Location $projectRoot
    try { & $npm ci --no-audit --no-fund } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Stop-WithMessage @('No se pudo completar la instalación. Revisa tu conexión a internet y vuelve a intentarlo.') }
  }
  $start = @{ FilePath = $node.Source; ArgumentList = 'src/server.mjs'; WorkingDirectory = $projectRoot; RedirectStandardOutput = (Join-Path $dataDir 'server.log'); RedirectStandardError = (Join-Path $dataDir 'server-error.log') }
  if ($onWindows) { $start.WindowStyle = 'Hidden' }
  Start-Process @start
  $ready = $false
  for ($i = 0; $i -lt 20 -and -not $ready; $i++) { Start-Sleep -Seconds 1; $ready = Test-Conversa }
  if (-not $ready) {
    Write-Host 'Conversa no arrancó. Últimas líneas de .data\server-error.log:'
    Get-Content -LiteralPath (Join-Path $dataDir 'server-error.log') -Tail 15 -ErrorAction SilentlyContinue
    Stop-WithMessage @('Si el error no es claro, envía esas líneas a quien te ayuda con Conversa: no contienen mensajes ni códigos.')
  }
}
$accessToken = (Get-Content -LiteralPath (Join-Path $dataDir 'owner-token') -Raw).Trim()
# The access link carries the private code: never print it, even if the browser cannot be opened.
try { Start-Process ('http://127.0.0.1:4318/#access=' + $accessToken) } catch {
  Stop-WithMessage @('Conversa está abierto, pero no se pudo abrir el navegador.', 'Abre http://127.0.0.1:4318 y escribe el código privado guardado en .data\owner-token.')
}
