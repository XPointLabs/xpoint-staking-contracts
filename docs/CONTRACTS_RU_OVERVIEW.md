# DeepSession: подробный обзор контрактов (RU)

Обновлено: 2026-06-18.

Документ описывает текущие контракты в deepsession-staking-contracts, их связи между собой, известные UAT-адреса и отличия относительно оригинальных Session-контрактов из source/session-token-contracts.

## 1) Карта контрактов

Текущий набор основных контрактов:

1. XPNT.sol
2. XPNTL2.sol
3. ServiceNodeRewards.sol
4. ServiceNodeContributionFactory.sol
5. ServiceNodeContribution.sol
6. RewardRatePool.sol
7. SubscriptionManager.sol
8. OpsBudgetEscrow.sol

Также используются интерфейсы в contracts/interfaces и криптобиблиотеки в contracts/libraries.

## 2) Что делает каждый контракт

## 2.1 XPNT (L1 токен)

Файл: contracts/XPNT.sol

Назначение:

- Основной ERC20 токен экосистемы XPoint (XPNT) в L1.
- Mint genesis supply происходит один раз в constructor.
- Поддерживает ERC20Permit.
- Поддерживает Arbitrum Custom Gateway регистрацию токена через registerTokenOnL2.

Ключевые свойства:

- Десятичность: 9.
- Версия: VERSION = 2.
- Не upgradeable (обычный constructor, immutable gateway/router).

Практический вывод:

- L1 токен фиксирован по коду деплоя и не обновляется через proxy.

## 2.2 XPNTL2 (L2 токен)

Файл: contracts/XPNTL2.sol

Назначение:

- L2 представление XPNT в сети Arbitrum.
- Контракт upgradeable (Initializable + ERC20Upgradeable).
- Используется Arbitrum gateway-модель: bridgeMint и bridgeBurn доступны только l2Gateway.

Ключевые свойства:

- Десятичность: 9.
- Версия: VERSION = 2.
- Инициализация через initialize(l2Gateway, l1Address).

Практический вывод:

- Логика L2 может обновляться через proxy-админ.

## 2.3 ServiceNodeRewards

Файл: contracts/ServiceNodeRewards.sol

Назначение:

- Центральный staking/rewards контракт для сервис-нод.
- Хранит список нод (двусвязный список с sentinel).
- Валидирует BLS подписи (в текущем форке на BLS12-381 precompile path).
- Ведет учет recipient rewards/claimed.
- Выполняет claimRewards.
- Регистрирует ноды, инициирует/выполняет выход, ликвидации.

Ключевые подсистемы:

1. Rewards flow:
- updateRewardsBalance(recipient, rewards, blsSig, nonSigners)
- claimRewards() и claimRewards(amount)
- Ограничения claimThreshold/claimCycle.

2. Node lifecycle:
- addBLSPublicKey(...)
- initiateExitBLSPublicKey(serviceNodeId)
- exitBLSPublicKeyWithSignature(...)
- exitBLSPublicKeyAfterWaitTime(...)
- liquidateBLSPublicKeyWithSignature(...)

3. Governance:
- start, pause/unpause
- setStakingRequirement
- setSignatureExpiry
- setBLSNonSignerThresholdMax
- setClaimThreshold
- setClaimCycle
- setLiquidationRatios

Особенность ликвидации:

- Доля poolShareOfLiquidationRatio отправляется не напрямую переводом баланса в pool, а через approve + rewardPool.deposit(...), чтобы в RewardRatePool корректно работала модель “realize-accrual-before-new-funds”.

## 2.4 ServiceNodeContributionFactory

Файл: contracts/ServiceNodeContributionFactory.sol

Назначение:

- Фабрика для создания multi-contribution контрактов ServiceNodeContribution.
- В текущем форке применяет minimal proxies (EIP-1167, Clones.clone).

Ключевые функции:

- deploy(...): клонирует implementation и вызывает initialize.
- owns(address): проверка, что контракт создан этой фабрикой.
- pause/unpause.

