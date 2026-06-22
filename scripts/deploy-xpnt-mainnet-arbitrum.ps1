$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Этот файл рассчитан на запуск по блокам из PowerShell ISE.
# Выполняй шаги сверху вниз.
# Секреты читаются из переменных окружения. Не вписывай private key или RPC
# token прямо в этот файл.

# Шаг 1. Заполни переменные вручную
#
# RPC-провайдеры:
# - Alchemy: https://www.alchemy.com/
# - Infura: https://www.infura.io/
# - QuickNode: https://www.quicknode.com/
#
# API key для верификации:
# - Etherscan регистрация: https://etherscan.io/register
# - Etherscan API keys: https://etherscan.io/myapikey
# - Etherscan V2 key используется и для Ethereum, и для Arbitrum verify.

function Read-RequiredEnv([string] $Name) {
    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Задай обязательную переменную окружения $Name перед запуском скрипта."
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
$RUN_BRIDGE = $true

# Если для выхода в интернет нужен corporate/system proxy, вставь его URL сюда.
# Пример: http://proxy.company.local:8080
# Если proxy не нужен, оставь пустую строку.
#
# Важно: Windows system proxy сам по себе не подхватывается Hardhat/Node.
# Этот скрипт отдельно пробрасывает proxy в Node через HTTPS_PROXY/HTTP_PROXY и
# bootstrap для undici.
$SYSTEM_PROXY_URL = Read-OptionalEnv 'SYSTEM_PROXY_URL'

$ETH_MAINNET_RPC_URL = Read-RequiredEnv 'ETH_MAINNET_RPC_URL'
$ARB_MAINNET_RPC_URL = Read-RequiredEnv 'ARB_MAINNET_RPC_URL'

$ETH_PRIVATE_KEY = Read-RequiredEnv 'ETH_PRIVATE_KEY'
$ARB_PRIVATE_KEY = Read-OptionalEnv 'ARB_PRIVATE_KEY' $ETH_PRIVATE_KEY

$ETHERSCAN_API_KEY = Read-RequiredEnv 'ETHERSCAN_API_KEY'

# Оставь пустым, если весь genesis supply должен уйти на deployer wallet.
$XPNT_GENESIS_RECEIVER_ADDRESS = Read-OptionalEnv 'XPNT_GENESIS_RECEIVER_ADDRESS'

# Mainnet bridge addresses для Ethereum mainnet -> Arbitrum One.
$L1_ROUTER_ADDRESS = '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef'
$L1_GATEWAY_ADDRESS = '0xcEe284F754E854890e311e3280b767F80797180d'
$L2_GATEWAY_ADDRESS = '0x096760F208390250649E3e8763348E783AEF5562'

# Маленькая тестовая сумма для первого bridge. Пример: 1 XPNT.
$XPNT_BRIDGE_TEST_AMOUNT = Read-OptionalEnv 'XPNT_BRIDGE_TEST_AMOUNT' '1'

# Оставь пустым, если bridge destination должен быть deployer wallet.
$BRIDGE_DESTINATION_ADDRESS = Read-OptionalEnv 'BRIDGE_DESTINATION_ADDRESS'

# Тонкая настройка bridge. Обычно достаточно дефолтов.
$L2_GAS_PRICE_BID = Read-OptionalEnv 'L2_GAS_PRICE_BID'
$REGISTER_MAX_GAS_CUSTOM_GATEWAY = Read-OptionalEnv 'REGISTER_MAX_GAS_CUSTOM_GATEWAY'
$REGISTER_MAX_GAS_ROUTER = Read-OptionalEnv 'REGISTER_MAX_GAS_ROUTER'
$REGISTER_MAX_SUBMISSION_COST_CUSTOM_GATEWAY = Read-OptionalEnv 'REGISTER_MAX_SUBMISSION_COST_CUSTOM_GATEWAY'
$REGISTER_MAX_SUBMISSION_COST_ROUTER = Read-OptionalEnv 'REGISTER_MAX_SUBMISSION_COST_ROUTER'
$BRIDGE_L1_GAS_LIMIT = Read-OptionalEnv 'BRIDGE_L1_GAS_LIMIT'
$BRIDGE_L2_MAX_GAS = Read-OptionalEnv 'BRIDGE_L2_MAX_GAS'
$BRIDGE_MAX_SUBMISSION_COST = Read-OptionalEnv 'BRIDGE_MAX_SUBMISSION_COST'
$BRIDGE_L2_CALL_VALUE_WEI = Read-OptionalEnv 'BRIDGE_L2_CALL_VALUE_WEI'
$BRIDGE_CALL_HOOK_DATA = Read-OptionalEnv 'BRIDGE_CALL_HOOK_DATA'


# Шаг 2. Проверка обязательных переменных
foreach ($pair in @(
    @{ Name = 'ETH_MAINNET_RPC_URL'; Value = $ETH_MAINNET_RPC_URL },
    @{ Name = 'ARB_MAINNET_RPC_URL'; Value = $ARB_MAINNET_RPC_URL },
    @{ Name = 'ETH_PRIVATE_KEY'; Value = $ETH_PRIVATE_KEY },
    @{ Name = 'ARB_PRIVATE_KEY'; Value = $ARB_PRIVATE_KEY },
    @{ Name = 'ETHERSCAN_API_KEY'; Value = $ETHERSCAN_API_KEY }
)) {
    if ([string]::IsNullOrWhiteSpace($pair.Value)) {
        throw "Задай переменную окружения $($pair.Name) перед запуском скрипта."
    }
}


# Шаг 3. Переход в репозиторий и включение x64 Node
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
    throw 'Не удалось проверить Node runtime.'
}

