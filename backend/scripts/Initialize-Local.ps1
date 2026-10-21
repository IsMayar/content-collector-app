$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $backendRoot '.env'
if (Test-Path -LiteralPath $envPath) {
    Write-Output 'Existing backend/.env preserved.'
    return
}
$passwordBytes = New-Object byte[] 32
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($passwordBytes) } finally { $random.Dispose() }
$localPassword = [BitConverter]::ToString($passwordBytes).Replace('-', '').ToLowerInvariant()
$content = @"
DATABASE_URL=jdbc:postgresql://127.0.0.1:5433/collector_dev
DATABASE_USERNAME=collector_dev
DATABASE_PASSWORD=$localPassword
SERVER_PORT=8080
"@
[System.IO.File]::WriteAllText($envPath, $content + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Created ignored backend/.env with a random local-only database password.'
