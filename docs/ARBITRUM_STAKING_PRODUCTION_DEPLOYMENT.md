# Arbitrum One Production Staking Deployment

This document records the production staking stack deployed for XPNT on Arbitrum
One. The local deployment manifests are intentionally not the only source of
truth because the `deployments/` directory is ignored by git.

## Deployment Summary

- Deployment timestamp (UTC): `2026-06-22T10:06:58.516Z`
- Deployment timestamp (Asia/Yekaterinburg): `2026-06-22 15:06:58`
- Network: Arbitrum One
- Chain ID: `42161`
- Deployer / owner: `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750`
- Existing XPNT token: `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F`
- Start block: `476121260`
- Reward pool initial deposit: `40,000,000 XPNT`
- Reward pool initial deposit, atomic: `40000000000000000`
- Staking requirement: `25,000 XPNT`
- Staking requirement, atomic: `25000000000000`
- Max contributors per node: `10`
- Liquidation split: `3 / 17 / 9980`
  - Liquidator: `0.03%`
  - Reward pool: `0.17%`
  - Recipient / stakers: `99.8%`
- Subscription contracts deployed in this run: no

## Contracts

| Contract | Kind | Address |
| --- | --- | --- |
| XPNT | Existing Arbitrum One token | `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F` |
| RewardRatePool | Implementation | `0x6fc2A62B8a3A24E531F66A678FF2f0BEc86Ca5B5` |
| RewardRatePool | Transparent proxy | `0xEd894fb5f0BA3b141A562190D4c9941FEd348356` |
| ServiceNodeRewards | Implementation | `0x12EB6963deA94CC253136854DbbEFC9E7464118f` |
| ServiceNodeRewards | Transparent proxy | `0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f` |
| ServiceNodeContribution | Implementation | `0xd6af6Beb0d19396932e25429aF1828798a68c3EE` |
| ServiceNodeContributionFactory | Implementation | `0x98Fc499C1d09e4263379c017c97f48e2187FB868` |
| ServiceNodeContributionFactory | Transparent proxy | `0x289d88A8C06881634Fb619Ec528361C7b88521f1` |

## Proxy Admins

Each staking proxy was deployed with its own OpenZeppelin `ProxyAdmin`. All
three ProxyAdmins are currently owned by the deployer / owner wallet:
`0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750`.

| Proxy | ProxyAdmin |
| --- | --- |
| RewardRatePool | `0x095DA371BFC91751DA3A22A18577D0cCbb84Dbb3` |
| ServiceNodeRewards | `0xb5E91592e646201720b995E0b5C552E5458424b0` |
| ServiceNodeContributionFactory | `0xd5f41268D579b4Cab61bF57418bd98293298fCEf` |

## Deployment Transactions

| Step | Block | Transaction |
| --- | ---: | --- |
| Deploy RewardRatePool implementation | `476121260` | `0x56eb1ab34ff985bc364cfb31220699d45a6ed5ceae4c59edf391775571b8b11d` |
| Deploy RewardRatePool proxy | `476121301` | `0x38499167464c771f622d18bf1c1b13c9fc9dc59c6b44405b7715b1cc701ef7be` |
| Deploy ServiceNodeRewards implementation | `476121351` | `0xf8d86ad2b375576dd7784424b925c2fca047b066507fa915bde23ac84e14f93d` |
| Deploy ServiceNodeRewards proxy | `476121397` | `0x9b8b7b1e65338b47be13903106744776bd810a27bc4c9729b20a57d2de4d5526` |
| Deploy ServiceNodeContribution implementation | `476121449` | `0x7b23e10d6d4d336493de9bd8ce6fbd4d0833b6a914c213902d584dbfcaeb5d4a` |
| Deploy ServiceNodeContributionFactory implementation | `476121477` | `0x28ca9a7328ebb6a1bac0f8d4abf8451c59ca24c68acbc7e62d44e4e72be88a1d` |
| Deploy ServiceNodeContributionFactory proxy | `476121514` | `0x1135c45d47981c447ce890efb8cd4f805866b1ba0d2d0c0108742e4b48f12ef0` |
| Set RewardRatePool beneficiary to ServiceNodeRewards | `476121556` | `0x0a1aabbd58311c1bf8c3460482dc2b1f51ab7b17a74bd76d83158a82e6642a3d` |
| Approve 40,000,000 XPNT for RewardRatePool | `476121608` | `0x0752f2e20a226c3e122d26dafeceb413679ccf44111c7f3b231391625c27f89a` |
| Deposit 40,000,000 XPNT into RewardRatePool | `476121728` | `0x39d1b7cc81f3a1acaa7a5921c86522848ecafe355bab1250f632301a19a37ea1` |