## 2.5 ServiceNodeContribution

Файл: contracts/ServiceNodeContribution.sol

Назначение:

- Сбор вкладов (stake) от оператора и/или публичных контрибьюторов.
- Поддержка reserved contributions.
- Автофинализация или ручная финализация.
- Регистрация ноды в ServiceNodeRewards после полного набора stake.

Основная машина состояний:

1. WaitForOperatorContrib
2. OpenForPublicContrib
3. WaitForFinalized
4. Finalized

Ключевые функции:

- contributeFunds(amount, beneficiary)
- finalize()
- reset()
- resetUpdateAndContribute(...)
- withdrawContribution()
- updatePubkeys, updateFee, updateReservedContributors, updateManualFinalize

Особенности:

- Проверка инвариантов maxContributors/stakingRequirement против ServiceNodeRewards.
- Защита минимальных вкладов, лимитов и задержки withdraw.

## 2.6 RewardRatePool

Файл: contracts/RewardRatePool.sol

Назначение:

- Пул, из которого постепенно высвобождаются rewards в beneficiary (обычно ServiceNodeRewards).
- Используется simple annual payout rate 15.1% (приближение к 14% effective annual outflow при частом “срезе”).

Ключевые функции:

- payoutReleased(): реализует накопленную выплату.
- deposit(amount): сначала фиксирует накопленную выплату, потом принимает новый депозит.
- checkpoint(): принудительно фиксирует накопленную выплату без нового депозита.
- rewardRate(), calculateReleasedAmount(), calculatePayoutAmount(...).

Важные детали реализации:

- Добавлены ReentrancyGuard и nonReentrant.
- release ограничивается текущим балансом пула (страховка от out-of-balance payout).
- При депозите нет ретроактивного начисления на свежевнесенные средства.

## 2.7 SubscriptionManager

Файл: contracts/SubscriptionManager.sol

Назначение:

- Контракт подписок, giftable-покупок и распределения платежа по экономическим потокам.
- Подписка привязана к recipientAlias (bytes32), а не к raw Session ID.

Модель покупки:

- План (planId): priceAtomic + durationSeconds + active.
- purchaseForAlias(...): проверяет alias grant подпись (EIP-712), anti-replay purchaseRef и периоды.

Сплит платежа:

- 40% в RewardRatePool.deposit(...)
- 20% в permanentTreasurySafe
- 40% в OpsBudgetEscrow.depositCurrentEpoch(...)

## 2.8 OpsBudgetEscrow

Файл: contracts/OpsBudgetEscrow.sol

Назначение:

- Хранение ops-бюджета по эпохам.
- Ops claimer может забрать часть в claim window закрытой эпохи.
- После окна остаток может быть permissionless swept обратно в RewardRatePool.

Ключевые функции:

- depositCurrentEpoch(amount)
- claimClosedEpoch(epochId, amount, to)
- sweepExpiredEpoch(epochId)
- currentEpochId(), claimable(epochId), epochTimes(epochId)

## 3) Как связаны контракты между собой

Основной runtime-поток:

1. Пользователь платит XPNT в SubscriptionManager.
2. SubscriptionManager распределяет сумму:
   - RewardRatePool (40%)
   - Permanent reserve (20%)
   - OpsBudgetEscrow (40%)
3. RewardRatePool при checkpoint/payoutReleased переводит часть XPNT в beneficiary (ServiceNodeRewards).
4. ServiceNodeRewards выплачивает claimRewards получателям, если баланс есть и подпись/лимиты валидны.
5. Стейкинг ноды идет через ServiceNodeContribution(Factory) -> ServiceNodeRewards.addBLSPublicKey.

## 4) UAT: известные адреса и параметры

Источник: deepsession-devops/docs/UAT_DEPLOYMENT.md (обновлено 2026-06-18).

Сеть:

- Arbitrum Sepolia (chainId 421614).

