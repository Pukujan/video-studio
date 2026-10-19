# Durable CDP Chrome launcher.
# Reuses an already-running debug Chrome, otherwise starts one on the REAL
# Chrome profile so the Google session (cookies valid to 2027-11-05) carries over.
#
#   .\scripts\chrome-cdp.ps1              # ensure browser on 9222
#   .\scripts\chrome-cdp.ps1 -Port 9223
#
param(
    [int]$Port = 9222,
    [string]$ProfileDir = "$env:LOCALAPPDATA\Google\Chrome\User Data",
    [string]$ProfileName = "Default",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Test-Cdp {
    param([int]$P)
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$P/json/version" -UseBasicParsing -TimeoutSec 3
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

foreach ($p in 9222, 9223, 9224) {
    if (Test-Cdp -P $p) {
        Write-Output "CDP already listening on $p (reusing)"
        exit 0
    }
}

if (-not (Test-Path $ProfileDir)) {
    throw "Chrome profile not found: $ProfileDir"
}

$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) {
    $chrome = (Get-Command chrome.exe -ErrorAction SilentlyContinue).Source
}
if (-not $chrome) { throw "chrome.exe not found" }

# A normally-launched Chrome holds the profile and would make the new instance
# fall back to a blank profile. Only the user's own Chrome blocks this.
$others = Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
    Where-Object {
        $_.CommandLine -notmatch '--type=' -and
        $_.CommandLine -notmatch 'remote-debugging-port'
    }

if ($others -and -not $Force) {
    Write-Output "A normal Chrome is already running and holds this profile."
    Write-Output "Close it first, or re-run with -Force to close it automatically:"
    $others | ForEach-Object { Write-Output "  PID $($_.ProcessId)" }
    exit 2
}

if ($others -and $Force) {
    $others | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 3
}

Start-Process $chrome -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$ProfileDir",
    "--profile-directory=$ProfileName",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-blink-features=AutomationControlled",
    "--start-maximized"
)

for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-Cdp -P $Port) {
        Write-Output "CDP ready on $Port (profile: $ProfileName)"
        exit 0
    }
}

throw "Chrome started but CDP never came up on $Port"
