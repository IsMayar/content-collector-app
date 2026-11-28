#Requires -Version 5.1
<#
.SYNOPSIS
  Open the latest CLIENT_INVITE message from the loopback-only development inbox.
.DESCRIPTION
  Local development helper only. Reads an existing private inbox file without
  printing the invitation capability or exposing it through an HTTP endpoint.
  This does not send email, issue a token, or modify project data.
#>
[CmdletBinding()]
param(
    [string]$ProjectId = ''
)

$ErrorActionPreference = 'Stop'
$backend = Split-Path -Parent $PSScriptRoot
$inbox = Join-Path $backend '.local\auth\inbox'
if (-not (Test-Path -LiteralPath $inbox -PathType Container)) {
    throw 'No development inbox found. Start the backend with ACCOUNT_DELIVERY_DEV_INBOX=true and an enabled account delivery worker.'
}

foreach ($file in (Get-ChildItem -LiteralPath $inbox -Filter '*.txt' -File | Sort-Object LastWriteTimeUtc -Descending)) {
    $lines = @(Get-Content -LiteralPath $file.FullName -Encoding UTF8)
    if ($lines.Count -lt 3 -or $lines[0] -ne 'CLIENT_INVITE') { continue }

    $uri = $null
    if (-not [Uri]::TryCreate($lines[2], [UriKind]::Absolute, [ref]$uri)) { continue }
    if ($uri.Scheme -ne 'https' -and $uri.Scheme -ne 'http') { continue }
    if ($uri.Host -notin @('localhost','127.0.0.1','::1')) { continue }
    if ($uri.AbsolutePath -ne '/client/access' -or -not $uri.Fragment.StartsWith('#token=')) { continue }

    $param = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
    if ($ProjectId -and $param.Get('projectId') -ne $ProjectId) { continue }

    Start-Process -FilePath $uri.AbsoluteUri
    Write-Host 'Opened an existing invitation link from the private development inbox. No token was printed.'
    exit 0
}
throw 'No matching CLIENT_INVITE message was found. Verify the contact is active and the account delivery worker processed the new request.'
