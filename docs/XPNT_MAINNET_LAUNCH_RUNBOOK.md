# XPNT Mainnet Launch Runbook

This document is the operator checklist for taking XPNT from deployed-and-verified
status to public production use on Ethereum mainnet and Arbitrum One.

## Status Snapshot

As of 2026-06-22, the following items are already complete:

- [x] L1 XPNT deployed on Ethereum mainnet.
- [x] L1 XPNT verified on Etherscan.
- [x] L2 XPNTL2 transparent proxy deployed on Arbitrum One.
- [x] L2 implementation verified on Arbiscan.
- [x] Proxy linked to implementation on Arbiscan.
- [x] ProxyAdmin verified on Arbiscan.
- [x] Proxy fully verified on Arbiscan.
- [x] Proxy full match published on Sourcify.
- [x] L1 to L2 registration transaction executed.
- [x] L1 to L2 bridge smoke test executed for 1 XPNT.
- [x] Live on-chain state now confirms the full `240,000,000 XPNT` supply is bridged to Arbitrum One and the matching L1 balance is escrowed in the custom gateway.
- [x] Arbitrum One staking stack deployed and funded with `40,000,000 XPNT`.
- [x] Production staking deployment record added at [ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md](./ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md).

Items still requiring an explicit operator decision or follow-up:

- [ ] Decide whether ProxyAdmin ownership remains on the deployer EOA or moves to `<SAFE_OR_MULTISIG_ADDRESS>`.
- [ ] Publish official token metadata and branding endpoints.
- [ ] Publish canonical token addresses on the project website and docs.
- [ ] Submit token/logo metadata to wallets, token lists, and market data providers.
- [ ] Complete a user-facing bridge test with a non-deployer wallet.
- [ ] Choose the production bootstrap flow: owner seed before `start()`, or
  `start()` first for manual staking portal registrations.
- [ ] Register or seed the initial production service-node set using the chosen flow.

## Canonical Addresses

| Item | Network | Address | Notes |
| --- | --- | --- | --- |
| XPNT token | Ethereum mainnet | `0xc890b3Dac12a78B3449219a988f69CC25683575f` | Canonical L1 token |
| XPNTL2 proxy | Arbitrum One | `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F` | Canonical L2 token address |
| XPNTL2 implementation | Arbitrum One | `0xc890b3Dac12a78B3449219a988f69CC25683575f` | Same address as L1 token only because of same deployer nonce on a different chain |
| ProxyAdmin | Arbitrum One | `0xbDcFFe619907c370055F42b25be05dEf34d5F623` | Upgrade admin for the L2 transparent proxy |
| Current ProxyAdmin owner | Arbitrum One | `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750` | Current upgrade authority |
| Deployer wallet | Ethereum mainnet / Arbitrum One | `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750` | Used for the canonical deployment run |
| L1 custom gateway | Ethereum mainnet | `0xcEe284F754E854890e311e3280b767F80797180d` | Arbitrum custom gateway |
| L1 router | Ethereum mainnet | `0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef` | Arbitrum router |
| L2 custom gateway | Arbitrum One | `0x096760F208390250649E3e8763348E783AEF5562` | Arbitrum One custom gateway |
| ServiceNodeRewards proxy | Arbitrum One | `0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f` | Production staking rewards contract |
| ServiceNodeContributionFactory proxy | Arbitrum One | `0x289d88A8C06881634Fb619Ec528361C7b88521f1` | Production contribution factory |
| RewardRatePool proxy | Arbitrum One | `0xEd894fb5f0BA3b141A562190D4c9941FEd348356` | Production reward pool funded with 40,000,000 XPNT |

## Explorer Links

- Etherscan L1 token: https://etherscan.io/token/0xc890b3Dac12a78B3449219a988f69CC25683575f
- Arbiscan L2 token proxy: https://arbiscan.io/token/0x63B2cdb8B0d8774F1Fdca91D24803698582a079F
- Arbiscan L2 implementation: https://arbiscan.io/address/0xc890b3Dac12a78B3449219a988f69CC25683575f#code
- Arbiscan ProxyAdmin: https://arbiscan.io/address/0xbDcFFe619907c370055F42b25be05dEf34d5F623#code
- Arbiscan ServiceNodeRewards proxy: https://arbiscan.io/address/0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f
- Arbiscan ServiceNodeContributionFactory proxy: https://arbiscan.io/address/0x289d88A8C06881634Fb619Ec528361C7b88521f1
- Arbiscan RewardRatePool proxy: https://arbiscan.io/address/0xEd894fb5f0BA3b141A562190D4c9941FEd348356
- Sourcify full match (L2 proxy): https://repo.sourcify.dev/contracts/full_match/42161/0x63B2cdb8B0d8774F1Fdca91D24803698582a079F/

