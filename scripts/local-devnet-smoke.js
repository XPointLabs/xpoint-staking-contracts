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
  const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);

  await assertEqual(deployment.schemaVersion, 1, "deployment schema version");
  await assertEqual(deployment.chainId, chainId, "deployment chain id");
  await assertEqual(deployment.network, hre.network.name, "deployment network");
  if (!/^[0-9a-f]{64}$/.test(deployment.lifecycleId ?? "")) {
    throw new Error("deployment lifecycle id is missing or invalid");
  }

  for (const [name, transaction] of Object.entries(deployment.deploymentTransactions ?? {})) {
    if (!transaction?.hash || !transaction?.blockHash || !transaction?.contractAddress) {
      throw new Error(`${name} deployment transaction identity is incomplete`);
    }
    const receipt = await hre.ethers.provider.getTransactionReceipt(transaction.hash);
    if (!receipt) {
      throw new Error(`${name} deployment receipt is unavailable`);
    }
    await assertEqual(receipt.blockHash, transaction.blockHash, `${name} deployment block hash`);
    await assertEqual(receipt.contractAddress, transaction.contractAddress, `${name} deployment contract address`);
    const code = await hre.ethers.provider.getCode(transaction.contractAddress);
    if (code === "0x") {
      throw new Error(`${name} deployment contract has no bytecode`);
    }
  }

  const token = await hre.ethers.getContractAt("XPNT", deployment.contracts.token);
  const rewards = await hre.ethers.getContractAt("ServiceNodeRewards", deployment.contracts.serviceNodeRewards);
  const rewardPool = await hre.ethers.getContractAt("RewardRatePool", deployment.contracts.rewardRatePool);

  await assertEqual(await token.name(), "XPoint", "token name");
  await assertEqual(await token.symbol(), "XPNT", "token symbol");
  await assertEqual(await token.decimals(), 9n, "token decimals");
  await assertEqual(await rewards.designatedToken(), deployment.contracts.token, "designated token");
  await assertEqual(await rewardPool.ANNUAL_SIMPLE_PAYOUT_RATE(), 140n, "pool annual payout rate");
  await assertEqual(await rewardPool.ACTIVE_STAKE_ANNUAL_PAYOUT_RATE(), 300n, "active stake annual payout rate");
  await assertEqual(await rewardPool.BASIS_POINTS(), 1000n, "reward pool basis points");
  await assertEqual(await rewardPool.activeStakeProvider(), deployment.contracts.serviceNodeRewards, "active stake provider");

  const stakingRequirement = await rewards.stakingRequirement();
  const seed = [{
    blsPubkey: {
      data: "0x0000000000000000000000000000000014ea54b24c3dae4c5d072e75299096f9c3d4c6902112bdb45ef18281bfc4143b240662d454316092acebafdc7fb427cb0000000000000000000000000000000013b8723cc024f36fec399ced021d647a9c3ecaf5ddb6b4bdb0e0a851f6280b22163912ade7128db8a5266490fd682f15",
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
  await assertEqual(await rewards.totalActiveStake(), stakingRequirement, "seeded active stake");
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
