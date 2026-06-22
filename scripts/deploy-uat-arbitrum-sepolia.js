const hre = require("hardhat");
require("./deploy-common.js")();

const XPNT_UNIT = 1_000_000_000n;

function xpntAmount(name, fallback) {
  const raw = process.env[name];
  return raw ? BigInt(raw) * XPNT_UNIT : fallback * XPNT_UNIT;
}

async function main() {
  if (hre.network.name !== "arbitrumSepolia") {
    console.error("Error: deploy-uat-arbitrum-sepolia must run with --network arbitrumSepolia.");
    process.exitCode = 1;
    return;
  }

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    console.error(
      "Error: set ARB_SEPOLIA_MNEMONIC or ARB_SEPOLIA_PRIVATE_KEY before deploying UAT contracts.",
    );
    process.exitCode = 1;
    return;
  }

  const deployer = signers[0];
  const deployerAddress = await deployer.getAddress();
  const balance = await hre.ethers.provider.getBalance(deployerAddress);
  if (balance === 0n) {
    console.error(
      `Error: deployer ${deployerAddress} has 0 ETH on Arbitrum Sepolia; fund it before deploy.`,
    );
    process.exitCode = 1;
    return;
  }

  const args = {
    XPNT_UNIT,
    SUPPLY: xpntAmount("XPNT_UAT_SUPPLY", 240_000_000n),
    POOL_INITIAL: xpntAmount("XPNT_UAT_POOL_INITIAL", 40_000_000n),
    STAKING_REQ: xpntAmount("XPNT_UAT_STAKING_REQUIREMENT", 120n),
    TOKEN_ADDRESS: process.env.XPNT_TOKEN_ADDRESS || "",
  };

  const verify = process.env.XPNT_UAT_VERIFY === "true";
  const deployment = await deployTestnetContracts("XPoint UAT", "XPNT", args, verify);
  if (!deployment) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
