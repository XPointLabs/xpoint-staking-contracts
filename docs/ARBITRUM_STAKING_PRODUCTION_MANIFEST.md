# Arbitrum One Production Staking Manifest Snapshot

This file preserves the production staking deployment manifest in markdown so
the deployment record is not lost if the ignored local `deployments/*.json`
files are cleaned up.

Source manifests at capture time:

- `deployments/arbitrum.latest.json`
- `deployments/xpnt-staking-arbitrum.latest.json`

The JSON files are local deployment artifacts and are ignored by git. On the
deployment workstation they were last observed under
`C:\Work\DeepSession\deepsession-staking-contracts\deployments\`.

Captured on: `2026-06-22`

## Identity

| Field | Value |
| --- | --- |
| Deployment timestamp UTC | `2026-06-22T10:06:58.516Z` |
| Network | Arbitrum One |
| Hardhat network | `arbitrum` |
| Chain ID | `42161` |
| Owner / deployer | `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750` |
| Start block | `476121260` |
| Subscription contracts deployed | `false` |

## Token

| Field | Value |
| --- | --- |
| Name | `XPoint` |
| Symbol | `XPNT` |
| Decimals | `9` |
| Arbitrum One address | `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F` |

## Parameters

| Parameter | Value |
| --- | --- |
| Reward pool initial deposit, atomic | `40000000000000000` |
| Reward pool initial deposit, human | `40,000,000 XPNT` |
| Staking requirement, atomic | `25000000000000` |
| Staking requirement, human | `25,000 XPNT` |
| Max contributors | `10` |
| Liquidator reward ratio | `3` |
| Pool share of liquidation ratio | `17` |
| Recipient ratio | `9980` |
| Mainnet mode | `true` |

## Post-Deploy State

| Field | Value |
| --- | --- |
| ServiceNodeRewards started | `false` |
| ServiceNodeRewards total nodes | `0` |
| ServiceNodeRewards next service node ID | `1` |
| Subscription contracts deployed | `false` |

## Contracts

| Contract | Address |
| --- | --- |
| XPNT token | `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F` |
| RewardRatePool implementation | `0x6fc2A62B8a3A24E531F66A678FF2f0BEc86Ca5B5` |
| RewardRatePool proxy | `0xEd894fb5f0BA3b141A562190D4c9941FEd348356` |
| ServiceNodeRewards implementation | `0x12EB6963deA94CC253136854DbbEFC9E7464118f` |
| ServiceNodeRewards proxy | `0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f` |
| ServiceNodeContribution implementation | `0xd6af6Beb0d19396932e25429aF1828798a68c3EE` |
| ServiceNodeContributionFactory implementation | `0x98Fc499C1d09e4263379c017c97f48e2187FB868` |
| ServiceNodeContributionFactory proxy | `0x289d88A8C06881634Fb619Ec528361C7b88521f1` |

## Proxy Admins

| Proxy | ProxyAdmin |
| --- | --- |
| RewardRatePool | `0x095DA371BFC91751DA3A22A18577D0cCbb84Dbb3` |
| ServiceNodeRewards | `0xb5E91592e646201720b995E0b5C552E5458424b0` |
| ServiceNodeContributionFactory | `0xd5f41268D579b4Cab61bF57418bd98293298fCEf` |

## Deployment Transactions

| Manifest key | Block | Transaction | Contract address |
| --- | ---: | --- | --- |
| `rewardRatePoolImplementation` | `476121260` | `0x56eb1ab34ff985bc364cfb31220699d45a6ed5ceae4c59edf391775571b8b11d` | `0x6fc2A62B8a3A24E531F66A678FF2f0BEc86Ca5B5` |
| `rewardRatePool` | `476121301` | `0x38499167464c771f622d18bf1c1b13c9fc9dc59c6b44405b7715b1cc701ef7be` | `0xEd894fb5f0BA3b141A562190D4c9941FEd348356` |
| `serviceNodeRewardsImplementation` | `476121351` | `0xf8d86ad2b375576dd7784424b925c2fca047b066507fa915bde23ac84e14f93d` | `0x12EB6963deA94CC253136854DbbEFC9E7464118f` |
| `serviceNodeRewards` | `476121397` | `0x9b8b7b1e65338b47be13903106744776bd810a27bc4c9729b20a57d2de4d5526` | `0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f` |
| `serviceNodeContributionImplementation` | `476121449` | `0x7b23e10d6d4d336493de9bd8ce6fbd4d0833b6a914c213902d584dbfcaeb5d4a` | `0xd6af6Beb0d19396932e25429aF1828798a68c3EE` |
| `serviceNodeContributionFactoryImplementation` | `476121477` | `0x28ca9a7328ebb6a1bac0f8d4abf8451c59ca24c68acbc7e62d44e4e72be88a1d` | `0x98Fc499C1d09e4263379c017c97f48e2187FB868` |
| `serviceNodeContributionFactory` | `476121514` | `0x1135c45d47981c447ce890efb8cd4f805866b1ba0d2d0c0108742e4b48f12ef0` | `0x289d88A8C06881634Fb619Ec528361C7b88521f1` |
| `setRewardPoolBeneficiary` | `476121556` | `0x0a1aabbd58311c1bf8c3460482dc2b1f51ab7b17a74bd76d83158a82e6642a3d` | n/a |
| `approveRewardPoolDeposit` | `476121608` | `0x0752f2e20a226c3e122d26dafeceb413679ccf44111c7f3b231391625c27f89a` | n/a |
| `depositRewardPool` | `476121728` | `0x39d1b7cc81f3a1acaa7a5921c86522848ecafe355bab1250f632301a19a37ea1` | n/a |
