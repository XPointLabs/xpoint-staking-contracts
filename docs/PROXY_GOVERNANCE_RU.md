# Управление Proxy и Governance для DeepSession (RU)

**Статус**: Архитектурная рекомендация для производства
**Важность**: 🚨 CRITICAL для защиты стейкеров и инвесторов
**Дата**: 2026-06-18

---

## 1. Текущая архитектура (ДО внедрения защит)

### Deployment модель

```
Владелец EOA (например, deployer@team.com)
        ↓
        ├─ owner() в ServiceNodeRewards
        └─ proxy admin в TransparentProxy
        ↓
Может вызвать:
        ├─ upgradeToAndCall() — развернуть новую версию
        ├─ setStakingRequirement() — изменить требования
        └─ pause() / unpause() — заморозить контракт
```

### Проблемы текущей архитектуры

| Проблема | Риск | Влияние |
|---|---|---|
| **Одна EOA как proxy admin** | Компромисс приватного ключа | Полное изъятие буфера |
| **Нет timelock** | Моментальный upgrade | Операторы не могут вывести стейк |
| **Нет governance** | Централизованное решение | Инвесторы не имеют голоса |
| **Нет многоподписи** | Один человек = диктатор | Single point of failure |

---

## 2. Рекомендуемая архитектура (Фаза 1: Multisig + Timelock)

### 2.1 Компоненты

```
XPNT Stakers & Operators
    ↓
    └─→ Can monitor ────→ ChainLink Events & Logs

Governance Layer:
┌─────────────────────────────────────────┐
│ Multisig (3/5 Signers)                  │
│ ├─ Сигнер 1: Tech Lead (DeepSession)   │
│ ├─ Сигнер 2: Finance Lead              │
│ ├─ Сигнер 3: Investor Rep              │
│ ├─ Сигнер 4: Validator Operator        │
│ └─ Сигнер 5: Backup / Reserved         │
└─────────────────────────────────────────┘
    ↓
    └─→ proposeUpgrade() ──→ TimelockController (14 дней)

TimelockController:
┌─────────────────────────────────────────┐
│ Delay: 14–30 дней                      │
│ ├─ schedule() — планирует upgrade      │
│ ├─ [WAITING PERIOD]                     │
│ └─ execute() — выполняет upgrade       │
└─────────────────────────────────────────┘
    ↓
    └─→ upgradeToAndCall() ──→ ServiceNodeRewards (new impl)

    Параллельно:
    └─→ Stakers notified ──→ Can exit if disagree
```

### 2.2 Фактическая кодовая архитектура

**Компонент A: TimelockController (OpenZeppelin)**

```solidity
// hardhat.config.js — при развертывании

const TIMELOCK_DELAY = 14 * 24 * 3600; // 14 дней
const PROPOSER_ROLE = ethers.id("PROPOSER_ROLE");
const EXECUTOR_ROLE = ethers.id("EXECUTOR_ROLE");
const ADMIN_ROLE = ethers.id("TIMELOCK_ADMIN_ROLE");

const timelockController = await ethers.deployContract("TimelockController", [
    TIMELOCK_DELAY,           // minDelay
    [multisigAddress],        // proposers (только multisig может propose)
    [ethers.ZeroAddress],     // executors (anyone can execute after delay)
    multisigAddress           // admin (multisig админ)
]);

// TimelockController становится proxy admin
const transparentProxy = ProxyAdmin(proxyAddress);
transparentProxy.transferOwnership(timelockController.address);
```

**Компонент B: Multisig (Gnosis Safe на Arbitrum)**

```
Gnosis Safe (3/5):
├─ Тип: Standard (не Custom)
├─ Сеть: Arbitrum One
├─ Собственники: 5 адресов (разные люди, разные хранилища)
└─ Пороговое одобрение: 3 / 5 подписей
```

Адреса собственников:
```
1. Alice (Tech Lead)    — 0xAA...
2. Bob (Finance)        — 0xBB...
3. Carol (Investor)     — 0xCC...
4. Dave (Validator)     — 0xDD...
5. Eve (Reserve)        — 0xEE...
```

**Компонент C: Upgrade Process**

```
Week 1: Issue discovered → Create fix → Create new implementation

Week 2: Multisig member creates proposal
        Proposal: [
            target: ServiceNodeRewards proxy,
            function: upgradeToAndCall(...newImpl, initData),
            delay: 14 days
        ]

        Multisig签署: Alice ✓, Bob ✓, Carol ✓ → Submitted ✓

Week 3–4: [WAITING PERIOD — 14 дней]
          Stakers можно:
          - Monitor logs
          - Withdraw если не согласны
          - Подготовиться к upgrade

Week 5: execute() вызывается → upgrade применяется
```

---

## 3. Пошаговое внедрение Multisig + Timelock

### 3.1 Этап 1: Развертывание (Before Mainnet)

#### Шаг 1.1: Создать Gnosis Safe на Arbitrum Sepolia (UAT)