$archText = $archOutput -join "`n"
if ($archText -notmatch 'win32 x64') {
    throw 'Нужен vendored x64 Node из .tools/node-v22.2.0-win-x64.'
}


# Шаг 4. Экспорт переменных в env для Hardhat и deploy scripts
$env:ETH_MAINNET_RPC_URL = $ETH_MAINNET_RPC_URL
$env:ARB_MAINNET_RPC_URL = $ARB_MAINNET_RPC_URL
$env:ETH_PRIVATE_KEY = $ETH_PRIVATE_KEY
$env:ARB_PRIVATE_KEY = $ARB_PRIVATE_KEY
$env:ETHERSCAN_API_KEY = $ETHERSCAN_API_KEY
$env:L1_ROUTER_ADDRESS = $L1_ROUTER_ADDRESS
$env:L1_GATEWAY_ADDRESS = $L1_GATEWAY_ADDRESS
$env:L2_GATEWAY_ADDRESS = $L2_GATEWAY_ADDRESS
$env:XPNT_BRIDGE_TEST_AMOUNT = $XPNT_BRIDGE_TEST_AMOUNT

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

if (-not [string]::IsNullOrWhiteSpace($XPNT_GENESIS_RECEIVER_ADDRESS)) {
    $env:XPNT_GENESIS_RECEIVER_ADDRESS = $XPNT_GENESIS_RECEIVER_ADDRESS
}

if (-not [string]::IsNullOrWhiteSpace($BRIDGE_DESTINATION_ADDRESS)) {
    $env:BRIDGE_DESTINATION_ADDRESS = $BRIDGE_DESTINATION_ADDRESS
}

if (-not [string]::IsNullOrWhiteSpace($L2_GAS_PRICE_BID)) {
    $env:L2_GAS_PRICE_BID = $L2_GAS_PRICE_BID
}

if (-not [string]::IsNullOrWhiteSpace($REGISTER_MAX_GAS_CUSTOM_GATEWAY)) {
    $env:REGISTER_MAX_GAS_CUSTOM_GATEWAY = $REGISTER_MAX_GAS_CUSTOM_GATEWAY
}

if (-not [string]::IsNullOrWhiteSpace($REGISTER_MAX_GAS_ROUTER)) {
    $env:REGISTER_MAX_GAS_ROUTER = $REGISTER_MAX_GAS_ROUTER
}