## Verified On-Chain Facts

These values were re-read from live chain state on 2026-06-01.

### L1 XPNT

- Name: `XPoint`
- Symbol: `XPNT`
- Decimals: `9`
- Total supply (atomic): `240000000000000000`
- Total supply (human): `240,000,000 XPNT`
- Deployer wallet balance (atomic): `0`
- Deployer wallet balance (human): `0 XPNT`
- Custom gateway locked balance (atomic): `240000000000000000`
- Custom gateway locked balance (human): `240,000,000 XPNT`
- Gateway: `0xcEe284F754E854890e311e3280b767F80797180d`
- Router: `0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef`

### L2 XPNTL2 Proxy

- Name: `XPoint`
- Symbol: `XPNT`
- Decimals: `9`
- Total supply (atomic): `240000000000000000`
- Total supply (human): `240,000,000 XPNT`
- L1 token pointer: `0xc890b3Dac12a78B3449219a988f69CC25683575f`
- L2 gateway: `0x096760F208390250649E3e8763348E783AEF5562`
- Deployer wallet balance (atomic): `240000000000000000`
- Deployer wallet balance (human): `240,000,000 XPNT`

### Upgrade Model

- L1 XPNT is not upgradeable.
- L1 XPNT does not expose an owner/admin role in the token contract itself.
- L2 XPNTL2 is upgradeable through an OpenZeppelin transparent proxy.
- Current ProxyAdmin owner is the deployer EOA: `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750`.
- Staking proxies are upgradeable through three OpenZeppelin ProxyAdmins recorded in [ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md](./ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md).
- If long-term operations should not depend on a single EOA, transfer ProxyAdmin ownership before public launch.

### Staking Stack

These values were read from live Arbitrum One chain state on 2026-06-22 after
the staking deployment completed.

- XPNT token: `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F`
- ServiceNodeRewards proxy: `0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f`
- ServiceNodeContributionFactory proxy: `0x289d88A8C06881634Fb619Ec528361C7b88521f1`
- RewardRatePool proxy: `0xEd894fb5f0BA3b141A562190D4c9941FEd348356`
- Staking requirement: `25,000 XPNT`
- Staking requirement, atomic: `25000000000000`
- Reward pool balance: `40,000,000 XPNT`
- Max contributors per node: `10`
- Liquidation ratios: `3 / 17 / 9980`
- `ServiceNodeRewards.isStarted`: `false`
- `ServiceNodeRewards.totalNodes`: `0`
- Full deployment record: [ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md](./ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md)

## Deployment and Verification Record

- L1 deploy tx / canonical token deployment: see [MIGRATION.md](./MIGRATION.md)
- L2 implementation tx: `0x8726d5567e4bebc251f88e47a0937ccdac47893c51adcc7f64916b62acb156ce`
- L2 proxy tx: `0xd1b4c0a9c641acd9d61f1f06616fdbc60478519f701d671697a7835eafe460cb`
- L1 to L2 registration tx: `0x12158351174e4b9833a98d322b030c03f06971c8810b306e40631dc44d9ff80a`
- L1 to L2 bridge smoke tx: `0xadddc813ee7a7bfa1bd129b3649a5a7d71bce0ce705783d080e4957c9df4cd16`
- Staking deployment record: [ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md](./ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md)
- Staking deployment manifest snapshot: [ARBITRUM_STAKING_PRODUCTION_MANIFEST.md](./ARBITRUM_STAKING_PRODUCTION_MANIFEST.md)

## Required Pre-Launch Checklist

## Repeated L1 -> L2 Bridge Instructions

The initial custom gateway registration is already complete for XPNT. For any later transfer of the remaining L1 XPNT balance to Arbitrum One, use the dedicated bridge-only script instead of repeating token registration.

### Prerequisites

- The XPNT balance is held by an EOA or multisig signer that can approve ERC20 transfers on L1.
- The sender wallet has enough Ethereum mainnet ETH to pay:
  - L1 transaction gas;
  - Arbitrum retryable ticket submission cost;
  - L2 execution gas / call value.
- The canonical contracts remain:
  - L1 XPNT: `0xc890b3Dac12a78B3449219a988f69CC25683575f`
  - L2 XPNT proxy: `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F`
  - L1 custom gateway: `0xcEe284F754E854890e311e3280b767F80797180d`
  - L1 router: `0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef`

### Environment

Set at least these variables before running the bridge:

```powershell
$env:L1_XPNT_TOKEN_ADDRESS = '0xc890b3Dac12a78B3449219a988f69CC25683575f'
$env:L2_XPNT_TOKEN_ADDRESS = '0x63B2cdb8B0d8774F1Fdca91D24803698582a079F'
$env:XPNT_BRIDGE_AMOUNT = '1000'
$env:BRIDGE_DESTINATION_ADDRESS = '0xYourArbitrumAddress'
```

Optional overrides are the same as in the existing combined script:

- `L1_ROUTER_ADDRESS`
- `L1_GATEWAY_ADDRESS`
- `BRIDGE_L1_GAS_LIMIT`
- `BRIDGE_L2_MAX_GAS`
- `BRIDGE_MAX_SUBMISSION_COST`
- `BRIDGE_L2_CALL_VALUE_WEI`
- `BRIDGE_CALL_HOOK_DATA`
- `L2_GAS_PRICE_BID`

### Run Command

```powershell
npx hardhat run scripts/bridge-xpnt-to-arbitrum.js --network mainnet
```

On this workspace's Windows setup, if the default Hardhat runtime fails, use the pinned local node runtime instead:

```powershell
.\.tools\node-v22.2.0-win-x64\node.exe .\node_modules\hardhat\internal\cli\bootstrap.js run .\scripts\bridge-xpnt-to-arbitrum.js --network mainnet
```

### What the Script Does

1. Approves the L1 custom gateway to pull the requested XPNT amount.
2. Calls the Arbitrum L1 router `outboundTransferCustomRefund(...)`.
3. Pays the retryable ticket costs in ETH.
4. Prints the L1 tx hash and retryable dashboard link.

### Important Limitation

This flow works for balances held by a wallet you control directly. If the tokens are held inside a contract such as a reward pool or escrow, that contract itself must expose bridge logic or withdrawal logic first; an external wallet cannot bridge someone else's contract-held ERC20 balance.

### 1. Governance and Admin Custody

- [ ] Decide final upgrade admin owner: `<SAFE_OR_MULTISIG_ADDRESS>` or explicitly keep the current EOA.
- [ ] If ownership changes, execute ProxyAdmin ownership transfer.
- [ ] Record transfer tx hash: `<PROXY_ADMIN_TRANSFER_TX_HASH>`.
- [ ] Record signer policy / approver list: `<UPGRADE_SIGNER_POLICY>`.
- [ ] Record emergency response owner/contact: `<SECURITY_OWNER_OR_TEAM>`.

### 2. Product and Backend Configuration

- [ ] Fill production backend config with canonical token addresses.
- [x] Fill production addresses for the staking contracts:
  - `Contracts:ServiceNodeRewardsAddress = 0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f`
  - `Contracts:ServiceNodeContributionFactoryAddress = 0x289d88A8C06881634Fb619Ec528361C7b88521f1`
  - `Contracts:RewardRatePoolAddress = 0xEd894fb5f0BA3b141A562190D4c9941FEd348356`
- [x] Confirm `Contracts:StakingRequirementAtomic` is correct for production: `25000000000000`.
- [x] Confirm `Registry__StakingRequirementAtomic` matches the production requirement: `25000000000000`.
- [ ] Publish the canonical address page or docs section: `<OFFICIAL_CONTRACTS_PAGE_URL>`.

### 3. Bridge and User Journey QA

- [ ] Perform one additional bridge deposit using a non-deployer wallet: `<TEST_WALLET_ADDRESS>`.
- [ ] Confirm the bridged amount appears in MetaMask after manual token import.
- [ ] Test L2 transfer from one user wallet to another.
- [ ] Test allowance + transferFrom flow if any integrations rely on it.
- [ ] If withdrawals back to L1 are part of launch scope, run one end-to-end withdrawal rehearsal and record the tx set:
  - `<L2_WITHDRAW_TX_HASH>`
  - `<L1_CLAIM_TX_HASH>`

### 4. Wallet Visibility and Metadata

- [ ] Publish official token page: `<OFFICIAL_TOKEN_PAGE_URL>`.
- [ ] Finalize token logo asset package:
  - `<LOGO_PNG_256_URL>`
  - `<LOGO_PNG_512_URL>`
  - `<LOGO_SVG_URL>`
- [ ] Finalize token description: `<TOKEN_DESCRIPTION>`.
- [ ] Finalize project website: `<OFFICIAL_WEBSITE_URL>`.
- [ ] Finalize support URL/email: `<SUPPORT_URL_OR_EMAIL>`.
- [ ] Finalize project social links:
  - `<X_OR_TWITTER_URL>`
  - `<TELEGRAM_URL>`
  - `<DISCORD_URL>`
  - `<GITHUB_OR_DOCS_URL>`
