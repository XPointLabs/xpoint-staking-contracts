const { ethers, network } = require("hardhat");

const CONFIG = {
    chainId: 42161n,
    owner: "0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750",
    serviceNodeRewards: "0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f",
    rewardRatePool: "0xEd894fb5f0BA3b141A562190D4c9941FEd348356",
};
const PROXY_ADMIN_ABI = [
    "function owner() view returns (address)",
    "function upgradeAndCall(address proxy, address implementation, bytes data) payable",
];

async function proxyAdminAddress(proxy) {
    const slot = ethers.toBeHex(BigInt(ethers.id("eip1967.proxy.admin")) - 1n, 32);
    const value = await ethers.provider.getStorage(proxy, slot);
    return ethers.getAddress(`0x${value.slice(-40)}`);
}

async function main() {
    const forkUrl = process.env.PRODUCTION_FORK_RPC_URL;
    if (!forkUrl) throw new Error("PRODUCTION_FORK_RPC_URL is required");
    await network.provider.send("hardhat_setBalance", [CONFIG.owner, "0x56BC75E2D63100000"]);
    await network.provider.send("evm_mine");
    const owner = await ethers.getImpersonatedSigner(CONFIG.owner);

    const ServiceNodeRewards = await ethers.getContractFactory("ServiceNodeRewards", owner);
    const RewardRatePool = await ethers.getContractFactory("RewardRatePool", owner);
    const rewards = ServiceNodeRewards.attach(CONFIG.serviceNodeRewards);
    const rewardPool = RewardRatePool.attach(CONFIG.rewardRatePool);
    const [ids] = await rewards.allServiceNodeIDs();
    let derivedStake = 0n;
    for (const id of ids) derivedStake += (await rewards.serviceNodes(id)).deposit;
    const before = {
        serviceOwner: await rewards.owner(),
        poolOwner: await rewardPool.owner(),
        totalNodes: await rewards.totalNodes(),
        beneficiary: await rewardPool.beneficiary(),
        token: await rewardPool.XPNT(),
        totalPaidOut: await rewardPool.totalPaidOut(),
    };

    const serviceAdminAddress = await proxyAdminAddress(CONFIG.serviceNodeRewards);
    const rewardAdminAddress = await proxyAdminAddress(CONFIG.rewardRatePool);
    const serviceAdmin = new ethers.Contract(serviceAdminAddress, PROXY_ADMIN_ABI, owner);
    const rewardAdmin = new ethers.Contract(rewardAdminAddress, PROXY_ADMIN_ABI, owner);
    if (ethers.getAddress(await serviceAdmin.owner()) !== CONFIG.owner ||
        ethers.getAddress(await rewardAdmin.owner()) !== CONFIG.owner) {
        throw new Error("Production owner does not own both ProxyAdmins");
    }

    const serviceImplementation = await ServiceNodeRewards.deploy();
    await serviceImplementation.waitForDeployment();
    const rewardImplementation = await RewardRatePool.deploy();
    await rewardImplementation.waitForDeployment();
    await (await serviceAdmin.upgradeAndCall(
        CONFIG.serviceNodeRewards,
        await serviceImplementation.getAddress(),
        ServiceNodeRewards.interface.encodeFunctionData("initializeV2"),
    )).wait();

    await (await rewardPool.checkpoint()).wait();

    await (await rewardAdmin.upgradeAndCall(
        CONFIG.rewardRatePool,
        await rewardImplementation.getAddress(),
        RewardRatePool.interface.encodeFunctionData("initializeV2", [CONFIG.serviceNodeRewards]),
    )).wait();

    if ((await rewards.VERSION()) !== 2n || (await rewardPool.VERSION()) !== 2n) {
        throw new Error("Fork proxies did not reach V2");
    }
    if ((await rewards.totalActiveStake()) !== derivedStake) throw new Error("Fork active stake mismatch");
    if ((await rewards.totalNodes()) !== before.totalNodes) throw new Error("Fork node count changed");
    if (ethers.getAddress(await rewards.owner()) !== ethers.getAddress(before.serviceOwner) ||
        ethers.getAddress(await rewardPool.owner()) !== ethers.getAddress(before.poolOwner) ||
        ethers.getAddress(await rewardPool.beneficiary()) !== ethers.getAddress(before.beneficiary) ||
        ethers.getAddress(await rewardPool.XPNT()) !== ethers.getAddress(before.token)) {
        throw new Error("Fork upgrade changed an ownership or contract relationship");
    }
    if ((await rewardPool.totalPaidOut()) < before.totalPaidOut) throw new Error("Fork paid-out counter decreased");

    console.log(JSON.stringify({
        status: "ok",
        forkChainId: CONFIG.chainId.toString(),
        totalNodes: before.totalNodes.toString(),
        totalActiveStake: derivedStake.toString(),
        annualEmission: (await rewardPool.annualEmission()).toString(),
        rewardRate: (await rewardPool.rewardRate()).toString(),
        implementations: {
            serviceNodeRewards: await serviceImplementation.getAddress(),
            rewardRatePool: await rewardImplementation.getAddress(),
        },
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
