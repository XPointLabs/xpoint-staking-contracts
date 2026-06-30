const { ethers, upgrades } = require("hardhat");

const PROXY_ADMIN_ABI = ["function owner() view returns (address)"];

function requiredAddress(name) {
    const value = process.env[name];
    if (!value || !ethers.isAddress(value)) {
        throw new Error(`${name} must contain a valid address`);
    }
    return ethers.getAddress(value);
}

async function sumActiveStake(rewards) {
    const [ids] = await rewards.allServiceNodeIDs();
    let total = 0n;
    for (const id of ids) {
        const node = await rewards.serviceNodes(id);
        total += node.deposit;
    }
    return { nodeIds: ids.map(String), total };
}

async function inspectUpgrade({ validate = true } = {}) {
    const serviceNodeRewardsAddress = requiredAddress("SERVICE_NODE_REWARDS_ADDRESS");
    const rewardRatePoolAddress = requiredAddress("REWARD_RATE_POOL_ADDRESS");
    const network = await ethers.provider.getNetwork();
    const expectedChainId = BigInt(process.env.EXPECTED_CHAIN_ID || "421614");
    if (network.chainId !== expectedChainId) {
        throw new Error(`Refusing chain ${network.chainId}; expected ${expectedChainId}`);
    }

    for (const [name, address] of [
        ["ServiceNodeRewards", serviceNodeRewardsAddress],
        ["RewardRatePool", rewardRatePoolAddress],
    ]) {
        if ((await ethers.provider.getCode(address)) === "0x") {
            throw new Error(`${name} has no code at ${address}`);
        }
    }

    const ServiceNodeRewards = await ethers.getContractFactory("ServiceNodeRewards");
    const RewardRatePool = await ethers.getContractFactory("RewardRatePool");
    if (validate) {
        await upgrades.validateUpgrade(serviceNodeRewardsAddress, ServiceNodeRewards, { kind: "transparent" });
        await upgrades.validateUpgrade(rewardRatePoolAddress, RewardRatePool, { kind: "transparent" });
    }

    const rewards = ServiceNodeRewards.attach(serviceNodeRewardsAddress).connect(ethers.provider);
    const rewardPool = RewardRatePool.attach(rewardRatePoolAddress).connect(ethers.provider);
    const serviceNodeRewardsAdmin = await upgrades.erc1967.getAdminAddress(serviceNodeRewardsAddress);
    const rewardRatePoolAdmin = await upgrades.erc1967.getAdminAddress(rewardRatePoolAddress);
    const serviceNodeRewardsAdminContract = new ethers.Contract(
        serviceNodeRewardsAdmin,
        PROXY_ADMIN_ABI,
        ethers.provider,
    );
    const rewardRatePoolAdminContract = new ethers.Contract(
        rewardRatePoolAdmin,
        PROXY_ADMIN_ABI,
        ethers.provider,
    );
    const activeStake = await sumActiveStake(rewards);
    const snapshot = {
        chainId: network.chainId.toString(),
        serviceNodeRewards: {
            proxy: serviceNodeRewardsAddress,
            version: (await rewards.VERSION()).toString(),
            implementation: await upgrades.erc1967.getImplementationAddress(serviceNodeRewardsAddress),
            proxyAdmin: serviceNodeRewardsAdmin,
            proxyAdminOwner: await serviceNodeRewardsAdminContract.owner(),
            owner: await rewards.owner(),
            foundationPool: await rewards.foundationPool(),
            designatedToken: await rewards.designatedToken(),
            totalNodes: (await rewards.totalNodes()).toString(),
            isStarted: await rewards.isStarted(),
            stakingRequirement: (await rewards.stakingRequirement()).toString(),
            derivedActiveStake: activeStake.total.toString(),
            nodeIds: activeStake.nodeIds,
        },
        rewardRatePool: {
            proxy: rewardRatePoolAddress,
            version: (await rewardPool.VERSION()).toString(),
            implementation: await upgrades.erc1967.getImplementationAddress(rewardRatePoolAddress),
            proxyAdmin: rewardRatePoolAdmin,
            proxyAdminOwner: await rewardRatePoolAdminContract.owner(),
            owner: await rewardPool.owner(),
            beneficiary: await rewardPool.beneficiary(),
            token: await rewardPool.XPNT(),
            balance: (await rewardPool.XPNT().then((token) =>
                new ethers.Contract(token, ["function balanceOf(address) view returns (uint256)"], ethers.provider)
                    .balanceOf(rewardRatePoolAddress)
            )).toString(),
            totalPaidOut: (await rewardPool.totalPaidOut()).toString(),
            lastPaidOutTime: (await rewardPool.lastPaidOutTime()).toString(),
        },
        storageValidation: validate ? "passed" : "skipped",
    };

    if (ethers.getAddress(snapshot.serviceNodeRewards.foundationPool) !== rewardRatePoolAddress) {
        throw new Error("ServiceNodeRewards.foundationPool does not match REWARD_RATE_POOL_ADDRESS");
    }
    if (ethers.getAddress(snapshot.rewardRatePool.beneficiary) !== serviceNodeRewardsAddress) {
        throw new Error("RewardRatePool.beneficiary does not match SERVICE_NODE_REWARDS_ADDRESS");
    }
    if (ethers.getAddress(snapshot.serviceNodeRewards.designatedToken) !== ethers.getAddress(snapshot.rewardRatePool.token)) {
        throw new Error("ServiceNodeRewards and RewardRatePool use different XPNT tokens");
    }

    return { snapshot, rewards, rewardPool, ServiceNodeRewards, RewardRatePool };
}

module.exports = { inspectUpgrade };