- [ ] Submit metadata/logo to the channels you care about:
  - MetaMask ecosystem sources
  - Trust Wallet assets
  - CoinGecko
  - CoinMarketCap
  - DexScreener
  - Any project-specific token list or bridge list

### 5. Public Communication Package

- [ ] Prepare the public announcement text.
- [ ] Publish canonical addresses for both chains.
- [ ] Explicitly state that the canonical Arbitrum token address is the proxy, not the implementation.
- [ ] Publish explorer links.
- [ ] Publish bridge instructions.
- [ ] Publish manual wallet import instructions for Ethereum and Arbitrum.
- [ ] Publish risk note on upgrade authority and whether it is EOA- or multisig-controlled.

### 6. Operations and Key Hygiene

- [ ] Archive the exact deploy and verify commands used for the canonical run.
- [ ] Archive tx hashes and explorer links in the internal operations vault.
- [ ] Rotate or retire any hot-wallet/private-key material used only for deployment: `<KEY_ROTATION_STATUS>`.
- [ ] Confirm backup access to the admin owner wallet or multisig.
- [ ] Record the rollback / pause / upgrade decision tree: `<INCIDENT_RUNBOOK_LOCATION>`.

## Recommended Public Metadata Block

Use this block as the source of truth for your website, token-list submissions, and wallet metadata forms.

```text
Token name: XPoint
Token symbol: XPNT
Decimals: 9
Ethereum mainnet token address: 0xc890b3Dac12a78B3449219a988f69CC25683575f
Arbitrum One token address: 0x63B2cdb8B0d8774F1Fdca91D24803698582a079F
Website: <OFFICIAL_WEBSITE_URL>
Token page: <OFFICIAL_TOKEN_PAGE_URL>
Logo 256 PNG: <LOGO_PNG_256_URL>
Logo 512 PNG: <LOGO_PNG_512_URL>
Logo SVG: <LOGO_SVG_URL>
Description: <TOKEN_DESCRIPTION>
Support: <SUPPORT_URL_OR_EMAIL>
X / Twitter: <X_OR_TWITTER_URL>
Telegram: <TELEGRAM_URL>
Discord: <DISCORD_URL>
Docs: <DOCS_URL>
Announcement URL: <LAUNCH_ANNOUNCEMENT_URL>
```

## Token List Smoke Checklist

Run this checklist after every token list update or site deployment.

### HTTP and JSON

- [ ] `https://xpoint.network/tokenlist.json` returns `200 OK`.
- [ ] `Content-Type` is `application/json`.
- [ ] `Access-Control-Allow-Origin` is present for `tokenlist.json`.
- [ ] JSON parses successfully without manual fixes.
- [ ] `timestamp` is valid RFC3339 UTC.

### Token Entries

- [ ] Ethereum mainnet entry exists for `0xc890b3Dac12a78B3449219a988f69CC25683575f`.
- [ ] Arbitrum One entry exists for `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F`.
- [ ] Both entries use `name = XPoint`, `symbol = XPNT`, `decimals = 9`.
- [ ] Arbitrum entry points back to the L1 token in `extensions.bridgeInfo`.

### Assets and Consumer Checks

- [ ] Referenced `logoURI` assets return `200 OK` over HTTPS.
- [ ] At least one browser-based token-list consumer can fetch the list without CORS errors.
- [ ] At least one wallet or dApp resolves both XPNT entries and renders the token logo.
- [ ] If the Arbitrum token is imported in a wallet, the proxy address `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F` is used, not the implementation address.

## Go / No-Go Gate

Do not call the token publicly launched until all of the following are true:

- [ ] Canonical addresses are published publicly.
- [ ] Upgrade ownership is explicitly accepted and documented.
- [ ] Website, logo, and socials are live.
- [ ] Wallet import instructions are published.
- [ ] At least one non-deployer user journey has been tested.
- [ ] Internal operations contacts and runbooks are recorded.

## Notes

- The Arbitrum implementation address matching the Ethereum token address is expected here; this is a cross-chain nonce artifact, not a conflict.
- For user-facing integrations, always use the Arbitrum proxy address `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F`.
- Do not sum L1 `totalSupply` and L2 `totalSupply` as separate circulating supplies. After bridging, the L1 tokens are locked in the custom gateway while the spendable representation exists on L2.
- The current live on-chain state shows the full `240,000,000 XPNT` mirrored on Arbitrum One, backed by the matching `240,000,000 XPNT` locked in the L1 custom gateway.