Контракты:

- XPNT_TOKEN_ADDRESS: 0x992E6EA54d74e79cd2CEC8D9fBD101a9a105ace5
- SERVICE_NODE_REWARDS_ADDRESS: 0x08A5a47E67fCd18e14AdFB535e8d8644476D4197
- SERVICE_NODE_CONTRIBUTION_FACTORY_ADDRESS: 0x34e50278dbeDdB0F8EC7641D2304CFf4F116066b
- SERVICE_NODE_CONTRIBUTION_IMPLEMENTATION_ADDRESS: 0x0561C7aEee3F72a14796BD5ed5b35622eC5ef4D2
- REWARD_RATE_POOL_ADDRESS: 0xe055c7200aE13984fe66c2e8AaC608bC80E19D57
- UAT_CONTRACT_START_BLOCK: 276115489
- STAKING_REQUIREMENT_ATOMIC: 120000000000 (120 XPNT при 9 decimals)

Дополнительно (операционный UAT deployer):

- 0xb0cE3b1229c00d1B85c7083E31Dae531f3B352C0

## 5) Почему checkpoint вызывается раз в 5 минут

Кто вызывает:

- Сервис staking-reward-keeper в deepsession-devops/docker-compose.uat.yml.

Интервал:

- CHECKPOINT_INTERVAL_MS по умолчанию 300000 мс, то есть 5 минут.

Что делает метод checkpoint:

- checkpoint() в RewardRatePool вызывает внутренний _payoutReleased().
- Рассчитывается накопленный с прошлого release объем payout.
- Этот объем переводится из RewardRatePool в beneficiary (в UAT это ServiceNodeRewards).
- Обновляются totalPaidOut и lastPaidOutTime.

Зачем это нужно:

1. Чтобы накопленный reward из пула реально поступал в ServiceNodeRewards, откуда пользователи потом могут claimRewards.
2. Чтобы не ждать редких ручных вызовов payoutReleased().
3. Чтобы сгладить ликвидность reward-выплат: средства “подтекают” в rewards контракт регулярно.
4. Чтобы не слать лишние транзакции при очень маленьком приросте, в keeper есть порог MIN_RELEASE_ATOMIC (по умолчанию 1 XPNT в atomic).

Важно:

- Без checkpoint средства не исчезают и не теряются, но остаются в RewardRatePool и не оказываются на балансе ServiceNodeRewards до фиксации payout.

## 6) Что изменено относительно Session (source/session-token-contracts)

Ниже основные доработки DeepSession относительно исходников Session.

## 6.1 Токен и брендинг

1. SESH -> XPNT:
- SESH.sol заменен на XPNT.sol.
- SESHL2.sol заменен на XPNTL2.sol.
- Название/тикер: Session Token/SESH -> XPoint/XPNT.
- Десятичность 9 сохранена.

2. Бридж-логика L1/L2 сохранила ту же модель custom gateway, но работает с XPNT.

## 6.2 Криптография и precompiles

1. ServiceNodeRewards и связанный стек переведен с BN256 path на BLS12-381/EIP-2537 path:
- Pairing/BN256G1/BN256G2 -> BLS12381.

2. Форматы структур BLS подписи в интерфейсах упрощены под bytes signature.

## 6.3 RewardRatePool существенно усилен

В Session RewardRatePool:

- Был только payoutReleased() без deposit/checkpoint.
- Не было отдельной защиты от reentrancy.

В DeepSession RewardRatePool:

- Добавлены deposit(amount) и checkpoint().
- Добавлен ReentrancyGuard.
- Добавлен cap release текущим балансом.
- Добавлено событие Deposited.
- Логика deposit сначала фиксирует accrual, затем принимает новый депозит (корректная экономическая модель).

Это ключевая функциональная доработка для подписочной экономики и ops sweep.

## 6.4 Liquidation pool transfer path

В Session ServiceNodeRewards:

- pool доля ликвидации переводилась напрямую в foundationPool через safeTransfer.

