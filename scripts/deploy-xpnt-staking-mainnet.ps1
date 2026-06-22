$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# This file is intended for step-by-step execution in PowerShell ISE.
# Run the steps from top to bottom.
# Secrets are read from environment variables. Do not put private keys or RPC
# tokens directly into this file.
# This deploys the production staking stack to Arbitrum One mainnet.

# Step 1. Fill in the variables manually
#
# RPC providers:
# - Alchemy: https://www.alchemy.com/
# - Infura: https://www.infura.io/
# - QuickNode: https://www.quicknode.com/
#
# Explorer API key:
# - Etherscan registration: https://etherscan.io/register
# - Etherscan API keys: https://etherscan.io/myapikey

function Read-RequiredEnv([string] $Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Set required environment variable $Name before running this script."
    }

    return $value
}

function Read-OptionalEnv([string] $Name, [string] $DefaultValue = '') {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return $value
}

$RUN_INSTALL = $true
$RUN_COMPILE = $true

# If your network requires an explicit proxy for Node/Hardhat, set it here.
# Example: http://proxy.company.local:8080
$SYSTEM_PROXY_URL = Read-OptionalEnv 'SYSTEM_PROXY_URL'

$ARB_MAINNET_RPC_URL = Read-RequiredEnv 'ARB_MAINNET_RPC_URL'
$ARB_PRIVATE_KEY = Read-RequiredEnv 'ARB_PRIVATE_KEY'
$ETHERSCAN_API_KEY = Read-RequiredEnv 'ETHERSCAN_API_KEY'

# Canonical Arbitrum One XPNT proxy address.
# Replace only if you intentionally deploy the staking stack against another L2 token.
$XPNT_TOKEN_ADDRESS = Read-OptionalEnv 'XPNT_TOKEN_ADDRESS' '0x63B2cdb8B0d8774F1Fdca91D24803698582a079F'

# Human-readable staking requirement. deploy-mainnet.js converts it to 9-decimal atomic units.
$XPNT_STAKING_REQUIREMENT = Read-OptionalEnv 'XPNT_STAKING_REQUIREMENT' '25000'


# Step 2. Validate required variables
foreach ($pair in @(
    @{ Name = 'ARB_MAINNET_RPC_URL'; Value = $ARB_MAINNET_RPC_URL },
    @{ Name = 'ARB_PRIVATE_KEY'; Value = $ARB_PRIVATE_KEY },
    @{ Name = 'ETHERSCAN_API_KEY'; Value = $ETHERSCAN_API_KEY },
    @{ Name = 'XPNT_TOKEN_ADDRESS'; Value = $XPNT_TOKEN_ADDRESS },
    @{ Name = 'XPNT_STAKING_REQUIREMENT'; Value = $XPNT_STAKING_REQUIREMENT }
)) {
    if ([string]::IsNullOrWhiteSpace($pair.Value)) {
        throw "Set environment variable $($pair.Name) before running this script."
    }
}


# Step 3. Enter the repo and enable the vendored x64 Node runtime
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $repoRoot

$nodeRoot = (Resolve-Path '.tools/node-v22.2.0-win-x64').Path
$proxyBootstrapPath = (Resolve-Path '.\scripts\node-undici-proxy-bootstrap.cjs').Path
$env:Path = "$nodeRoot;$nodeRoot\node_modules\npm\bin;$env:Path"
$env:HARDHAT_DISABLE_TELEMETRY_PROMPT = 'true'

$archOutput = node -e "console.log(process.platform, process.arch)" 2>&1
$archExitCode = $LASTEXITCODE
if ($archOutput) {
    $archOutput | ForEach-Object { Write-Host $_ }
}
if ($archExitCode -ne 0) {
    throw 'Failed to validate the Node runtime.'
}

$archText = $archOutput -join "`n"
if ($archText -notmatch 'win32 x64') {
    throw 'The vendored x64 Node runtime from .tools/node-v22.2.0-win-x64 is required.'
}


# Step 4. Export env vars for Hardhat and deploy scripts
$env:ARB_MAINNET_RPC_URL = $ARB_MAINNET_RPC_URL
$env:ARB_PRIVATE_KEY = $ARB_PRIVATE_KEY
$env:ETHERSCAN_API_KEY = $ETHERSCAN_API_KEY
$env:XPNT_TOKEN_ADDRESS = $XPNT_TOKEN_ADDRESS
$env:XPNT_STAKING_REQUIREMENT = $XPNT_STAKING_REQUIREMENT