```bash
# Используя Gnosis Safe Web UI:
# 1. Go to https://app.safe.global/
# 2. Create → New Safe
# 3. Network: Arbitrum Sepolia
# 4. Signers: 5 адресов (test EOAs)
# 5. Threshold: 3/5
# 6. Save Safe address (e.g., 0xSAFE...)
```

#### Шаг 1.2: Развернуть TimelockController

```solidity
// scripts/deploy-timelock.js

const hre = require("hardhat");

async function main() {
    const TIMELOCK_DELAY = 14 * 24 * 3600; // 14 дней
    const MULTISIG_ADDRESS = "0xSAFE..."; // Gnosis Safe адрес

    const TimelockController = await hre.ethers.getContractFactory("TimelockController");

    const timelockController = await TimelockController.deploy(
        TIMELOCK_DELAY,          // minDelay: 14 дней
        [MULTISIG_ADDRESS],      // proposers: только multisig может propose
        [hre.ethers.ZeroAddress], // executors: anyone can execute
        MULTISIG_ADDRESS         // admin: multisig управляет timelock
    );

    await timelockController.waitForDeployment();
    console.log("TimelockController deployed to:", await timelockController.getAddress());

    // Grant PROPOSER и EXECUTOR roles
    const PROPOSER_ROLE = await timelockController.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelockController.EXECUTOR_ROLE();

    await timelockController.grantRole(PROPOSER_ROLE, MULTISIG_ADDRESS);
    await timelockController.grantRole(EXECUTOR_ROLE, hre.ethers.ZeroAddress); // anyone

    console.log("Roles granted");
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
```

#### Шаг 1.3: Переместить proxy admin на TimelockController

```javascript
// scripts/transfer-proxy-admin.js

const hre = require("hardhat");

async function main() {
    const PROXY_ADDRESS = "0xSNR..."; // ServiceNodeRewards proxy
    const TIMELOCK_ADDRESS = "0xTIMELOCK...";

    // Подключиться к proxy admin (текущий owner)
    const proxyAdmin = await hre.ethers.getContractAt("ProxyAdmin", PROXY_ADDRESS);

    // Передать ownership на TimelockController
    await proxyAdmin.transferOwnership(TIMELOCK_ADDRESS);

    console.log("Proxy admin transferred to TimelockController:", TIMELOCK_ADDRESS);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
```

### 3.2 Этап 2: Тестирование (UAT)

#### Тестовый сценарий: Propose upgrade

```javascript
// test/upgrade-via-timelock.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Upgrade via TimelockController", () => {
    let timelockController, multisig, serviceNodeRewards, newImpl;
    const TIMELOCK_DELAY = 14 * 24 * 3600; // 14 дней

    beforeEach(async () => {
        // Deploy TimelockController, Multisig, SNR proxy, etc.
        // ... setup code ...
    });

    it("Should propose upgrade and execute after delay", async () => {
        // 1. Deploy новую версию
        const SNRv2 = await ethers.getContractFactory("ServiceNodeRewardsV2");
        newImpl = await SNRv2.deploy();

        // 2. Prepare upgrade call data
        const upgradeData = serviceNodeRewards.interface.encodeFunctionData(
            'upgradeToAndCall',
            [newImpl.address, "0x"] // initData пусто
        );

        // 3. Propose via Multisig
        const salt = ethers.id("upgrade-1");
        const txHash = ethers.id(
            ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes", "bytes32"],
                [serviceNodeRewards.address, upgradeData, salt]
            )
        );

        // Multisig signatory 1 proposes
        const proposeTx = await timelockController.schedule(
            serviceNodeRewards.address,
            0,
            upgradeData,
            salt,
            TIMELOCK_DELAY
        );

        // 4. Wait 14 days (in test: use time travel)
        await ethers.provider.send("hardhat_mine", ["0x" + (14 * 24 * 3600 / 12).toString(16)]);

        // 5. Execute upgrade
        const executeTx = await timelockController.execute(
            serviceNodeRewards.address,
            0,
            upgradeData,
            salt
        );

        await expect(executeTx).to.emit(timelockController, "ExecutionSuccess");

        // 6. Verify new implementation
        const impl = await ethers.provider.getStorageAt(serviceNodeRewards.address, "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d4e31a9");
        expect(impl).to.equal("0x" + newImpl.address.slice(2).padStart(64, "0"));
    });

    it("Should NOT allow direct upgrade without timelock", async () => {
        // Try to upgrade directly (should fail)
        const SNRv2 = await ethers.getContractFactory("ServiceNodeRewardsV2");
        newImpl = await SNRv2.deploy();

        await expect(
            serviceNodeRewards.upgradeToAndCall(newImpl.address, "0x")
        ).to.be.reverted; // Proxy is owned by TimelockController, not EOA
    });
});
```

---

## 4. Governance Roadmap: Фазы управления

### Фаза 1: Multisig + Timelock (месяцы 0–12)