В DeepSession ServiceNodeRewards:

- pool доля отправляется через approve + IRewardPoolDeposit.deposit(...).

Причина:

- Чтобы RewardRatePool корректно учитывал момент поступления новых средств и не начислял на них payout “задним числом”.

## 6.5 ServiceNodeContributionFactory/ServiceNodeContribution переведены на upgradeable-friendly модель инстанцирования

В Session:

- Factory создавал полноценный новый контракт через constructor.
- В ServiceNodeContribution было много immutable полей.

В DeepSession:

- Factory использует Clones.clone (минимальные прокси).
- ServiceNodeContribution стал Initializable, параметры задаются через initialize.
- Это уменьшает стоимость инстанцирования и дает более гибкий deploy/maintenance контур.

## 6.6 Новые контракты, которых нет в оригинале Session token contracts

1. SubscriptionManager.sol
2. OpsBudgetEscrow.sol

Это DeepSession-расширение токеномики:

- giftable subscriptions по alias;
- EIP-712 alias grant;
- revenue split 40/20/40;
- epoch-based ops budget с возвратом неиспользованного остатка в rewards.

## 6.7 Сохранено из Session почти без изменений

1. Базовая логика service node lifecycle:
- add key, initiate exit, signed exit/liquidation, seed list.

2. Модель claimRewards с лимитами по циклу.

3. Multi-contribution state machine и reserved contributors логика.

## 7) Практические замечания по эксплуатации

1. Если в UAT/production не работает периодический checkpoint, баланс ServiceNodeRewards может быть ниже ожидаемого при активных начислениях в RewardRatePool.
2. Для L2 токена XPNTL2 обновления логики возможны (proxy), для L1 XPNT нет.
3. Для изменения экономических параметров (plans, claim windows, ratios) нужно учитывать влияние на backend projection и портал.

---

## 8) Глубокий анализ: checkpoint vs payoutReleased, общий баланс, модели и риски

### 8.1 Кто на самом деле вызывал payoutReleased в Session

В репозитории source/session-token-contracts нет ни одного keeper-а, cron-а или автоматического вызова `payoutReleased()` внутри других контрактов. Функция объявлена как `public` без каких-либо прав доступа.

Вызовы в самом репозитории встречаются только в unit-тестах:

```
source/session-token-contracts/test/unit-js/RewardRatePool.js:72
source/session-token-contracts/test/unit-js/RewardRatePool.js:85
```

**Практический вывод**: в продакшен Session вызов `payoutReleased()` — это редкая ручная операция команды (или, возможно, внешнего бота, не публикуемого в репозитории). Её можно делать раз в день, раз в неделю — это не критично по причине, описанной ниже.

---

### 8.2 Почему в Session это не критично: природа баланса ServiceNodeRewards

ServiceNodeRewards держит **один ERC20 баланс** (`designatedToken.balanceOf(address(this))`), в котором смешаны:

```
balance(ServiceNodeRewards) = Σ(staking deposits всех нод) + Σ(переводы из RewardRatePool)
```

В продакшен Session на момент запуска было засеяно тысячи нод через `seedPublicKeyList`, каждая с депозитом `stakingRequirement`. При stakingRequirement = 20 000 SESH и, например, 2000 нод это:

```
staking buffer ≈ 2000 × 20 000 = 40 000 000 SESH
суточные rewards при 14% годовых от pool ≈ сотни тысяч SESH
```

Стейкинговый буфер **в 100+ раз больше** суточных reward-выплат. Поэтому claim всегда проходит — токенов хватает от залогов, даже если `payoutReleased` давно не вызывался.

При этом функция `_exitBLSPublicKey` при выходе ноды возвращает её депозит обратно стейкерам через `safeTransfer`, что уменьшает буфер. Но это происходит медленно.

---

### 8.3 Платятся ли rewards из стейка — ответ

