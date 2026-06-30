# Reward Emission V2

## Model

RewardRatePool V2 applies the following annualized ceiling:

```text
min(14% * remaining reward pool, 30% * active staked XPNT)
```

Both ceilings are prorated by elapsed seconds. `rewardRate()` keeps its existing
ABI and returns the capped two-minute amount used by the staking backend.
The 40,000,000 XPNT reward allocation does not change.

At the production staking requirement of 25,000 XPNT per node:

| Active nodes | Maximum annual emission |
| ---: | ---: |
| 3 | 22,500 XPNT |
| 100 | 750,000 XPNT |
| 500 | 3,750,000 XPNT |
| 748 or more | approximately 5,600,000 XPNT, while the pool is 40,000,000 XPNT |

## Contract Changes

- `ServiceNodeRewards.totalActiveStake()` tracks the exact deposits of active
  nodes. It does not assume that every historical node used the current staking
  requirement.
- RewardPool checkpoints are taken before node additions, exits, seed batches,
  staking-requirement changes, and active-stake provider changes. This prevents
  a later stake value from being applied retroactively.
- Both V2 initializers support an owner call for a fresh deployment and the
  ERC-1967 ProxyAdmin call used by atomic `upgradeAndCall`.
- Existing V1 storage is preserved. OpenZeppelin storage validation reports
  `ServiceNodeRewards` safe from 29 to 30 fields and `RewardRatePool` safe from
  4 to 5 fields.

## UAT Deployment

Deployed and verified on Arbitrum Sepolia on 2026-06-29.

| Item | Value |
| --- | --- |
| ServiceNodeRewards proxy | `0x08A5a47E67fCd18e14AdFB535e8d8644476D4197` |
| ServiceNodeRewards V2 implementation | `0xEC8844203a1283799140c4A0972CFd83a010D471` |
| ServiceNodeRewards upgrade tx | `0x13cb054bca9f9aa6e82a4f7cac97ab3bebc586a803baa9bea4188f8c79e0ae62` |
| RewardRatePool proxy | `0xe055c7200aE13984fe66c2e8AaC608bC80E19D57` |
| RewardRatePool V2 implementation | `0x7Db237Fc6E1D1E5b696056066b6cc46430A1900b` |
| RewardRatePool upgrade tx | `0xd688d8322b99ee852e9543cc64bb9627e5dbe64c04612a249bad801b77aa2c98` |
| V2 checkpoint smoke tx | `0xdb744328ecd1a7bf245bb135ab8c647d16f7d1e3c7142f918e69703e185524fa` |

Both V2 implementations have a Sourcify partial match. Arbiscan source
verification remains pending because no Arbiscan API key was configured on the
deployment host.

Post-upgrade state:

- 6 active nodes and `720000000000` atomic XPNT exact active stake.
- `216000000000` atomic XPNT annual emission ceiling.
- `821917` atomic XPNT two-minute reward rate.
- The V2 checkpoint transferred `952054` atomic XPNT and all accounting deltas
  matched.
- Staking backend remained healthy and began accruing at the new rate without a
  restart; the indexer continued processing blocks.

## Production Deployment

The production upgrade was signed by the owner wallet and verified on
Arbitrum One on 2026-06-29.

| Item | Value |
| --- | --- |
| ServiceNodeRewards V2 implementation | `0x5D006b3d22d063C63A0257E077fd0517E1290b84` |
| Deploy ServiceNodeRewards tx | `0x7f144d889ef614692af694da438cf990622b1ef48c64fbffb0e2142e701b9371` |
| ServiceNodeRewards upgrade tx | `0xd642c7216138a2e565d0653307870181167138b0baa2e993ec6ad19bcfab32c0` |
| RewardRatePool V2 implementation | `0xCcAA274Ff11Da34ffcc232E0741F4234533e238F` |
| Deploy RewardRatePool tx | `0xb3eb24a03c4007bc59a954d88d14f4c238caf37dca742a9e637c6262388300b3` |
| Legacy reward checkpoint tx | `0x23d03e480c710eb75805fb238f62063417f992671ee34c1f5283051796d885e1` |
| RewardRatePool upgrade tx | `0x3fdd8324fa03a50ed1a16243619a5e2af1b7210066cb9da1318e9f30a8a609c8` |

Post-upgrade verification confirmed both versions are `2`, the active-stake
provider is the production ServiceNodeRewards proxy, and ownership, ProxyAdmin,
token, pool, and beneficiary relationships are unchanged. At verification time
there were no active production nodes, so `totalActiveStake`, annual emission,
and the two-minute reward rate were all zero as required.

The reviewed MetaMask upgrade wizard is started with:

```bash
pnpm prepare:reward-emission-production
```

Open `http://127.0.0.1:28162/`, connect the production owner wallet, run the
preflight, and review each of the five wallet transactions. The wizard verifies
the current implementations, both ProxyAdmins and their owners, contract
relationships, V1 versions, exact active stake, and every V2 postcondition. It
never reads a private key or seed phrase.

The same five-transaction sequence passed against a current Arbitrum One fork:

1. Deploy ServiceNodeRewards V2 implementation.
2. Deploy RewardRatePool V2 implementation.
3. Atomically upgrade and initialize ServiceNodeRewards V2.
4. Checkpoint accrued V1 rewards.
5. Atomically upgrade and initialize RewardRatePool V2.

The production snapshot used for the upgrade had zero active nodes. Therefore,
V2 emission remains zero until stake becomes active.

## Production Registration Enabled

Production node registration was enabled by the owner wallet on 2026-06-30:

| Item | Value |
| --- | --- |
| `start()` transaction | `0xcfea70741ebf1784f2d7dc0c45b41cd2b7882d4feec196e05d62c81d82c1291e` |
| Block | `478785456` |
| ServiceNodeRewards version | `2` |
| `isStarted` | `true` |

The transaction receipt status is `1`. A direct post-deployment RPC check also
confirmed that the first production node registered successfully after start:
`totalNodes = 1`, `totalActiveStake = 25000000000000`, annual emission =
`7500000000000`, and the two-minute reward rate = `28538812` atomic XPNT.

The owner-signing page is retained for reproducibility and can be started with:

```bash
pnpm prepare:start-production
```

The local page verifies the owner, chain, V2 implementation, version, and
current start state. It refuses to offer another transaction after detecting
that production is already started.
