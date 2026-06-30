require("@nomicfoundation/hardhat-toolbox");
require('@openzeppelin/hardhat-upgrades');
require("hardhat-diamond-abi");
require("@nomicfoundation/hardhat-verify");

require("dotenv/config");

function accountsFromEnv(privateKeyName, mnemonicName, indexName, countName) {
  if (process.env[privateKeyName]) {
    return [process.env[privateKeyName]];
  }

  if (process.env[mnemonicName]) {
    return {
      mnemonic: process.env[mnemonicName],
      path: "m/44'/60'/0'/0",
      initialIndex: Number(process.env[indexName] || 0),
      count: Number(process.env[countName] || 1),
    };
  }

  return [];
}

const arb_sepolia_account = accountsFromEnv(
  "ARB_SEPOLIA_PRIVATE_KEY",
  "ARB_SEPOLIA_MNEMONIC",
  "ARB_SEPOLIA_MNEMONIC_INDEX",
  "ARB_SEPOLIA_MNEMONIC_COUNT",
);
const arb_account = process.env.ARB_PRIVATE_KEY ? [process.env.ARB_PRIVATE_KEY] : [];
const eth_account = process.env.ETH_PRIVATE_KEY ? [process.env.ETH_PRIVATE_KEY] : [];
const arb_mainnet_rpc_url = process.env.ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc";
const eth_sepolia_rpc_url = process.env.ETH_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const arb_sepolia_rpc_url = process.env.ARB_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const eth_mainnet_rpc_url = process.env.ETH_MAINNET_RPC_URL || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  networks: {
      hardhat: {
        ...(process.env.PRODUCTION_FORK_RPC_URL
          ? { forking: { url: process.env.PRODUCTION_FORK_RPC_URL } }
          : {}),
      },
      arbitrum: {
         url: arb_mainnet_rpc_url,
         chainId: 42161,
         accounts: arb_account,
      },
      sepolia: {
        url: eth_sepolia_rpc_url,
        chainId: 11155111,
        accounts: arb_sepolia_account,
      },
      arbitrumSepolia: {
         url: arb_sepolia_rpc_url,
         chainId: 421614,
         accounts: arb_sepolia_account,
      },
      mainnet: {
          url: eth_mainnet_rpc_url,
          chainId: 1,
          accounts: eth_account,
      },
  },
  solidity: {
    version: '0.8.30',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
      metadata: {
        // do not include the metadata hash, since this is machine dependent
        // and we want all generated code to be deterministic
        // https://docs.soliditylang.org/en/v0.7.6/metadata.html
        bytecodeHash: 'none',
      },
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  sourcify: {
    enabled: true,
  },
  diamondAbi: {
    name: "ServiceNodeRewardsCombined",
    include: ["ServiceNodeRewards", "IERC20"],
    strict: false,
  },
  paths: {
    tests: "./test/unit-js"
  },
};

