[CmdletBinding()]
param(
  [string]$ApiProxyTarget = "https://vinaris.app"
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$frontendDirectory = Join-Path $repositoryRoot "frontend"
$nodeDirectory = "C:\ERI\node"
$npmCommand = Join-Path $nodeDirectory "npm.cmd"

if (-not (Test-Path -LiteralPath $npmCommand)) {
  throw "npm non trovato in $npmCommand. Aggiorna il percorso Node nello script."
}

if (-not (Test-Path -LiteralPath $frontendDirectory)) {
  throw "Cartella frontend non trovata: $frontendDirectory"
}

$env:PATH = "$nodeDirectory;$env:PATH"
$env:VITE_API_PROXY_TARGET = $ApiProxyTarget

Push-Location $frontendDirectory
try {
  if (-not (Test-Path -LiteralPath (Join-Path $frontendDirectory "node_modules"))) {
    Write-Host "Dipendenze frontend mancanti: eseguo npm install..." -ForegroundColor Yellow
    & $npmCommand install
    if ($LASTEXITCODE -ne 0) { throw "npm install non riuscito (codice $LASTEXITCODE)." }
  }

  Write-Host "Frontend locale: http://localhost:5173" -ForegroundColor Green
  Write-Host "API proxy: $ApiProxyTarget" -ForegroundColor Cyan
  Write-Host "Attenzione: accesso e dati sono quelli di produzione. Evita modifiche reali durante i test." -ForegroundColor Yellow
  Write-Host "Per fermare il server premi Ctrl+C." -ForegroundColor DarkGray

  & $npmCommand run dev
  if ($LASTEXITCODE -ne 0) { throw "Il server frontend si è chiuso con codice $LASTEXITCODE." }
}
finally {
  Pop-Location
}
