param(
    [string]$Directory = (Join-Path $PSScriptRoot '..\.local\auth'),
    [string]$EnvFile = (Join-Path $PSScriptRoot '..\.env')
)
$ErrorActionPreference = 'Stop'
$authRoot = [IO.Path]::GetFullPath($Directory)
$authEnv = [IO.Path]::GetFullPath($EnvFile)
if ((Test-Path -LiteralPath $authEnv) -and (Select-String -LiteralPath $authEnv -Pattern '^JWT_PRIVATE_KEY=.+' -Quiet)) {
    Write-Output 'Existing auth configuration preserved.'
    exit 0
}
if (Test-Path -LiteralPath (Join-Path $authRoot 'auth.properties')) {
    throw 'Existing key files preserved. Restore the matching configuration securely; do not regenerate keys.'
}
New-Item -ItemType Directory -Path $authRoot -Force | Out-Null
# Restrict the directory before creating secrets. Children inherit only this user's access.
$authAcl = Get-Acl -LiteralPath $authRoot
$authAcl.SetAccessRuleProtection($true, $false)
$authIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$authRule = New-Object Security.AccessControl.FileSystemAccessRule($authIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$authAcl.AddAccessRule($authRule)
Set-Acl -LiteralPath $authRoot -AclObject $authAcl
& java (Join-Path $PSScriptRoot 'GenerateAuthKeys.java') $authRoot
if ($LASTEXITCODE -ne 0) { throw 'Local auth key generation failed; preserve any generated files for inspection.' }
$authLines = [IO.File]::ReadAllLines((Join-Path $authRoot 'auth.properties'))
[IO.File]::AppendAllText($authEnv, [Environment]::NewLine + [string]::Join([Environment]::NewLine, $authLines) + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
Write-Output 'Local signing keys and refresh hash configuration created. Secret values were not printed.'
