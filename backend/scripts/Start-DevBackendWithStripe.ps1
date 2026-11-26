#Requires -Version 5.1
<#
.SYNOPSIS
  Start Content Collector locally with the Stripe CLI webhook signing secret.
.DESCRIPTION
  Stop the currently running Spring Boot instance with Ctrl+C before running.
  Leave the stripe listen forwarding terminal running separately.
  Retrieves the CLI secret in memory without displaying or saving it.
  Preserves your existing billing credentials and other environment settings.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$cliOutput = @(& stripe listen --all-snapshot --print-secret 2>&1 | ForEach-Object { [string]$_ })
if ($LASTEXITCODE -ne 0) {
    throw 'Could not retrieve the Stripe CLI webhook signing secret. Verify Stripe sandbox login.'
}
$matchesFound = [regex]::Matches(($cliOutput -join [Environment]::NewLine), 'whsec_[A-Za-z0-9]+')
if ($matchesFound.Count -ne 1) {
    throw 'Stripe CLI did not return exactly one signing secret. Verify Stripe sandbox login.'
}

$env:STRIPE_WEBHOOK_SECRET = $matchesFound[0].Value
Remove-Variable cliOutput, matchesFound -ErrorAction SilentlyContinue

$env:PRIVATE_STORAGE_ENABLED = 'true'
$env:PRIVATE_STORAGE_WORKER_ENABLED = 'false'
$env:EXPORT_WORKER_ENABLED = 'true'
$env:ACCOUNT_DELIVERY_DEV_INBOX = 'true'
$env:ACCOUNT_DELIVERY_WORKER_ENABLED = 'true'
$env:APP_BASE_URL = 'https://127.0.0.1:5173'
$env:MAVEN_OPTS = '-Xms64m -Xmx256m -XX:+UseSerialGC'

$backend = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $backend
Write-Host 'Starting Spring Boot with Stripe CLI signing secret loaded (value hidden).'
$mavenArguments = @(
    '-Dspring-boot.run.profiles=dev'
    '-Dspring-boot.run.jvmArguments=-Xms64m -Xmx384m -XX:+UseSerialGC'
    'spring-boot:run'
)
& '.\mvnw.cmd' @mavenArguments