**Конфигурация**:
- Multisig: 3/5 (3 зависимые подписи из 5)
- Timelock delay: 14 дней
- Сигнеры: Tech lead, Finance, Investor rep, Validator, Backup

**Преимущества**:
- ✅ Защита от компромисса single EOA
- ✅ Стейкеры имеют 14 дней на выход
- ✅ Прозрачность через события

**Недостатки**:
- ❌ Все ещё централизованно (никакого DAO голосования)
- ❌ Требует доверия к сигнерам

### Фаза 2: Governance DAO (месяцы 12–24)

**План**:
- Развернуть Governance токен (или использовать XPNT)
- Заменить multisig на Governor контракт (OpenZeppelin)
- Требует 40%+ голоса для proposal, 50% для execute

**Конфигурация Governor**:
```solidity
Governor {
    votingDelay: 1 block (15 minutes)
    votingPeriod: 50,400 blocks (1 week)
    proposalThreshold: 1,000,000 XPNT (0.4% supply)
    quorumNumeratorUpdated: 4 (4% quorum)
}
```

**Процесс**:
```
Holder 1,000,000+ XPNT creates proposal:
    ↓
1 week voting period (anyone can vote)
    ↓
50%+ votes: passes → TimelockController
    ↓
14 days delay → Execute
    ↓
Upgrade deployed
```

### Фаза 3: Off-Chain Governance (месяцы 24+)

**Модель**:
- Snapshot голосования для non-binding decisions
- Emergency multisig (3/5) только для критических патчей
- Все стратегические решения через DAO

---

## 5. Риски и защита

### Риск 5.1: Multisig членов скомпрометирована

**Сценарий**: Хакер получает приватные ключи 3 из 5 сигнеров → может выполнить upgrade

**Защита**:
- Hardware wallets (Ledger, Trezor) для всех сигнеров
- Social recovery (Argent, gnosis-safe guard) для восстановления
- Страхование (Nexus Mutual) на случай взлома
- Emergency pause в контракте (может вызвать 1 сигнер, разморожает через 2 недели)

### Риск 5.2: TimelockController скомпрометирован

**Сценарий**: Хакер меняет `minDelay` на 0 → может upgrade моментально

**Защита**:
- Не давать никакому адресу роль ADMIN на TimelockController
- Если требуется admin access — использовать вторую multisig (более strict)

### Риск 5.3: Frontrunning upgrade

**Сценарий**: Злоумышленник видит пропозицию upgrade → создает параллельную пропозицию

**Защита**:
- Upgrade пропозиции подписываются off-chain (EIP-712) перед публикацией
- Только multisig может create proposal
- Duplicate propositions невозможны (проверка salt/txHash)

---

## 6. Implementation Checklist

Перед **mainnet deployment**:

- [ ] **Multisig создана** на Arbitrum (тестировано в Sepolia)
- [ ] **TimelockController развернут** и протестирован
- [ ] **Proxy admin трансферирован** на TimeLogController
- [ ] **Security audit** пройден (Certik на TimelockController + Multisig конфиг)
- [ ] **Сигнеры обучены** использовать Gnosis Safe
- [ ] **Emergency procedures документированы** (что делать если multisig сломана)
- [ ] **Investors notified** о governance архитектуре
- [ ] **Testnet simulation** upgrade процесса (14-дневный timelock пройден успешно)
- [ ] **Monitoring setup**: Alerting при propose/schedule события

---

## 7. Документирование для стейкеров

### Сообщение инвесторам (Template)

```
📋 DeepSession Governance Security Update

Привет, инвесторы и стейкеры!

Мы реализовали многоуровневую защиту для управления контрактами:

✅ **Multisig 3/5**: Требуется 3 независимые подписи для любого upgrade
✅ **14-дневный Timelock**: У вас есть 2 недели для выхода если не согласны
✅ **Roadmap к DAO**: После 12 месяцев управление перейдет на decentralized voting

📊 Текущие сигнеры:
1. Alice (Tech Lead) — @alice_twitter
2. Bob (CFO) — @bob_investor
3. Carol (Community Lead) — @carol_community
4. Dave (Validator) — @dave_validator
5. Eve (Reserve) — @eve_backup

🔍 Мониторинг: Все пропозиции видны на:
- https://gnosisscan.io/address/0xSAFE...
- TimelockController events на https://arbiscan.io/

❓ Вопросы? Читайте документацию: /docs/PROXY_GOVERNANCE_RU.md
```

---

## Заключение

Переход на **Multisig + Timelock** архитектуру критически важен для защиты стейкеров. Это демонстрирует commitment к децентрализации и снижает риск единоличного контроля.

**Временная линия**:
- **Сейчас (июнь 2026)**: Развернуть multisig + timelock на mainnet
- **Сентябрь 2026**: Запустить Governor DAO contract (еще в testing)
- **Январь 2027**: Transferт proxy admin на Governor (full governance)
