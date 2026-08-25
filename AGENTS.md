# XPoint Staking Contracts agent rules

The workspace rules in `../AGENTS.md` apply. This file contains only contract-specific deltas.

## Owns

- XPNT token, staking, rewards, contribution, subscription, vesting and bridge contracts.
- Hardhat deployment/upgrade scripts, manifests, ABI export, unit/parity and fuzz tests.
- Contract-level economic, permission and lifecycle invariants.

Projection code belongs in `xpoint-staking-backend`; registry/client/UI behavior belongs in their
repos; environment orchestration belongs in `deep-devops`.

## Repository rules

- Economic, permission, upgradeability and timing changes require explicit scope, tests and docs.
- Preserve accounting conservation, stake/unlock safety, reward caps and signature validation.
- Deployment scripts fail closed on wrong chain, address, owner, implementation or manifest state.
- Never commit or print deployer keys, mnemonics, RPC credentials or multisig signing material.
- ABI changes require regenerated exports and coordinated backend/portal/devops consumer updates.
- Treat historical Session-derived audits/tests as evidence, not an active compatibility surface.
- Keep production addresses in reviewed deployment manifests; do not duplicate them in code.

## Verify

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm export-abis
```

Run the relevant deployment simulation for script/manifest changes and `make fuzz` for arithmetic,
authorization or state-machine changes.
