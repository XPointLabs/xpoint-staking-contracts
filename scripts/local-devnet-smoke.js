const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const deploymentPath = path.join(__dirname, "..", "deployments", `${hre.network.name}.latest.json`);
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment manifest not found: ${deploymentPath}`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const [owner] = await hre.ethers.getSigners();

  const token = await hre.ethers.getContractAt("XPNT", deployment.contracts.token);
  const rewards = await hre.ethers.getContractAt("ServiceNodeRewards", deployment.contracts.serviceNodeRewards);
  const rewardPool = await hre.ethers.getContractAt("RewardRatePool", deployment.contracts.rewardRatePool);

  await assertEqual(await token.name(), "XPoint", "token name");
  await assertEqual(await token.symbol(), "XPNT", "token symbol");
  await assertEqual(await token.decimals(), 9n, "token decimals");
  await assertEqual(await rewards.designatedToken(), deployment.contracts.token, "designated token");
  await assertEqual(await rewardPool.ANNUAL_SIMPLE_PAYOUT_RATE(), 151n, "annual simple payout rate");
  await assertEqual(await rewardPool.BASIS_POINTS(), 1000n, "reward pool basis points");

  const stakingRequirement = await rewards.stakingRequirement();
  const seed = [{
    blsPubkey: {
      X: "0x12c59fb45c483177873406e5b74a2e6914fe25a591185f30d2788e737da6f2ed",
      Y: "0x016e56f330d11faaf90ec281b1c4184e98a52d4043075fcbe45a976de0f795ab",
    },
    ed25519Pubkey: 1n,
    addedTimestamp: Math.floor(Date.now() / 1000),
    contributors: [{
      staker: {
        addr: owner.address,
        beneficiary: owner.address,
      },
      stakedAmount: stakingRequirement,
    }],
  }];

  await (await rewards.seedPublicKeyList(seed)).wait();
  await assertEqual(await rewards.totalNodes(), 1n, "seeded service node count");
  await (await rewards.start()).wait();

  console.log(JSON.stringify({
    ok: true,
    network: hre.network.name,
    token: deployment.token,
    contracts: deployment.contracts,
    totalNodes: (await rewards.totalNodes()).toString(),
    stakingRequirement: stakingRequirement.toString(),
  }, null, 2));
}

async function assertEqual(actual, expected, label) {
  const actualValue = typeof actual === "bigint" ? actual : actual?.toString?.() ?? actual;
  const expectedValue = typeof expected === "bigint" ? expected : expected?.toString?.() ?? expected;
  if (actualValue !== expectedValue) {
    throw new Error(`${label}: expected ${expectedValue}, got ${actualValue}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
