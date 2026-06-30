const fs = require("fs");
const path = require("path");
const { ethers, upgrades } = require("hardhat");
const { inspectUpgrade } = require("./reward-emission-upgrade-common");

async function main() {
    if (process.env.EXECUTE_UPGRADE !== "true") {
        throw new Error("Set EXECUTE_UPGRADE=true to authorize the UAT upgrade");
    }

    const [signer] = await ethers.getSigners();
    if (!signer) throw new Error("No deployment signer configured");

    const preflight = await inspectUpgrade();
    const signerAddress = await signer.getAddress();
    const adminOwners = [
        preflight.snapshot.serviceNodeRewards.proxyAdminOwner,
        preflight.snapshot.rewardRatePool.proxyAdminOwner,
    ].map(ethers.getAddress);
    if (adminOwners.some((owner) => owner !== ethers.getAddress(signerAddress))) {
        throw new Error(`Configured signer ${signerAddress} does not own both ProxyAdmins`);
    }

    const serviceNodeRewards = await upgrades.upgradeProxy(
        preflight.snapshot.serviceNodeRewards.proxy,
        preflight.ServiceNodeRewards,
        { kind: "transparent", call: { fn: "initializeV2", args: [] } },
    );
    await serviceNodeRewards.waitForDeployment();
    const serviceUpgradeTx = serviceNodeRewards.deploymentTransaction();
    if (serviceUpgradeTx) await serviceUpgradeTx.wait();

    const checkpointTx = await preflight.rewardPool.connect(signer).checkpoint();
    await checkpointTx.wait();

    const rewardRatePool = await upgrades.upgradeProxy(
        preflight.snapshot.rewardRatePool.proxy,
        preflight.RewardRatePool,
        {
            kind: "transparent",
            call: {
                fn: "initializeV2",
                args: [preflight.snapshot.serviceNodeRewards.proxy],
            },
        },
    );
    await rewardRatePool.waitForDeployment();
    const rewardUpgradeTx = rewardRatePool.deploymentTransaction();
    if (rewardUpgradeTx) await rewardUpgradeTx.wait();

    const postflight = await inspectUpgrade();
    const expectedStake = BigInt(preflight.snapshot.serviceNodeRewards.derivedActiveStake);
    const onchainStake = await postflight.rewards.totalActiveStake();
    if (onchainStake !== expectedStake) throw new Error("totalActiveStake does not match node deposits");
    if ((await postflight.rewards.VERSION()) !== 2n) throw new Error("ServiceNodeRewards VERSION is not 2");
    if ((await postflight.rewardPool.VERSION()) !== 2n) throw new Error("RewardRatePool VERSION is not 2");
    if ((await postflight.rewardPool.ANNUAL_SIMPLE_PAYOUT_RATE()) !== 140n) throw new Error("Pool rate is not 14%");
    if ((await postflight.rewardPool.ACTIVE_STAKE_ANNUAL_PAYOUT_RATE()) !== 300n) throw new Error("Stake rate is not 30%");
    if (ethers.getAddress(await postflight.rewardPool.activeStakeProvider()) !==
        ethers.getAddress(preflight.snapshot.serviceNodeRewards.proxy)) {
        throw new Error("RewardRatePool active-stake provider is incorrect");
    }
    if (postflight.snapshot.serviceNodeRewards.totalNodes !== preflight.snapshot.serviceNodeRewards.totalNodes) {
        throw new Error("Service node count changed during upgrade");
    }
    if (BigInt(postflight.snapshot.rewardRatePool.totalPaidOut) < BigInt(preflight.snapshot.rewardRatePool.totalPaidOut)) {
        throw new Error("Reward pool totalPaidOut decreased during upgrade");
    }

    const report = {
        executedAt: new Date().toISOString(),
        signer: signerAddress,
        transactions: {
            serviceNodeRewardsUpgrade: serviceUpgradeTx?.hash || null,
            legacyRewardCheckpoint: checkpointTx.hash,
            rewardRatePoolUpgrade: rewardUpgradeTx?.hash || null,
        },
        preflight: preflight.snapshot,
        postflight: {
            ...postflight.snapshot,
            totalActiveStake: onchainStake.toString(),
            annualEmission: (await postflight.rewardPool.annualEmission()).toString(),
            rewardRate: (await postflight.rewardPool.rewardRate()).toString(),
        },
    };
    const outDir = path.resolve(__dirname, "..", "deployments");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `uat-reward-emission-v2-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify({ status: "ok", report: outPath, ...report.transactions }, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
