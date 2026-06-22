# Agent Specification - Deep Staking Contracts

Last updated: 2026-06-10.

## Mission

`xpoint-staking-contracts` owns XPNT token, staking, reward, contribution, subscription, vesting, bridge, deployment, and contract-level migration behavior for Deep.

The repo preserves Session staking/reward lineage while issuing and operating XPNT for Deep.

## Source Of Truth

- Existing contract docs: `docs/MIGRATION.md`, `docs/XPNT_MAINNET_LAUNCH_RUNBOOK.md`.
- Porting rules: `docs/SESSION_PORTING.md`.
- Node/runtime note: `AGENT_NODE_X64.md`.
- Backend projection consumer: `../xpoint-staking-backend/AGENTS.md`.
- Registry/devops release consumers: `../deep-registry-api/AGENTS.md`, `../deep-devops/AGENTS.md`.

## Ownership Boundaries

Owned here:

- Solidity contracts under `contracts/`,
- Hardhat config, deployment scripts, ABI export,
- JS unit tests,
- C++ parity/integration tests,
- Echidna fuzz config and properties,
- deployment manifests and runbooks.

Not owned here:

- Backend projection code,
- registry state,
- client/runtime UI,
- CI orchestration outside contract scripts.

## New Deep Solution Rules

Contract changes must preserve:

- XPNT metadata and decimals,
- staking requirement and reward accounting invariants,
- contribution and unlock safety,
- BLS/reward claim validation assumptions,
- upgrade/deploy script reproducibility,
- ABI export compatibility for backend/devops consumers.

Never make economic or permission changes without tests and docs.

## Session Compatibility Rules

Session lineage matters for:

- service node contribution lifecycle,
- reward distribution behavior,
- unlock/exit timing,
- BLS signature verification assumptions,
- C++ parity tests ported from Session reward logic.

If Deep intentionally changes economics, document it as a Deep extension and update backend/devops/e2e consumers.

## Required Verification

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm export-abis
```

When changing invariants or arithmetic, also run relevant C++ and Echidna tests:

```powershell
make fuzz
```

Run deployment smoke scripts for deployment-script changes.

## Acceptance Gates

A contract change is complete only when:

- JS unit tests cover the changed behavior,
- C++ parity tests or fixtures are updated for Session-derived semantics,
- ABI changes are exported and downstream consumers are updated,
- deployment/runbook docs are updated for script/address changes,
- security implications are documented.

## Stop-The-Line Conditions

- Reward/stake accounting changes without parity tests.
- ABI changes without backend/devops updates.
- Deployment scripts can deploy with missing critical addresses or wrong network.
- A fuzz/security finding is ignored.
- Private keys/RPC secrets are committed or printed.

## Agent Workflow

1. Read this file, `docs/SESSION_PORTING.md`, and relevant contract tests.
2. Decide if the change is economic, permissioning, deployment, bridge, or test-only.
3. Add/update tests before changing Solidity.
4. Run focused and full test commands as feasible.
5. Export ABIs if public contract interfaces changed.
6. Update backend/devops/e2e docs or fixtures for downstream impact.
