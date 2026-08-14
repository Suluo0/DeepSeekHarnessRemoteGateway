$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $PSScriptRoot

try {
  $node = Get-Command node -ErrorAction Stop
} catch {
  Write-Host "[remote-gateway:start] Node.js 22+ was not found in PATH."
  Write-Host "[remote-gateway:start] Install Node.js, then run this script again."
  Read-Host "Press Enter to exit"
  exit 1
}

& $node.Source "scripts/start.js"
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
  Write-Host ""
  Write-Host "[remote-gateway:start] Startup failed. Review the messages above."
  Read-Host "Press Enter to exit"
}

exit $exitCode
