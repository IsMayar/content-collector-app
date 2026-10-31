$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $backendRoot '.env'
if (!(Test-Path -LiteralPath $envFile)) { throw 'Run Initialize-Local.ps1 first.' }
$properties = @{}
foreach ($line in [System.IO.File]::ReadAllLines($envFile)) {
    if ($line -match '^([A-Za-z_][A-Za-z_0-9]*)=(.*)$') { $properties[$Matches[1]] = $Matches[2] }
}
function New-PrivateKey {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
$defaults = @{
    PRIVATE_STORAGE_ENABLED='false'; PRIVATE_STORAGE_WORKER_ENABLED='false'
    S3_ENDPOINT='http://127.0.0.1:8333'; S3_PUBLIC_ENDPOINT='http://127.0.0.1:8333'
    S3_REGION='us-east-1'; S3_BUCKET_STAGING='collector-staging'; S3_BUCKET_PRIVATE='collector-private'
    S3_ACCESS_KEY=(New-PrivateKey); S3_SECRET_KEY=(New-PrivateKey)
    CLAMAV_HOST='127.0.0.1'; CLAMAV_PORT='13310'; IMAGE_WORKER_IMAGE='collector-image-worker:t16'
}
foreach ($key in $defaults.Keys) {
    if (!$properties.ContainsKey($key)) {
        [System.IO.File]::AppendAllText($envFile, [Environment]::NewLine + $key + '=' + $defaults[$key], [System.Text.UTF8Encoding]::new($false))
        $properties[$key] = $defaults[$key]
    }
}
if (!$properties.S3_ACCESS_KEY -or !$properties.S3_SECRET_KEY) { throw 'Set nonempty local storage credentials in backend/.env.' }
if ($properties.S3_ENDPOINT -ne 'http://127.0.0.1:8333') { throw 'This helper is for the isolated loopback development service only.' }
$directory = Join-Path $backendRoot '.local/storage'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$config = @{identities=@(@{name='collector-local'; credentials=@(@{accessKey=$properties.S3_ACCESS_KEY;secretKey=$properties.S3_SECRET_KEY}); actions=@('Admin','Read','Write','List','Tagging')})} | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText((Join-Path $directory 's3.json'), $config, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Local authenticated storage configuration prepared. Existing environment values preserved; uploads remain disabled until explicitly enabled.'