if (-not [string]::IsNullOrWhiteSpace($REGISTER_MAX_SUBMISSION_COST_CUSTOM_GATEWAY)) {
    $env:REGISTER_MAX_SUBMISSION_COST_CUSTOM_GATEWAY = $REGISTER_MAX_SUBMISSION_COST_CUSTOM_GATEWAY
}

if (-not [string]::IsNullOrWhiteSpace($REGISTER_MAX_SUBMISSION_COST_ROUTER)) {
    $env:REGISTER_MAX_SUBMISSION_COST_ROUTER = $REGISTER_MAX_SUBMISSION_COST_ROUTER
}

if (-not [string]::IsNullOrWhiteSpace($BRIDGE_L1_GAS_LIMIT)) {
    $env:BRIDGE_L1_GAS_LIMIT = $BRIDGE_L1_GAS_LIMIT
}

if (-not [string]::IsNullOrWhiteSpace($BRIDGE_L2_MAX_GAS)) {
    $env:BRIDGE_L2_MAX_GAS = $BRIDGE_L2_MAX_GAS
}

if (-not [string]::IsNullOrWhiteSpace($BRIDGE_MAX_SUBMISSION_COST)) {
    $env:BRIDGE_MAX_SUBMISSION_COST = $BRIDGE_MAX_SUBMISSION_COST
}

if (-not [string]::IsNullOrWhiteSpace($BRIDGE_L2_CALL_VALUE_WEI)) {
    $env:BRIDGE_L2_CALL_VALUE_WEI = $BRIDGE_L2_CALL_VALUE_WEI
}

if (-not [string]::IsNullOrWhiteSpace($BRIDGE_CALL_HOOK_DATA)) {
    $env:BRIDGE_CALL_HOOK_DATA = $BRIDGE_CALL_HOOK_DATA
}


# Шаг 5. Установка зависимостей
if ($RUN_INSTALL) {
    # Вызов через cmd.exe нужен, чтобы PowerShell ISE не превращал stderr от npx в NativeCommandError.
    $installOutput = cmd.exe /d /c "npx pnpm@9.1.3 install --frozen-lockfile 2>&1"
    $installExitCode = $LASTEXITCODE
    if ($installOutput) {
        $installOutput | ForEach-Object { Write-Host $_ }
    }
    if ($installExitCode -ne 0) {
        throw 'Установка зависимостей завершилась с ошибкой.'
    }
}
else {
    Write-Host 'Шаг установки пропущен.' -ForegroundColor Yellow
}


# Шаг 6. Компиляция контрактов
if ($RUN_COMPILE) {
    $compileOutput = cmd.exe /d /c "npx hardhat compile 2>&1"
    $compileExitCode = $LASTEXITCODE
    if ($compileOutput) {
        $compileOutput | ForEach-Object { Write-Host $_ }
    }
    if ($compileExitCode -ne 0) {
        throw 'Компиляция завершилась с ошибкой.'
    }
}
else {
    Write-Host 'Шаг компиляции пропущен.' -ForegroundColor Yellow
}


# Шаг 7. Деплой L1 XPNT в Ethereum mainnet
$l1Output = cmd.exe /d /c "npx hardhat run scripts/deploy-l1-xpnt.js --network mainnet 2>&1"
$l1ExitCode = $LASTEXITCODE
if ($l1Output) {
    $l1Output | ForEach-Object { Write-Host $_ }
}
if ($l1ExitCode -ne 0) {
    throw 'Деплой L1 XPNT завершился с ошибкой.'
}

$l1Text = $l1Output -join "`n"
$l1AddressMatch = [regex]::Match($l1Text, 'deployed to:\s*(0x[a-fA-F0-9]{40})')
if (-not $l1AddressMatch.Success) {
    throw 'Не удалось извлечь адрес L1 XPNT из вывода deploy-l1-xpnt.js.'
}

$L1_XPNT_TOKEN_ADDRESS = $l1AddressMatch.Groups[1].Value
$env:L1_XPNT_TOKEN_ADDRESS = $L1_XPNT_TOKEN_ADDRESS

