# Deep XPNT Contract Migration

This fork keeps Session staking and reward distribution semantics intact while
issuing the Deep Ecosystem token:

See `docs/XPNT_MAINNET_LAUNCH_RUNBOOK.md` for the post-deployment production
launch checklist, governance follow-up, wallet metadata placeholders, and
canonical explorer links.
See `docs/ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md` for the committed
Arbitrum One staking deployment record.

- Token name: XPoint
- Ticker: XPNT
- Decimals: 9
- Genesis supply: 240,000,000 XPNT
- Reward pool seed used by deploy scripts: 40,000,000 XPNT
- Default staking requirement: 25,000 XPNT
- Reward emission V2: `min(14% * remaining reward pool, 30% * active staked XPNT)` annualized

UAT evidence and the production wallet-signing procedure are recorded in
`docs/REWARD_EMISSION_V2.md`.

## Address Map

Pass these values to backend services through configuration or environment
variables.

| Contract | Config key | Address |
| --- | --- | --- |
| XPNT (L1, Ethereum mainnet) | `Contracts:TokenAddress` | `0xc890b3Dac12a78B3449219a988f69CC25683575f` |
| XPNTL2 (L2, Arbitrum One proxy) | `L2_XPNT_TOKEN_ADDRESS` / `L2_XPNTL2_TOKEN_ADDRESS` | `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F` |
| ProxyAdmin (L2, Arbitrum One) | `<UPGRADE_ADMIN_CONFIG_KEY_IF_ANY>` | `0xbDcFFe619907c370055F42b25be05dEf34d5F623` |
| ServiceNodeRewards | `Contracts:ServiceNodeRewardsAddress` | `0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f` |
| ServiceNodeContributionFactory | `Contracts:ServiceNodeContributionFactoryAddress` | `0x289d88A8C06881634Fb619Ec528361C7b88521f1` |
| RewardRatePool | `Contracts:RewardRatePoolAddress` | `0xEd894fb5f0BA3b141A562190D4c9941FEd348356` |

## Recorded Deployments

- 2026-05-30, Ethereum mainnet, canonical L1 XPNT token: `0xc890b3Dac12a78B3449219a988f69CC25683575f`
- Deployer wallet for the current run: `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750`
- 2026-05-30, Arbitrum One, XPNTL2 implementation: `0xc890b3Dac12a78B3449219a988f69CC25683575f`, tx `0x8726d5567e4bebc251f88e47a0937ccdac47893c51adcc7f64916b62acb156ce`
- 2026-05-30, Arbitrum One, canonical L2 XPNTL2 proxy: `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F`, tx `0xd1b4c0a9c641acd9d61f1f06616fdbc60478519f701d671697a7835eafe460cb`
- 2026-05-31, Arbitrum One, ProxyAdmin: `0xbDcFFe619907c370055F42b25be05dEf34d5F623`, owner `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750`
- 2026-05-30, L1 -> L2 token registration tx: `0x12158351174e4b9833a98d322b030c03f06971c8810b306e40631dc44d9ff80a`
- 2026-05-30, L1 -> L2 test bridge tx for `1 XPNT`: `0xadddc813ee7a7bfa1bd129b3649a5a7d71bce0ce705783d080e4957c9df4cd16`
- Retryable ticket dashboard: `https://retryable-dashboard.arbitrum.io/tx/0xadddc813ee7a7bfa1bd129b3649a5a7d71bce0ce705783d080e4957c9df4cd16`
- 2026-05-31, verification status: L1 verified on Etherscan; L2 implementation, proxy, and ProxyAdmin verified on Arbiscan; L2 proxy linked to implementation; Sourcify full match present for the L2 proxy.
- 2026-06-22, Arbitrum One staking stack deployed; canonical record: `docs/ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md`.
- 2026-06-22, ServiceNodeRewards proxy: `0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f`, tx `0x9b8b7b1e65338b47be13903106744776bd810a27bc4c9729b20a57d2de4d5526`.
- 2026-06-22, ServiceNodeContributionFactory proxy: `0x289d88A8C06881634Fb619Ec528361C7b88521f1`, tx `0x1135c45d47981c447ce890efb8cd4f805866b1ba0d2d0c0108742e4b48f12ef0`.
- 2026-06-22, RewardRatePool proxy: `0xEd894fb5f0BA3b141A562190D4c9941FEd348356`, tx `0x38499167464c771f622d18bf1c1b13c9fc9dc59c6b44405b7715b1cc701ef7be`.
- 2026-06-22, RewardRatePool initial deposit: `40,000,000 XPNT`, tx `0x39d1b7cc81f3a1acaa7a5921c86522848ecafe355bab1250f632301a19a37ea1`.
- 2026-06-29, ServiceNodeRewards upgraded to V2 implementation `0x5D006b3d22d063C63A0257E077fd0517E1290b84`, tx `0xd642c7216138a2e565d0653307870181167138b0baa2e993ec6ad19bcfab32c0`.
- 2026-06-29, RewardRatePool upgraded to V2 implementation `0xCcAA274Ff11Da34ffcc232E0741F4234533e238F`, tx `0x3fdd8324fa03a50ed1a16243619a5e2af1b7210066cb9da1318e9f30a8a609c8`.
- 2026-06-29, production V2 postflight passed with zero active stake and zero emission before node registration.
- 2026-06-30, production ServiceNodeRewards started at block `478785456`, tx `0xcfea70741ebf1784f2d7dc0c45b41cd2b7882d4feec196e05d62c81d82c1291e`.
- 2026-06-30, first post-start node observed with `25,000 XPNT` active stake and a `7,500 XPNT` annual emission ceiling.

