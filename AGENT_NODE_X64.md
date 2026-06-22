# Project-Scoped Node x64 Runbook

Use the vendored x64 Node under `.tools/node-v22.2.0-win-x64` for Hardhat and test runs on this repo when the host shell is Windows arm64.

## Why

The system Node on this machine resolves to `win32 arm64`, but this repo's Hardhat stack is currently only stable when the process runs under x64 Node.

## How to run

```powershell
Set-Location c:/Work/Deep/xpoint-staking-contracts
$nodeRoot = (Resolve-Path .tools/node-v22.2.0-win-x64).Path
$env:Path = "$nodeRoot;$nodeRoot/node_modules/npm/bin;$env:Path"
npm --version
npx pnpm@9.1.3 install
npx hardhat test test/unit-js/CppPortedFromCpp.test.js
```

## Notes

- Always verify `node -e "console.log(process.platform, process.arch)"` prints `win32 x64` before launching Hardhat.
- The ported JS suite currently skips the single `exitBLSPublicKeyAfterWaitTime` success-path case because this environment can trigger an EDR panic on that path.
- The C# test tree was removed; future port work should continue in `test/unit-js`.
- The C++ test cases targeted for this repo have already been ported into JS where feasible; do not rerun the C++ test suite unless you are explicitly working on the remaining native reference code.