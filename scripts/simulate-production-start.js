const { ethers, network } = require("hardhat");

const OWNER = "0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750";
const SERVICE_NODE_REWARDS = "0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f";
const EXPECTED_IMPLEMENTATION = "0x5D006b3d22d063C63A0257E077fd0517E1290b84";

async function implementation(proxy) {
    const slot = ethers.toBeHex(BigInt(ethers.id("eip1967.proxy.implementation")) - 1n, 32);
    const value = await ethers.provider.getStorage(proxy, slot);
    return ethers.getAddress(`0x${value.slice(-40)}`);
}

async function main() {
    if (!process.env.PRODUCTION_FORK_RPC_URL) throw new Error("PRODUCTION_FORK_RPC_URL is required");
    await network.provider.send("hardhat_setBalance", [OWNER, "0x56BC75E2D63100000"]);
    await network.provider.send("evm_mine");
    const owner = await ethers.getImpersonatedSigner(OWNER);
    const rewards = await ethers.getContractAt("ServiceNodeRewards", SERVICE_NODE_REWARDS, owner);

    if ((await rewards.VERSION()) !== 2n) throw new Error("Production fork is not running V2");
    if (ethers.getAddress(await rewards.owner()) !== OWNER) throw new Error("Unexpected contract owner");
    if (ethers.getAddress(await implementation(SERVICE_NODE_REWARDS)) !== EXPECTED_IMPLEMENTATION) {
        throw new Error("Unexpected ServiceNodeRewards implementation");
    }
    if (await rewards.isStarted()) throw new Error("Production is already started");

    const receipt = await (await rewards.start()).wait();
    if (receipt.status !== 1 || !(await rewards.isStarted())) throw new Error("start() simulation failed");

    console.log(JSON.stringify({
        status: "ok",
        serviceNodeRewards: SERVICE_NODE_REWARDS,
        version: (await rewards.VERSION()).toString(),
        implementation: await implementation(SERVICE_NODE_REWARDS),
        isStarted: await rewards.isStarted(),
        totalNodes: (await rewards.totalNodes()).toString(),
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
