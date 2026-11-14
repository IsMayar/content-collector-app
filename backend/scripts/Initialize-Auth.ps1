param(
    [string]$Directory = (Join-Path $PSScriptRoot '..\.local\auth'),
    [string]$EnvFile = (Join-Path $PSScriptRoot '..\.env'),
    [string]$Java = 'java'
)
$ErrorActionPreference = 'Stop'
$authRoot = [IO.Path]::GetFullPath($Directory)
$authEnv = [IO.Path]::GetFullPath($EnvFile)
$required = @('JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEYS', 'JWT_KEY_ID', 'JWT_ISSUER', 'JWT_AUDIENCE', 'TOKEN_HASH_PEPPER')
$configured = @($required | Where-Object {
    (Test-Path -LiteralPath $authEnv) -and (Select-String -LiteralPath $authEnv -Pattern "^$($_)=\s*\S" -Quiet)
})
if ($configured.Count -eq $required.Count) {
    Write-Output 'Existing auth configuration preserved.'
    return
}
if ($configured.Count -gt 0) {
    throw 'Partial auth configuration in backend/.env. Restore its matching values before retrying.'
}

New-Item -ItemType Directory -Path $authRoot -Force | Out-Null
$authAcl = New-Object Security.AccessControl.DirectorySecurity
$authAcl.SetAccessRuleProtection($true, $false)
$authIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$authRule = New-Object Security.AccessControl.FileSystemAccessRule($authIdentity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$authAcl.AddAccessRule($authRule)
$authDirectory = [IO.DirectoryInfo]::new($authRoot)
if ($PSVersionTable.PSEdition -eq 'Core') {
    [IO.FileSystemAclExtensions]::SetAccessControl($authDirectory, $authAcl)
} else {
    $authDirectory.SetAccessControl($authAcl)
}

$files = @('private.pem', 'public.jwks.json', 'auth.properties')
$existing = @($files | Where-Object { Test-Path -LiteralPath (Join-Path $authRoot $_) -PathType Leaf })
if ($existing.Count -eq 0) {
    $source = Join-Path $PSScriptRoot 'GenerateAuthKeys.java'
    $arguments = @(('"{0}"' -f $source), ('"{0}"' -f $authRoot))
    $generator = Start-Process -FilePath $Java -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
    if ($generator.ExitCode -ne 0) {
        throw 'Local auth key generation failed; preserve any generated files for inspection.'
    }
} elseif ($existing.Count -ne $files.Count) {
    throw 'Partial key files preserved. Restore the matching files before retrying.'
}
$authLines = [IO.File]::ReadAllLines((Join-Path $authRoot 'auth.properties'))
foreach ($setting in $required) {
    if (-not ($authLines -match "^$setting=\s*\S")) {
        throw 'Generated auth configuration is incomplete.'
    }
}
[IO.File]::AppendAllText($authEnv, [Environment]::NewLine + [string]::Join([Environment]::NewLine, $authLines) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
Write-Output 'Local signing keys and refresh hash configuration are ready.'
