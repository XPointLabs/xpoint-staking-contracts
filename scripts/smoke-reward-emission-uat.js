const { ethers, upgrades } = require("hardhat");
const { inspectUpgrade } = require("./reward-emission-upgrade-common");

async function latestUpgrade(proxy, implementation, fromBlock) {
    const event = new ethers.Interface(["event Upgraded(address indexed implementation)"]);
    const logs = await ethers.provider.getLogs({
        address: proxy,
        topics: [event.getEvent("Upgraded").topicHash],
        fromBlock,
        toBlock: "latest",
    });
    return logs
        .map((log) => ({ log, implementation: event.parseLog(log).args.implementation }))
        .filter((entry) => ethers.getAddress(entry.implementation) === ethers.getAddress(implementation))
        .at(-1)?.log;
}

async function main() {
    if (process.env.EXECUTE_CHECKPOINT !== "true") {
        throw new Error("Set EXECUTE_CHECKPOINT=true to authorize the UAT smoke checkpoint");
    }

    const [signer] = await ethers.getSigners();
    if (!signer) throw new Error("No UAT signer configured");
    const state = await inspectUpgrade();
    const rewards = state.rewards.connect(signer);
    const rewardPool = state.rewardPool.connect(signer);
    const token = new ethers.Contract(
        state.snapshot.rewardRatePool.token,
        ["function balanceOf(address) view returns (uint256)"],
        ethers.provider,
    );

    if ((await rewards.VERSION()) !== 2n || (await rewardPool.VERSION()) !== 2n) {
        throw new Error("UAT proxies are not running V2");
    }
    const exactStake = BigInt(state.snapshot.serviceNodeRewards.derivedActiveStake);
    if ((await rewards.totalActiveStake()) !== exactStake) {
        throw new Error("On-chain active stake differs from the sum of node deposits");
    }
    const poolBalance = await token.balanceOf(state.snapshot.rewardRatePool.proxy);
    const poolAnnualCap = poolBalance * 140n / 1000n;
    const stakeAnnualCap = exactStake * 300n / 1000n;
    const expectedAnnual = poolAnnualCap < stakeAnnualCap ? poolAnnualCap : stakeAnnualCap;
    if ((await rewardPool.annualEmission()) !== expectedAnnual) {
        throw new Error("annualEmission does not match min(14% pool, 30% active stake)");
    }

    const beforePaid = await rewardPool.totalPaidOut();
    const beforePool = await token.balanceOf(state.snapshot.rewardRatePool.proxy);
    const beforeBeneficiary = await token.balanceOf(state.snapshot.serviceNodeRewards.proxy);
    const checkpointTx = await rewardPool.checkpoint();
    const checkpointReceipt = await checkpointTx.wait();
    if (checkpointReceipt.status !== 1) throw new Error("V2 checkpoint reverted");
    const afterPaid = await rewardPool.totalPaidOut();
    const afterPool = await token.balanceOf(state.snapshot.rewardRatePool.proxy);
    const afterBeneficiary = await token.balanceOf(state.snapshot.serviceNodeRewards.proxy);
    const released = afterPaid - beforePaid;
    if (released <= 0n || beforePool - afterPool !== released || afterBeneficiary - beforeBeneficiary !== released) {
        throw new Error("V2 checkpoint accounting or token transfer mismatch");
    }

    const latestBlock = await ethers.provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 10_000);
    const serviceUpgrade = await latestUpgrade(
        state.snapshot.serviceNodeRewards.proxy,
        state.snapshot.serviceNodeRewards.implementation,
        fromBlock,
    );
    const rewardUpgrade = await latestUpgrade(
        state.snapshot.rewardRatePool.proxy,
        state.snapshot.rewardRatePool.implementation,
        fromBlock,
    );
    if (!serviceUpgrade || !rewardUpgrade) throw new Error("Could not locate both V2 Upgraded events");

    console.log(JSON.stringify({
        status: "ok",
        serviceNodeRewardsUpgrade: serviceUpgrade.transactionHash,
        rewardRatePoolUpgrade: rewardUpgrade.transactionHash,
        checkpoint: checkpointTx.hash,
        released: released.toString(),
        totalNodes: state.snapshot.serviceNodeRewards.totalNodes,
        totalActiveStake: exactStake.toString(),
        annualEmission: expectedAnnual.toString(),
        rewardRate: (await rewardPool.rewardRate()).toString(),
        implementations: {
            serviceNodeRewards: await upgrades.erc1967.getImplementationAddress(
                state.snapshot.serviceNodeRewards.proxy,
            ),
            rewardRatePool: await upgrades.erc1967.getImplementationAddress(
                state.snapshot.rewardRatePool.proxy,
            ),
        },
    }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
