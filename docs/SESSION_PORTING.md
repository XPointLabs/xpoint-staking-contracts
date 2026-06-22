# Session Porting Spec - Staking Contracts

Last updated: 2026-06-10.

## Scope

This document governs migration of Session/Oxen staking and reward contract semantics into XPNT Deep contracts.

## Reference Sources

- Existing ported C++ tests under `test/cpp`.
- JS tests under `test/unit-js`.
- Solidity contracts under `contracts`.
- Upstream Session/Oxen contract references when available under `../source`.

## Porting Workflow

1. Identify the upstream Session staking/reward invariant.
2. Locate or add a JS unit test and, for core reward logic, a C++ parity test.
3. Implement the Solidity change.
4. Run JS tests and relevant C++/Echidna coverage.
5. Export ABIs if public interfaces changed.
6. Update backend/devops/e2e consumers and docs.

## Required Semantics

- Service node contribution lifecycle.
- Reward distribution and claim accounting.
- Unlock/exit timing.
- BLS signature verification assumptions.
- XPNT token metadata and 9-decimal atomic unit accounting.
- Deployment manifest fields consumed by backend/devops.

## Accepted Deep Extensions

- XPNT replaces upstream token economics while retaining service-node reward lineage.
- Arbitrum bridge and XPNT-specific deployment flows are Deep extensions.
- Subscription and ops budget contracts are Deep-specific unless tied to Session parity.

## Evidence Checklist

- upstream invariant or existing parity test reference,
- JS unit test,
- C++ parity or Echidna coverage when arithmetic/security critical,
- ABI export if interfaces changed,
- deployment/runbook update if scripts/config changed,
- downstream backend/e2e update if event or ABI shape changed.

## Stop-The-Line Conditions

- Economic behavior changes without explicit Deep decision and tests.
- Reward claim validation weakens BLS/security assumptions.
- Event shape changes without backend projection updates.
- Deployment scripts can run on the wrong network without guardrails.