**Да, технически да.** Никакой бухгалтерской изоляции между стейк-депозитами и reward-средствами нет. `_claimRewards` делает:

```solidity
SafeERC20.safeTransfer(designatedToken, claimingAddress, amount);
// contracts/ServiceNodeRewards.sol:313
```

Это прямой перевод с баланса контракта. Контракт не различает "это стейк" и "это rewards". Если на балансе 40 000 000 SESH от стейков и 0 от пула, а кто-то запрашивает 100 SESH rewards — токены физически придут из стейков.

**Это не ошибка**, это осознанная архитектура: пул предназначен для долгосрочного восполнения баланса. Пока ноды активны и не выходят, их стейки остаются в контракте как буфер.

---

### 8.4 Может ли сумма записанных rewards превысить все доступные балансы?

Это ключевой вопрос о платёжеспособности. Разберём по уровням.

#### Уровень 1: может ли backend выдать подпись на сумму больше, чем баланс ServiceNodeRewards?

**Да, теоретически может.** `updateRewardsBalance` принимает сумму из BLS-подписи backend-а и просто записывает её в `recipients[addr].rewards`. Контракт не проверяет:

```solidity
recipients[recipientAddress].rewards = recipientRewards;
// contracts/ServiceNodeRewards.sol:283
```

Нет никакого `require(recipientRewards <= balance)`. Проверка происходит только в момент фактического `safeTransfer` при клейме — там ERC20 просто откатится если токенов нет.

#### Уровень 2: что ограничивает накопление долга по rewards?

1. **claimThreshold / claimCycle** — ограничивают, сколько можно вывести за цикл (`claimCycle = 12 часов`, `claimThreshold = 1 000 000 XPNT`). Это не защита от переполнения баланса, а anti-drain-attack.

2. **Реальный баланс RewardRatePool** — пул не может выпустить больше, чем в нём есть. `_payoutReleased` ограничивает release текущим балансом:
   ```solidity
   if (released > currentBalance) {
       released = currentBalance;
   }
   // contracts/RewardRatePool.sol:106-108
   ```

3. **Пополнение из подписок** — SubscriptionManager направляет 40% платежей в RewardRatePool. Если подписки есть, пул пополняется.

#### Уровень 3: полная картина платёжеспособности

Система платёжеспособна, если в любой момент выполняется:

```
balance(ServiceNodeRewards) ≥ Σ(recipients[i].rewards - recipients[i].claimed)
```

Левая часть (источники):
- Стейкинговые депозиты нод
- Регулярные переводы из RewardRatePool через checkpoint

Правая часть (обязательства):
- Накопленные и ещё не выплаченные rewards

**Риск разрыва возникает если:**

1. Backend выдаёт подписи на суммы, которые превышают то, что реально находится в ServiceNodeRewards
2. Staking buffer мал (мало нод) и checkpoint давно не вызывался
3. RewardRatePool пуст (нет подписок, нет пополнений)

---

### 8.5 Сравнение моделей: Session vs DeepSession

| Критерий | Session | DeepSession |
|---|---|---|
| Источник ликвидности для rewards | Стейковый буфер (десятки млн токенов) + редкие payoutReleased | RewardRatePool (checkpoint) + стейковый буфер |
| Необходимость регулярных keeper-вызовов | Нет, payoutReleased можно вызвать редко | Да, checkpoint важен при малом числе нод |
| Изолированность стейков и rewards | Нет, один баланс | Нет, один баланс |
| Риск дефицита ликвидности | Минимален: огромный стейковый буфер | Выше при малом числе нод и редком checkpoint |
| Источники пополнения пула | Ручные депозиты от Foundation | Подписки (40%) + liquidation pool share |
| Защита от избыточного claim | claimThreshold / claimCycle | claimThreshold / claimCycle |
| Защита RewardRatePool от переполнения | Нет cap, payoutReleased не защищает от 0-баланса | Есть cap: release ≤ currentBalance |
| Масштабируемость при росте нод | Буфер растёт пропорционально нодам | То же самое |

