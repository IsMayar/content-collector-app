#Requires -Version 5.1
<#
.SYNOPSIS
  Diagnose the local Stripe webhook without creating a payment or invoice.
.DESCRIPTION
  Uses "stripe listen --all-snapshot --print-secret" to retrieve the local
  Stripe CLI webhook signing secret automatically. No clipboard is required.
  It sends two signed synthetic events to the local Spring Boot backend.
  The second event adds a harmless diagnostic row for a fake customer ID.
  Never run against a production webhook endpoint.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$endpoint = 'http://127.0.0.1:8080/api/v1/webhooks/stripe'

# Stripe CLI prints its configured local signing secret and exits without
# starting a listener. Capture it directly: no copy/paste and no console output.
$secret = $null
try {
    $cliOutput = @(& stripe listen --all-snapshot --print-secret 2>&1 | ForEach-Object { [string]$_ })
    if ($LASTEXITCODE -ne 0) {
        throw 'Stripe CLI could not read the local signing secret. Verify stripe login and sandbox selection.'
    }
    $matchesFound = [regex]::Matches(($cliOutput -join [Environment]::NewLine), 'whsec_[A-Za-z0-9]+')
    if ($matchesFound.Count -ne 1) {
        throw 'Stripe CLI did not return one signing secret. Verify stripe login and sandbox selection.'
    }
    $secret = $matchesFound[0].Value
    Remove-Variable cliOutput, matchesFound -ErrorAction SilentlyContinue
    Write-Host 'Loaded Stripe CLI signing secret automatically (value hidden).'

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
    Remove-Variable secret, cliOutput, matchesFound -ErrorAction SilentlyContinue
}
