# Deep XPoint Staking Contracts

This contract is designed to facilitate the integration and functioning of the
XPoint token within the Deep network. The codebase preserves the Session
staking and reward distribution semantics while issuing a new Deep Ecosystem
token:

## Agent Specs

- Start with [`AGENTS.md`](AGENTS.md) before changing contracts, deployment scripts, token economics, or tests.
- Use [`docs/SESSION_PORTING.md`](docs/SESSION_PORTING.md) for Session staking/reward migration rules.
- `AGENT_NODE_X64.md` remains the host/runtime note for Node x64-specific agent setup.

- Token name: XPoint
- Ticker: XPNT
- Meaning: Access · Contribution · Exchange
- Positioning: a private decentralized network where XPoint is the unit of
  access and contribution.

## Production Deployment Record

The production staking stack is deployed on Arbitrum One for the existing XPNT
token. The ignored local JSON manifests were copied into committed markdown so
the deployment record survives workspace cleanup:

- Full deployment runbook: [`docs/ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md`](docs/ARBITRUM_STAKING_PRODUCTION_DEPLOYMENT.md)
- Raw manifest snapshot: [`docs/ARBITRUM_STAKING_PRODUCTION_MANIFEST.md`](docs/ARBITRUM_STAKING_PRODUCTION_MANIFEST.md)
- Mainnet launch runbook: [`docs/XPNT_MAINNET_LAUNCH_RUNBOOK.md`](docs/XPNT_MAINNET_LAUNCH_RUNBOOK.md)

Canonical Arbitrum One addresses:

| Item | Address / Value |
| --- | --- |
| XPNT token | `0x63B2cdb8B0d8774F1Fdca91D24803698582a079F` |
| ServiceNodeRewards proxy | `0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f` |
| ServiceNodeContributionFactory proxy | `0x289d88A8C06881634Fb619Ec528361C7b88521f1` |
| RewardRatePool proxy | `0xEd894fb5f0BA3b141A562190D4c9941FEd348356` |
| Staking requirement | `25,000 XPNT` (`25000000000000` atomic) |
| Reward pool initial deposit | `40,000,000 XPNT` |
| Owner / deployer | `0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750` |
| ServiceNodeRewards started after deploy | `false` |
| Subscription contracts deployed | `false` |

The core of the codebase is split
into two components: the existing C++ codebase, which handles various service
node responsibilities like uptime tracking, reward calculations, and other
duties; and the smart contract system, which keeps the Session staking contract
lineage while issuing XPNT for Deep.

The rewards contract manages the dynamics of nodes within the network. It
handles various crucial operations such as the admission of node operators
through stake deposits, broadcasting new node details across the network via
events/logs, managing the exit of stakers with an associated unlock period, and
the distribution of earned rewards. One of the key features of the rewards
contract is its use of BLS signatures. This technology enables the aggregation
of multiple signatures into a single, verifiable entity, ensuring that rewards
are distributed only when a consensus (e.g., 95% agreement within the network)
is achieved regarding the amount to be claimed.

## Building and Tests

There are 3 testing frameworks in use,

  - Javascript: Unit tests via Hardhat
  - C++: Integration tests via RPC over a devnet (like a local `hardhat node`)
  - Echidna: Fuzz testing of the smart contract over a devnet

### Javascript

Contracts can be compiled and tested against unit tests run by executing:

```
npm install -g pnpm            # If you don't have pnpm installed yet
pnpm install --frozen-lockfile # Install the dependencies
pnpm build                     # Build the JS unit-tests and Solidity contracts
pnpm test                      # Run the JS unit-tests
pnpm export-abis               # Export selected ABIs to ./abi
pnpm deploy-local-devnet       # Deploy XPNT staking contracts to a local node
pnpm devnet-smoke              # Verify XPNT metadata, reward constants, and seeded node state
```

### C++

Integration tests require running a devnet first with the deployed smart
contracts followed by running the C++ tests which will communicate with the
given network. First setup the devnet:

```
make node         # Run the local devnet (note: This blocks the terminal)
make deploy-local-devnet # Deploy the smart contracts onto the devnet
```

Then execute the C++ tests by compilin and running, for example:

```
cd test/cpp/
cmake -B build -S .
cmake --build build --parallel --verbose

# Run the tests
./test/cpp/build/test/rewards_contract_Tests
```

### Echidna

Get [echidna](https://github.com/crytic/echidna) and place it onto your path.
Echidna also relies on [slither](https://github.com/crytic/slither) a static
analyzer that uses Python 3 and hence can be installed via
`python -m pip install slither-analyzer`.

Fuzz testing may then be run by executing:

```
make node # Run the local devnet (note: This blocks the terminal)
echidna . --contract ServiceNodeContributionEchidnaTest --config echidna-local.config.yml

# Or alternatively via the make target

make fuzz
```

We run Echidna in `assertion` testing mode which allows echidna to simulate
multiple senders (because our contracts can potentially use multiple wallets).
`property` testing mode simulates the transactions as if they were originating
from the smart contract which is not as useful for testing our contracts.

### Slither

You can run `slither` a static analyzer separately from Echidna by executing:

```
make analyze
```

## Scripts

- `scripts/attach-and-dump-sn-rewards-stats.js`

  Attaches to the `ServiceNodeRewards` instance specified in the script and
  dumps the current state of the contract. This script is RPC heavy as it
  scrapes contributors and service nodes information which currently is done
  with 1 request per entry.

  This script can be run via hardhat, e.g:

    npx hardhat run --network arbitrumSepolia scripts/attach-and-dump-sn-rewards-stats.js