if (-not [string]::IsNullOrWhiteSpace($SYSTEM_PROXY_URL)) {
    $env:HTTPS_PROXY = $SYSTEM_PROXY_URL
    $env:HTTP_PROXY = $SYSTEM_PROXY_URL
    $env:ALL_PROXY = $SYSTEM_PROXY_URL

    $proxyRequireOption = "--require=$proxyBootstrapPath"
    if ([string]::IsNullOrWhiteSpace($env:NODE_OPTIONS)) {
        $env:NODE_OPTIONS = $proxyRequireOption
    }
    elseif ($env:NODE_OPTIONS -notmatch [regex]::Escape($proxyBootstrapPath)) {
        $env:NODE_OPTIONS = ($env:NODE_OPTIONS + ' ' + $proxyRequireOption).Trim()
    }
}


# Step 5. Install dependencies
if ($RUN_INSTALL) {
    $installOutput = cmd.exe /d /c "npx pnpm@9.1.3 install --frozen-lockfile 2>&1"
    $installExitCode = $LASTEXITCODE
    if ($installOutput) {
        $installOutput | ForEach-Object { Write-Host $_ }
    }
    if ($installExitCode -ne 0) {
        throw 'Dependency installation failed.'
    }
}
else {
    Write-Host 'Install step skipped.' -ForegroundColor Yellow
}


# Step 6. Compile contracts
if ($RUN_COMPILE) {
    $compileOutput = cmd.exe /d /c "npx hardhat compile 2>&1"
    $compileExitCode = $LASTEXITCODE
    if ($compileOutput) {
        $compileOutput | ForEach-Object { Write-Host $_ }
    }
    if ($compileExitCode -ne 0) {
        throw 'Compilation failed.'
    }
}
else {
    Write-Host 'Compile step skipped.' -ForegroundColor Yellow
}


# Step 7. Deploy the staking stack to Arbitrum One mainnet
$deployOutput = cmd.exe /d /c "npx hardhat run scripts/deploy-mainnet.js --network arbitrum 2>&1"
$deployExitCode = $LASTEXITCODE
if ($deployOutput) {
    $deployOutput | ForEach-Object { Write-Host $_ }
}
if ($deployExitCode -ne 0) {
    throw 'Mainnet staking deployment failed.'
}


# Step 8. Read the generated deployment manifest
$hardhatManifestPath = Join-Path $repoRoot 'deployments\arbitrum.latest.json'
if (-not (Test-Path $hardhatManifestPath)) {
    throw 'deploy-mainnet.js completed but deployments\arbitrum.latest.json was not found.'
}

$hardhatManifest = Get-Content $hardhatManifestPath -Raw | ConvertFrom-Json

$SERVICE_NODE_REWARDS_ADDRESS = [string]$hardhatManifest.contracts.serviceNodeRewards
$REWARD_RATE_POOL_ADDRESS = [string]$hardhatManifest.contracts.rewardRatePool
$SERVICE_NODE_CONTRIBUTION_FACTORY_ADDRESS = [string]$hardhatManifest.contracts.serviceNodeContributionFactory
$STAKING_REQUIREMENT_ATOMIC = [string]$hardhatManifest.parameters.stakingRequirement


# Step 9. Save a dedicated summary manifest for the Arbitrum mainnet staking deployment
$summaryManifestPath = Join-Path $repoRoot 'deployments\xpnt-staking-arbitrum.latest.json'
$summaryManifest = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    network = 'arbitrum'
    token = [ordered]@{
        address = $XPNT_TOKEN_ADDRESS
        symbol = 'XPNT'
        stakingRequirement = $XPNT_STAKING_REQUIREMENT
        stakingRequirementAtomic = $STAKING_REQUIREMENT_ATOMIC
    }
    contracts = [ordered]@{
        serviceNodeRewards = $SERVICE_NODE_REWARDS_ADDRESS
        rewardRatePool = $REWARD_RATE_POOL_ADDRESS
        serviceNodeContributionFactory = $SERVICE_NODE_CONTRIBUTION_FACTORY_ADDRESS
    }
    manifests = [ordered]@{
        hardhat = $hardhatManifestPath
        summary = $summaryManifestPath
    }
}

$summaryManifest | ConvertTo-Json -Depth 6 | Set-Content -Path $summaryManifestPath -Encoding UTF8


# Step 10. Final summary
Write-Host ''
Write-Host 'Deployment summary' -ForegroundColor Green
Write-Host "XPNT token address: $XPNT_TOKEN_ADDRESS"
Write-Host 'Target network: arbitrum'
Write-Host "ServiceNodeRewards: $SERVICE_NODE_REWARDS_ADDRESS"
Write-Host "RewardRatePool: $REWARD_RATE_POOL_ADDRESS"
Write-Host "ServiceNodeContributionFactory: $SERVICE_NODE_CONTRIBUTION_FACTORY_ADDRESS"
Write-Host "Hardhat manifest: $hardhatManifestPath"
Write-Host "Summary manifest: $summaryManifestPath"
