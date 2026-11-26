#Requires -Version 5.1
<#
.SYNOPSIS
  Diagnose the local Stripe webhook without creating a payment or invoice.
.DESCRIPTION
  Copy the whsec_... token from the CURRENT stripe listen terminal (or its
  complete "Your webhook signing secret is ..." line) to your clipboard.
  This script clears that clipboard entry after reading it.
  It sends two signed synthetic events to the local Spring Boot backend.
  The second event adds a harmless diagnostic row for a fake customer ID.
  Never run against a production webhook endpoint.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$endpoint = 'http://127.0.0.1:8080/api/v1/webhooks/stripe'

# Read from clipboard rather than relying on PowerShell 5.1 hidden-input paste.
$secret = $null
try {
    $clipboardValue = [string](Get-Clipboard -Raw)
    $match = [regex]::Match($clipboardValue, 'whsec_[A-Za-z0-9]+')
    if (-not $match.Success) {
        throw 'Clipboard has no whsec_ token. Copy the FULL current Stripe CLI signing secret (or entire Ready line) and retry.'
    }

    $secret = $match.Value
    Set-Clipboard -Value ''
    Remove-Variable clipboardValue, match -ErrorAction SilentlyContinue
    Write-Host 'Loaded local Stripe signing secret from clipboard (value hidden).'

    function Invoke-SignedLocalWebhook {
        param([Parameter(Mandatory = $true)][string]$EventType)

        $payload = [ordered]@{
            id = 'evt_localDiagnostic' + [guid]::NewGuid().ToString('N')
            type = $EventType
            livemode = $false
            data = @{ object = @{ customer = 'cus_localDiagnostic' } }
        }
        $body = $payload | ConvertTo-Json -Depth 5 -Compress
        $bodyBytes = [Text.Encoding]::UTF8.GetBytes($body)
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

        $hmac = [Security.Cryptography.HMACSHA256]::new(
            [Text.Encoding]::UTF8.GetBytes($secret))
        try {
            $signedBytes = [Text.Encoding]::UTF8.GetBytes("$timestamp.$body")
            $hash = $hmac.ComputeHash($signedBytes)
            $signature = [BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant()
        } finally {
            $hmac.Dispose()
        }

        try {
            $webRequestArgs = @{
                UseBasicParsing = $true
                Method = 'POST'
                Uri = $endpoint
                ContentType = 'application/json'
                Headers = @{ 'Stripe-Signature' = "t=$timestamp,v1=$signature" }
                Body = $bodyBytes
                ErrorAction = 'Stop'
            }
            $result = Invoke-WebRequest @webRequestArgs
            Write-Host ("{0}: HTTP {1}" -f $EventType, [int]$result.StatusCode)
            return [int]$result.StatusCode
        } catch {
            $response = $_.Exception.Response
            if ($null -eq $response) {
                Write-Host ("{0}: connection failed: {1}" -f $EventType, $_.Exception.Message)
                return 0
            }
            $status = [int]$response.StatusCode
            $code = 'unavailable'
            try {
                $stream = $response.GetResponseStream()
                if ($null -ne $stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    try {
                        $problem = $reader.ReadToEnd() | ConvertFrom-Json
                        if ($problem.code) { $code = [string]$problem.code }
                    } finally {
                        $reader.Dispose()
                    }
                }
            } catch {
                # The response need not have a JSON problem body.
            }
            Write-Host ("{0}: HTTP {1}; error code: {2}" -f $EventType, $status, $code)
            return $status
        }
    }

    $firstStatus = Invoke-SignedLocalWebhook -EventType 'charge.refunded'
    if ($firstStatus -eq 200) {
        [void](Invoke-SignedLocalWebhook -EventType 'invoice.paid')
    } else {
        Write-Host 'Skipped persistence probe because signature/transport probe did not return 200.'
    }
} finally {
    Remove-Variable secret, clipboardValue, match -ErrorAction SilentlyContinue
}
