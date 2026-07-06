# build-connector.ps1 -- iceDQ MCP Connector Bundle Builder
#
# This folder IS the bundle source. icedq-mcp-server.js must already be
# present here (built externally by esbuild from the source project).
#
# Steps:
#   1. Verify icedq-mcp-server.js is present
#   2. Resolve version from package.json (strips -SNAPSHOT suffix)
#   3. Patch manifest.json version to match
#   4. Validate manifest.json with @anthropic-ai/mcpb
#   5. Pack into icedq-mcp-server-{version}.mcpb
#
# Usage:
#   .\build-connector.ps1
#   .\build-connector.ps1 -Version "1.0.7"

param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

function Write-Step([int]$n, [int]$total, [string]$msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Cyan
}

function Write-Ok([string]$msg) {
    Write-Host "      OK: $msg" -ForegroundColor Green
}

function Write-Fail([string]$msg) {
    Write-Host "   ERROR: $msg" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "iceDQ MCP Server -- Connector Bundle Builder" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green

$bundleDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $bundleDir
Write-Host "  Bundle dir: $bundleDir" -ForegroundColor DarkGray

# --- Prerequisites ---------------------------------------------------------
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Fail "npm not found. Please install Node.js 20+" }
if (-not (Test-Path "package.json"))   { Write-Fail "package.json not found in $bundleDir" }
if (-not (Test-Path "manifest.json"))  { Write-Fail "manifest.json not found in $bundleDir" }
if (-not (Test-Path "icon.png"))       { Write-Fail "icon.png not found in $bundleDir" }

# --- Step 1: Verify pre-built bundle ---------------------------------------
Write-Step 1 5 "Verifying icedq-mcp-server.js..."

if (-not (Test-Path "icedq-mcp-server.js")) {
    Write-Fail "icedq-mcp-server.js not found in $bundleDir.`n         Copy the esbuild output here before running this script."
}
$bundleSizeKB = [math]::Round((Get-Item "icedq-mcp-server.js").Length / 1KB, 1)
Write-Ok "icedq-mcp-server.js  ($bundleSizeKB KB)"

# --- Step 2: Resolve version -----------------------------------------------
Write-Step 2 5 "Resolving version..."

$rootPkg = Get-Content "package.json" -Raw | ConvertFrom-Json
if (-not $Version) { $Version = $rootPkg.version }
$cleanVersion = $Version -replace '-SNAPSHOT', '' -replace '-[a-zA-Z].*$', ''
Write-Ok "v$cleanVersion (from $Version)"

# --- Step 3: Patch manifest.json version -----------------------------------
Write-Step 3 5 "Patching manifest.json version to v$cleanVersion..."

# Use ReadAllText with explicit UTF-8 to avoid Windows-1252 mojibake on non-ASCII chars
$utf8 = [System.Text.UTF8Encoding]::new($false)
$manifest = [System.IO.File]::ReadAllText("$bundleDir\manifest.json", $utf8) | ConvertFrom-Json
$manifest.version = $cleanVersion
$manifestJson = $manifest | ConvertTo-Json -Depth 20
[System.IO.File]::WriteAllText("$bundleDir\manifest.json", $manifestJson, $utf8)
Write-Ok "manifest.json version = $cleanVersion"

# --- Step 4: Validate manifest with official mcpb CLI ----------------------
Write-Step 4 5 "Validating manifest.json with @anthropic-ai/mcpb..."

npx --yes @anthropic-ai/mcpb validate "$bundleDir\manifest.json"
if ($LASTEXITCODE -ne 0) { Write-Fail "manifest.json validation failed -- fix errors above before packing." }
Write-Ok "manifest.json is valid"

# --- Step 5: Pack into .mcpb with official mcpb CLI ------------------------
$mcpbName = "icedq-mcp-server-$cleanVersion.mcpb"
$mcpbPath = Join-Path $bundleDir $mcpbName
Write-Step 5 5 "Packing into $mcpbName..."

if (Test-Path $mcpbPath) { Remove-Item $mcpbPath -Force }

# Staging dir excludes dev-only files
$stagingDir = Join-Path $bundleDir "_mcpb_staging"
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDir -Force | Out-Null

$excludeNames = @('build-connector.ps1', 'SUBMISSION_CHECKLIST.md', 'package-lock.json', '_mcpb_staging', 'node_modules')
Get-ChildItem -Path $bundleDir |
    Where-Object { $_.Name -notmatch '\.(mcpb|zip)$' -and $excludeNames -notcontains $_.Name } |
    ForEach-Object {
        if ($_.PSIsContainer) {
            Copy-Item -Path $_.FullName -Destination "$stagingDir\$($_.Name)" -Recurse -Force
        } else {
            Copy-Item -Path $_.FullName -Destination "$stagingDir\$($_.Name)" -Force
        }
    }

npx --yes @anthropic-ai/mcpb pack $stagingDir $mcpbPath
if ($LASTEXITCODE -ne 0) {
    Remove-Item $stagingDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Fail "mcpb pack failed."
}
Remove-Item $stagingDir -Recurse -Force -ErrorAction SilentlyContinue

$mcpbSizeMB = [math]::Round((Get-Item $mcpbPath).Length / 1048576, 2)
Write-Ok "$mcpbPath  ($mcpbSizeMB MB)"

# --- Summary ---------------------------------------------------------------
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "Connector bundle ready!  v$cleanVersion" -ForegroundColor Green
Write-Host ""
Write-Host "Output:" -ForegroundColor Yellow
Write-Host "  $mcpbPath  ($mcpbSizeMB MB)" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Install $mcpbName in Claude Desktop and verify all tools work" -ForegroundColor White
Write-Host "  2. Create a GitHub release tagged v$cleanVersion and attach $mcpbName" -ForegroundColor White
Write-Host "  3. Submit via the Anthropic Desktop Extension submission form" -ForegroundColor White
Write-Host ""