## On-Chain Verification Snapshot

The following values were read from Arbitrum One at block `476122776` after the
deployment completed:

- XPNT token symbol: `XPNT`
- XPNT token decimals: `9`
- RewardRatePool owner: `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750`
- RewardRatePool XPNT token: `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F`
- RewardRatePool beneficiary: `0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f`
- RewardRatePool XPNT balance: `40,000,000 XPNT`
- RewardRatePool total paid out: `0 XPNT`
- RewardRatePool total deposited: `40,000,000 XPNT`
- RewardRatePool 2-minute reward rate, atomic: `22983228177`
- ServiceNodeRewards owner: `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750`
- ServiceNodeRewards designated token: `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F`
- ServiceNodeRewards foundation pool: `0xEd894fb5f0BA3b141A562190D4c9941FEd348356`
- ServiceNodeRewards staking requirement, atomic: `25000000000000`
- ServiceNodeRewards max contributors: `10`
- ServiceNodeRewards liquidation ratios: `3 / 17 / 9980`
- ServiceNodeRewards started: `false`
- ServiceNodeRewards total nodes: `0`
- ServiceNodeRewards next service node ID: `1`
- ServiceNodeContributionFactory owner: `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750`
- ServiceNodeContributionFactory rewards contract: `0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f`
- ServiceNodeContributionFactory contribution implementation: `0xd6af6Beb0d19396932e25429aF1828798a68c3EE`

## Backend Configuration

Use these values in the production staking backend and registry configuration:

```bash
Contracts__TokenAddress=0x63B2cdb8B0d8774F1Fdca91D24803698582a079F
Contracts__ServiceNodeRewardsAddress=0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f
Contracts__ServiceNodeContributionFactoryAddress=0x289d88A8C06881634Fb619Ec528361C7b88521f1
Contracts__RewardRatePoolAddress=0xEd894fb5f0BA3b141A562190D4c9941FEd348356
Contracts__StakingRequirementAtomic=25000000000000
Registry__StakingRequirementAtomic=25000000000000
```

## Local Manifest Files

The MetaMask deployment wizard saved the local manifests here:

- `deployments/arbitrum.latest.json`
- `deployments/xpnt-staking-arbitrum.latest.json`
- Committed markdown snapshot:
  [ARBITRUM_STAKING_PRODUCTION_MANIFEST.md](./ARBITRUM_STAKING_PRODUCTION_MANIFEST.md)

These files are useful locally but are not committed because `deployments/` is
ignored. This markdown document and the manifest snapshot are the committed
records.

## Post-Deployment Notes

- `ServiceNodeRewards.isStarted` is currently `false`.
- `ServiceNodeRewards.totalNodes` is currently `0`.
- Choose the production bootstrap flow before onboarding nodes:
  - For an owner-seeded initial set, call `seedPublicKeyList(...)` while
    `ServiceNodeRewards.isStarted == false`, then call `ServiceNodeRewards.start()`.
  - For manual staking portal registrations, call `ServiceNodeRewards.start()`
    first; `addBLSPublicKey(...)` is guarded by `whenStarted`.
- Long-term operations should decide whether the three staking ProxyAdmins stay
  on the deployer EOA or move to a Safe/multisig.
