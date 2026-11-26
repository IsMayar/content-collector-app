#Requires -Version 5.1
<#
.SYNOPSIS
  Diagnose local Stripe webhook delivery without creating a Stripe invoice or payment.
.DESCRIPTION
  Sends (1) a signed ignored event to test transport/HMAC validation and
  (2) a signed synthetic invoice.paid event to test event persistence.
  The second event adds one diagnostic row to collector.billing_events, with a
  fake customer ID not tied to a Stripe customer or application workspace.
  Nothing is sent to Stripe. Do not run this against a production endpoint.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$endpoint = "http://127.0.0.1:8080/api/v1/webhooks/stripe"
$secure = Read-Host "Enter signing secret from the CURRENT local Stripe CLI listener (never share it)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

try {
    $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if (-not $secret.StartsWith("whsec_", [StringComparison]::Ordinal)) {
        throw "Expected a Stripe CLI webhook signing secret starting with whsec_."
    }

    function Send-LocalStripeProbe {
        param([Parameter(Mandatory=$true)][string]$Type)

        $eventId = "evt_localDiagnostic" + [Guid]::NewGuid().ToString("N")
        $body = '{"id":"' + $eventId + '","type":"' + $Type +
            '","livemode":false,"data":{"object":{"customer":"cus_localDiagnostic"}}}'
        $bodyBytes = [Text.Encoding]::UTF8.GetBytes($body)
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

        $hmac = [Security.Cryptography.HMACSHA256]::new(
            [Text.Encoding]::UTF8.GetBytes($secret))
        try {
            $hmacBytes = $hmac.ComputeHash(
                [Text.Encoding]::UTF8.GetBytes("$timestamp.$body"))
            $signature = [BitConverter]::ToString($hmacBytes).Replace("-", "").ToLowerInvariant()
        } finally {
            $hmac.Dispose()
        }

        try {
            $response = Invoke-WebRequest -UseBasicParsing -Method POST -Uri $endpoint `
                -ContentType "application/json" `
                -Headers @{ "Stripe-Signature" = "t=$timestamp,v1=$signature" } `
                -Body $bodyBytes -ErrorAction Stop
            Write-Host ("{0}: HTTP {1}" -f $Type, [int]$response.StatusCode)
            return [int]$response.StatusCode
        } catch {
            $response = $_.Exception.Response
            if ($null -eq $response) {
                Write-Host ("{0}: connection failed: {1}" -f $Type, $_.Exception.Message)
                return 0
            }
            $status = [int]$response.StatusCode
            $errorCode = "unavailable"
            try {
                $stream = $response.GetResponseStream()
                if ($null -ne $stream) {
                    $reader = New-Object System.IO.StreamReader($stream)
                    try {
                        $problem = $reader.ReadToEnd() | ConvertFrom-Json
                        if ($problem.code) { $errorCode = [string]$problem.code }
                    } finally {
                        $reader.Dispose()
                    }
                }
            } catch {
                # Some HTTP/proxy errors do not include a parseable JSON body.
            }
            Write-Host ("{0}: HTTP {1}; error code: {2}" -f $Type, $status, $errorCode)
            return $status
        }
    }

    $signatureStatus = Send-LocalStripeProbe -Type "charge.refunded"
    if ($signatureStatus -eq 200) {
        [void](Send-LocalStripeProbe -Type "invoice.paid")
    } else {
        Write-Host "Skipped persistence probe until the ignored signed event is accepted."
    }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    Remove-Variable secure, ptr, secret -ErrorAction SilentlyContinue
}
