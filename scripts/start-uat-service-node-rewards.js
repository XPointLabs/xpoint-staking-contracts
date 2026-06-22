const hre = require("hardhat");

const DEFAULT_REWARDS_ADDRESS = "0x08A5a47E67fCd18e14AdFB535e8d8644476D4197";

async function main() {
  if (hre.network.name !== "arbitrumSepolia") {
    throw new Error("start-uat-service-node-rewards must run with --network arbitrumSepolia.");
  }

  const rewardsAddress = process.env.SERVICE_NODE_REWARDS_ADDRESS || DEFAULT_REWARDS_ADDRESS;
  const [signer] = await hre.ethers.getSigners();
  if (!signer) {
    throw new Error("No signer configured. Set ARB_SEPOLIA_MNEMONIC or ARB_SEPOLIA_PRIVATE_KEY.");
  }

  const signerAddress = await signer.getAddress();
  const rewards = await hre.ethers.getContractAt("ServiceNodeRewards", rewardsAddress, signer);
  const owner = await rewards.owner();
  const isStarted = await rewards.isStarted();
  const stakingRequirement = await rewards.stakingRequirement();
  const totalNodes = await rewards.totalNodes();

  console.log("ServiceNodeRewards:", rewardsAddress);
  console.log("Signer:", signerAddress);
  console.log("Owner:", owner);
  console.log("Started:", isStarted);
  console.log("Staking requirement:", stakingRequirement.toString());
  console.log("Total nodes:", totalNodes.toString());

  if (owner.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Signer ${signerAddress} is not owner ${owner}.`);
  }

  if (isStarted) {
    console.log("No-op: ServiceNodeRewards is already started.");
    return;
  }

  const tx = await rewards.start();
  console.log("start() tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("start() block:", receipt.blockNumber);
  console.log("Started after tx:", await rewards.isStarted());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
