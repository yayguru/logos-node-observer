[CmdletBinding()]
param(
    [string]$Owner = "yayguru",
    [string]$Repository = "logos-node-observer",
    [string]$TokenFile
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$token = $null
$githubCli = Get-Command gh -ErrorAction SilentlyContinue

if ($githubCli) {
    $oldErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & gh auth status --hostname github.com *> $null
        if ($LASTEXITCODE -eq 0) {
            $token = & gh auth token --hostname github.com 2> $null
        }
    } finally {
        $ErrorActionPreference = $oldErrorActionPreference
    }
}

if (-not $token) {
    if (-not $TokenFile) {
        $TokenFile = Join-Path (Split-Path $repoRoot -Parent) "Foryouenv.txt"
    }

    if (Test-Path -LiteralPath $TokenFile) {
        $tokenLines = Get-Content -LiteralPath $TokenFile
        $token = $tokenLines |
            Where-Object { $_.Trim() -match "^(github_pat_|ghp_)" } |
            Select-Object -First 1

        if (-not $token) {
            $tokenEntry = $tokenLines |
                Where-Object { $_ -match "^\s*GitHubToken\s*[:=]" } |
                Select-Object -First 1

            if ($tokenEntry) {
                $token = ($tokenEntry -replace "^\s*GitHubToken\s*[:=]\s*", "").Trim()
            }
        }
    }
}

if (-not $token) {
    throw "No valid GitHub login was found. Run: gh auth login -h github.com -p https -w"
}

$token = $token.Trim()
$headers = @{
    Authorization = "Bearer $token"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent" = "Logos-Node-Observer-Publisher"
}

$apiUrl = "https://api.github.com/repos/$Owner/$Repository"
$remoteRepository = $null

try {
    $remoteRepository = Invoke-RestMethod -Method Get -Uri $apiUrl -Headers $headers
    Write-Host "Using existing repository: $($remoteRepository.html_url)"
} catch {
    $statusCode = $null
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
    }

    if ($statusCode -eq 401) {
        throw "GitHub rejected the saved credentials. Run: gh auth login -h github.com -p https -w"
    }

    if ($statusCode -ne 404) {
        throw
    }

    Write-Host "Creating public repository $Owner/$Repository..."
    $body = @{
        name = $Repository
        description = "Fast, read-only health dashboard for self-hosted Logos nodes."
        private = $false
        auto_init = $false
        has_issues = $true
        has_projects = $false
        has_wiki = $false
    } | ConvertTo-Json

    $remoteRepository = Invoke-RestMethod `
        -Method Post `
        -Uri "https://api.github.com/user/repos" `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $body
}

$remoteUrl = "https://github.com/$Owner/$Repository.git"
$remotes = @(& git -C $repoRoot remote)
if ($LASTEXITCODE -ne 0) {
    throw "Unable to read Git remotes."
}

if ($remotes -contains "origin") {
    & git -C $repoRoot remote set-url origin $remoteUrl
} else {
    & git -C $repoRoot remote add origin $remoteUrl
}

if ($LASTEXITCODE -ne 0) {
    throw "Unable to configure the origin remote."
}

# Authentication exists only in this process; it is never saved in .git/config.
$basicAuth = [Convert]::ToBase64String(
    [Text.Encoding]::ASCII.GetBytes("x-access-token:$token")
)

$previousConfigCount = $env:GIT_CONFIG_COUNT
$previousConfigKey = $env:GIT_CONFIG_KEY_0
$previousConfigValue = $env:GIT_CONFIG_VALUE_0

try {
    $env:GIT_CONFIG_COUNT = "1"
    $env:GIT_CONFIG_KEY_0 = "http.https://github.com/.extraheader"
    $env:GIT_CONFIG_VALUE_0 = "AUTHORIZATION: basic $basicAuth"

    Write-Host "Pushing main..."
    $oldErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & git -C $repoRoot push -u origin main
        $pushExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $oldErrorActionPreference
    }

    if ($pushExitCode -ne 0) {
        throw "git push failed with exit code $pushExitCode"
    }
} finally {
    $env:GIT_CONFIG_COUNT = $previousConfigCount
    $env:GIT_CONFIG_KEY_0 = $previousConfigKey
    $env:GIT_CONFIG_VALUE_0 = $previousConfigValue
    Remove-Variable token, basicAuth -ErrorAction SilentlyContinue
}

Write-Host "Published successfully: $($remoteRepository.html_url)"