#### Какая модель лучше?

**Для продакшен с большим числом нод** — обе модели эквивалентны по надёжности. Стейковый буфер в обоих случаях обеспечивает запас на годы вперёд.

**Для UAT и раннего продакшен с малым числом нод** — модель DeepSession с checkpoint **требует более тщательной операционной дисциплины**. Без регулярного keeper-а claims могут начать зависать (ERC20 revert), даже если backend выдаёт корректные подписи.

**Преимущество DeepSession** — более предсказуемый поток пополнения: подписки → RewardRatePool → checkpoint → ServiceNodeRewards. Это устраняет зависимость от ручных решений Foundation и создаёт устойчивый flywheel.

---

### 8.6 Как убедиться, что система платёжеспособна в любой момент

Мониторинг должен отслеживать:

1. `XPNT.balanceOf(ServiceNodeRewards)` — реальная ликвидность.
2. `RewardRatePool.calculateReleasedAmount() - RewardRatePool.totalPaidOut` — накопленная в пуле, ещё не перечисленная сумма.
3. `Σ recipients[i].rewards - Σ recipients[i].claimed` — суммарный долг (требует off-chain агрегации событий `RewardsBalanceUpdated` и `RewardsClaimed`).

Если `(1) + (2) < (3)` — система технически несостоятельна в краткосрочной перспективе.

На UAT с малым числом нод и малым RewardRatePool критично, чтобы backend не подписывал суммы, превышающие `balance(ServiceNodeRewards) + unreleased_in_pool`.

---

## 9) Рекомендация: прямой буферный депозит в ServiceNodeRewards

### Суть

Самый простой и надёжный способ обеспечить ликвидность для reward-клеймов на старте — положить несколько миллионов XPNT напрямую на адрес контракта `ServiceNodeRewards` обычным ERC20 `transfer`.

### Что произойдёт

1. `XPNT.balanceOf(ServiceNodeRewards)` увеличится на сумму депозита.
2. Никакой специальной функции вызывать не нужно — контракт не имеет `deposit()`, `receive()` или внутреннего учёта таких переводов.
3. Токены немедленно становятся ликвидностью для `claimRewards` — все pending и будущие клеймы покрываются из этого буфера.
4. Checkpoint/keeper продолжает работать как обычно, постепенно добавляя средства из RewardRatePool поверх буфера.

### Важно понимать

- Токены необратимо "пожертвованы" контракту. У них нет owner-а, нет учётной записи "кто вложил", нет функции вернуть.
- При выходе ноды стейкеры получают назад только свои конкретные стейкинговые депозиты (`node.deposit`), но не этот буфер.
- Буфер расходуется постепенно по reward-клеймам и уйдёт в ноль со временем — это нормально: к тому моменту основным источником ликвидности станут стейки реальных нод и регулярные переводы из RewardRatePool через подписочную выручку.

### Сравнение с Session

Именно эту модель использует Session Foundation в mainnet: `seedPublicKeyList` создал гигантский стейковый буфер (тысячи нод × 20 000 SESH = десятки миллионов SESH), который одновременно служит и залогом, и ликвидностью для reward-клеймов. Поэтому им не нужен keeper с регулярными payoutReleased.

### Рекомендуемая сумма и порядок действий

1. Перед production-запуском перевести на `ServiceNodeRewards` операционный резерв — минимум на 6–12 месяцев ожидаемых reward-выплат.
2. Рассчитать ожидаемые выплаты как: `RewardRatePool.rewardRate() × число секунд в периоде`.
3. Продолжать держать работающий checkpoint-keeper — он обеспечивает регулярное пополнение из RewardRatePool и делает систему самодостаточной по мере роста подписочной выручки.
4. Мониторить `XPNT.balanceOf(ServiceNodeRewards)` и пополнять буфер при необходимости до тех пор, пока стейки нод и подписочный поток не обеспечат достаточную автономную ликвидность.
