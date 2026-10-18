$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$nodeDir = Join-Path $root ".tools\node-v24.22.0-win-x64"
$env:Path = "$nodeDir;$env:Path"
Set-Location $root

$apiLog = Join-Path $root "api-server.log"
$apiErrorLog = Join-Path $root "api-server-error.log"
$webLog = Join-Path $root "web-server.log"
$webErrorLog = Join-Path $root "web-server-error.log"

Start-Process -FilePath (Join-Path $nodeDir "node.exe") `
  -ArgumentList @("dist-server/server/index.js") `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $apiLog `
  -RedirectStandardError $apiErrorLog

Start-Process -FilePath (Join-Path $nodeDir "npm.cmd") `
  -ArgumentList @("run", "dev:web") `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $webLog `
  -RedirectStandardError $webErrorLog
