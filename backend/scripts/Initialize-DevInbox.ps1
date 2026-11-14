$ErrorActionPreference = 'Stop'
$backendRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $backendRoot '.env'
$authRoot = Join-Path $backendRoot '.local\auth'
if (!(Test-Path -LiteralPath $envPath -PathType Leaf) -or !(Test-Path -LiteralPath $authRoot -PathType Container)) {
    throw 'Run Initialize-Local.ps1 and Initialize-Auth.ps1 before initializing the development inbox.'
}

$authAcl = Get-Acl -LiteralPath $authRoot
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().User
$rules = @($authAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
if (!$authAcl.AreAccessRulesProtected -or $rules.Count -ne 1 -or
    $rules[0].IdentityReference -ne $identity -or
    $rules[0].AccessControlType -ne 'Allow' -or
    $rules[0].FileSystemRights -ne 'FullControl' -or
    ($rules[0].InheritanceFlags -band [Security.AccessControl.InheritanceFlags]::ObjectInherit) -eq 0 -or
    ($rules[0].InheritanceFlags -band [Security.AccessControl.InheritanceFlags]::ContainerInherit) -eq 0) {
    throw 'The development inbox requires the private ACL installed by Initialize-Auth.ps1.'
}
$inbox = Join-Path $authRoot 'inbox'
if (Test-Path -LiteralPath $inbox) {
    $entry = Get-Item -LiteralPath $inbox -Force
    $inboxAcl = Get-Acl -LiteralPath $inbox
    if (!$entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        $inboxAcl.AreAccessRulesProtected -or
        @($inboxAcl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier])).Count) {
        throw 'The development inbox must be a directory inheriting the private auth ACL.'
    }
} else {
    New-Item -ItemType Directory -Path $inbox | Out-Null
}
if (!(Select-String -LiteralPath $envPath -Pattern '^TOKEN_DELIVERY_ENCRYPTION_KEY=\s*\S' -Quiet)) {
    $bytes = New-Object byte[] 32
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($bytes) } finally { $random.Dispose() }
    $key = [Convert]::ToBase64String($bytes)
    [IO.File]::AppendAllText($envPath, [Environment]::NewLine + "TOKEN_DELIVERY_ENCRYPTION_KEY=$key" + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}
Write-Output 'Private development inbox is ready. Enable it explicitly when starting the loopback backend.'
