[CmdletBinding()]
param(
    [switch]$Browser,
    [switch]$Pwa
)

$ErrorActionPreference = 'Stop'
$null = Get-Command npm.cmd -CommandType Application -ErrorAction Stop
$frontendRoot = Split-Path -Parent $PSScriptRoot
$logRoot = Join-Path $frontendRoot '.artifacts\logs\verification'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

$checks = @(
    @{ Name = 'typecheck'; Arguments = @('run', 'typecheck') },
    @{ Name = 'build'; Arguments = @('run', 'build') },
    @{ Name = 'lint'; Arguments = @('run', 'lint') },
    @{ Name = 'format'; Arguments = @('run', 'format:check') },
    @{ Name = 'tests'; Arguments = @('test', '--', '--maxWorkers=1', '--pool=threads') }
)
if ($Browser) { $checks += @{ Name = 'browser'; Arguments = @('run', 'test:browser') } }
if ($Pwa) { $checks += @{ Name = 'pwa'; Arguments = @('run', 'test:pwa') } }

Push-Location -LiteralPath $frontendRoot
try {
    foreach ($check in $checks) {
        Write-Host "Running frontend $($check.Name)..."
        $npmArguments = $check.Arguments
        $logPath = Join-Path $logRoot ($check.Name + '.log')
        # Windows PowerShell 5.1 wraps native stderr as ErrorRecord, including harmless warnings.
        # Judge npm by its actual exit code; preserve errors in the log without treating warnings as failures.
        $previousPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & npm.cmd @npmArguments 2>&1 |
                ForEach-Object { $_.ToString() } |
                Tee-Object -FilePath $logPath -ErrorAction Stop
            $commandExitCode = $LASTEXITCODE
        } finally {
            $ErrorActionPreference = $previousPreference
        }
        if ($commandExitCode -ne 0) {
            throw "Frontend $($check.Name) failed. See $logPath."
        }
    }
    Write-Host "Frontend verification passed. Logs: $logRoot"
} finally {
    Pop-Location
}