$l1ReceiverMatch = [regex]::Match($l1Text, 'Initial Supply will be received by:\s*(0x[a-fA-F0-9]{40})')
if ($l1ReceiverMatch.Success) {
    $L1_GENESIS_RECEIVER_ADDRESS_ACTUAL = $l1ReceiverMatch.Groups[1].Value
}
else {
    $L1_GENESIS_RECEIVER_ADDRESS_ACTUAL = $XPNT_GENESIS_RECEIVER_ADDRESS
}

Write-Host "L1 XPNT address: $L1_XPNT_TOKEN_ADDRESS" -ForegroundColor Green


# Шаг 8. Деплой L2 XPNTL2 proxy в Arbitrum One
$l2Output = cmd.exe /d /c "npx hardhat run scripts/deploy-l2-xpnt.js --network arbitrum 2>&1"
$l2ExitCode = $LASTEXITCODE
if ($l2Output) {
    $l2Output | ForEach-Object { Write-Host $_ }
}
if ($l2ExitCode -ne 0) {
    throw 'Деплой L2 XPNTL2 завершился с ошибкой.'
}

$l2Text = $l2Output -join "`n"
$l2AddressMatch = [regex]::Match($l2Text, 'deployed to:\s*(0x[a-fA-F0-9]{40})')
if (-not $l2AddressMatch.Success) {
    throw 'Не удалось извлечь адрес L2 XPNT из вывода deploy-l2-xpnt.js.'
}

$L2_XPNT_TOKEN_ADDRESS = $l2AddressMatch.Groups[1].Value
$env:L2_XPNT_TOKEN_ADDRESS = $L2_XPNT_TOKEN_ADDRESS
$env:L2_XPNTL2_TOKEN_ADDRESS = $L2_XPNT_TOKEN_ADDRESS

Write-Host "L2 XPNT address: $L2_XPNT_TOKEN_ADDRESS" -ForegroundColor Green


# Шаг 9. Регистрация L1 токена в Arbitrum bridge и test bridge
if ($RUN_BRIDGE) {
    $bridgeOutput = cmd.exe /d /c "npx hardhat run scripts/register-and-bridge.js --network mainnet 2>&1"
    $bridgeExitCode = $LASTEXITCODE
    if ($bridgeOutput) {
        $bridgeOutput | ForEach-Object { Write-Host $_ }
    }
    if ($bridgeExitCode -ne 0) {
        throw 'Register/bridge шаг завершился с ошибкой.'
    }
}
else {
    Write-Host 'Шаг register-and-bridge пропущен.' -ForegroundColor Yellow
}


# Шаг 10. Сохранение краткого manifest в deployments
$deploymentDir = Join-Path $repoRoot 'deployments'
if (-not (Test-Path $deploymentDir)) {
    New-Item -ItemType Directory -Path $deploymentDir | Out-Null
}

$manifestPath = Join-Path $deploymentDir 'xpnt-mainnet-arbitrum.latest.json'
$manifest = [ordered]@{
    timestamp = (Get-Date).ToString('o')
    l1 = [ordered]@{
        network = 'mainnet'
        tokenAddress = $L1_XPNT_TOKEN_ADDRESS
        routerAddress = $L1_ROUTER_ADDRESS
        gatewayAddress = $L1_GATEWAY_ADDRESS
        genesisReceiverAddress = $L1_GENESIS_RECEIVER_ADDRESS_ACTUAL
    }
    l2 = [ordered]@{
        network = 'arbitrum'
        tokenAddress = $L2_XPNT_TOKEN_ADDRESS
        gatewayAddress = $L2_GATEWAY_ADDRESS
    }
    bridge = [ordered]@{
        attempted = $RUN_BRIDGE
        amount = $XPNT_BRIDGE_TEST_AMOUNT
        destinationAddress = $BRIDGE_DESTINATION_ADDRESS
    }
}

$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $manifestPath -Encoding UTF8


# Шаг 11. Итог
Write-Host ''
Write-Host 'Deployment summary' -ForegroundColor Green
Write-Host "L1 XPNT address: $L1_XPNT_TOKEN_ADDRESS"
Write-Host "L2 XPNT address: $L2_XPNT_TOKEN_ADDRESS"
Write-Host "Manifest: $manifestPath"