## Deployment

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm hardhat-node
pnpm deploy-local-devnet
pnpm devnet-smoke
pnpm export-abis
```

For Arbitrum L1/L2 token deployment use:

```bash
npx hardhat run scripts/deploy-l1-xpnt.js --network mainnet
npx hardhat run scripts/deploy-l2-xpnt.js --network arbitrum
```

For step-by-step PowerShell ISE deployment of the Arbitrum One mainnet staking
stack using the canonical L2 XPNT token, use
`scripts/deploy-xpnt-staking-mainnet.ps1`.

## Backend Configuration

Use the deployed addresses in `xpoint-staking-backend`:

```json
{
  "Contracts": {
    "TokenAddress": "0x63B2cdb8B0d8774F1Fdca91D24803698582a079F",
    "ServiceNodeRewardsAddress": "0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f",
    "ServiceNodeContributionFactoryAddress": "0x289d88A8C06881634Fb619Ec528361C7b88521f1",
    "RewardRatePoolAddress": "0xEd894fb5f0BA3b141A562190D4c9941FEd348356",
    "StakingRequirementAtomic": 25000000000000
  }
}
```

`deploy-local-devnet` atomically writes `deployments/localhost.latest.json`.
Schema version 1 records the chain ID, a lifecycle fingerprint, each deployment
transaction and block hash, contract addresses, and staking parameters. The
staking backend can mount this file read-only through
`Contracts__DeploymentManifestPath`; it must also pin the expected network with
`Contracts__ExpectedDeploymentNetwork`. This is preferred for local integration
because the manifest becomes the authoritative source and stale in-memory
Hardhat generations fail closed.

The same values can be supplied as environment variables:

```bash
Contracts__TokenAddress=0x63B2cdb8B0d8774F1Fdca91D24803698582a079F
Contracts__ServiceNodeRewardsAddress=0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f
Contracts__ServiceNodeContributionFactoryAddress=0x289d88A8C06881634Fb619Ec528361C7b88521f1
Contracts__RewardRatePoolAddress=0xEd894fb5f0BA3b141A562190D4c9941FEd348356
Contracts__StakingRequirementAtomic=25000000000000
```

## Registry Configuration

The registration API does not change reward math. It stores Deep-only
node transport metadata and exposes it alongside stake state for clients. Set
the registry staking requirement to the deployed network value so local devnet
and production state use the same admission threshold:

```bash
Registry__StakingRequirementAtomic=25000000000000
```

For the local devnet deployment script this value is written in
`deployments/localhost.latest.json` as `parameters.stakingRequirement`
(`120000000000` by default).
