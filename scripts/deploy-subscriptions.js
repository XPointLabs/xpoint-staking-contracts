const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { patchRpcEmptyTo } = require("./normalize-rpc-empty-to.js");

patchRpcEmptyTo(hre);

async function main() {
    const networkName = hre.network.name;
    const XPNT_UNIT = 1_000_000_000n;

    const XPNT_TOKEN_ADDRESS = process.env.XPNT_TOKEN_ADDRESS || "";
    const REWARD_RATE_POOL_ADDRESS = process.env.REWARD_RATE_POOL_ADDRESS || "";
    const PERMANENT_TREASURY_SAFE_ADDRESS = process.env.PERMANENT_TREASURY_SAFE_ADDRESS || "";
    const ALIAS_SIGNER_ADDRESS = process.env.ALIAS_SIGNER_ADDRESS || "";
    const OPS_CLAIMER_ADDRESS = process.env.OPS_CLAIMER_ADDRESS || "";
    const rawEpochDurationDays = process.env.SUBSCRIPTION_EPOCH_DURATION_DAYS || "30";
    const rawClaimWindowDays = process.env.SUBSCRIPTION_CLAIM_WINDOW_DAYS || "14";
    const rawEpochZero = process.env.SUBSCRIPTION_EPOCH_ZERO_TIMESTAMP || `${Math.floor(Date.now() / 1000)}`;
    const rawMonthlyPrice = process.env.SUBSCRIPTION_MONTHLY_PRICE_XPNT || "";
    const rawMonthlyDurationDays = process.env.SUBSCRIPTION_MONTHLY_DURATION_DAYS || "30";

    if (!XPNT_TOKEN_ADDRESS || !REWARD_RATE_POOL_ADDRESS || !PERMANENT_TREASURY_SAFE_ADDRESS || !ALIAS_SIGNER_ADDRESS || !OPS_CLAIMER_ADDRESS) {
        console.error("Error: XPNT_TOKEN_ADDRESS, REWARD_RATE_POOL_ADDRESS, PERMANENT_TREASURY_SAFE_ADDRESS, ALIAS_SIGNER_ADDRESS, and OPS_CLAIMER_ADDRESS must all be set.");
        process.exitCode = 1;
        return;
    }

    const epochDurationSeconds = Number(rawEpochDurationDays) * 24 * 60 * 60;
    const claimWindowSeconds = Number(rawClaimWindowDays) * 24 * 60 * 60;
    const epochZeroTimestamp = Number(rawEpochZero);

    const OpsBudgetEscrow = await ethers.getContractFactory("OpsBudgetEscrow");
    const opsBudgetEscrow = await upgrades.deployProxy(OpsBudgetEscrow, [
        XPNT_TOKEN_ADDRESS,
        REWARD_RATE_POOL_ADDRESS,
        OPS_CLAIMER_ADDRESS,
        epochZeroTimestamp,
        epochDurationSeconds,
        claimWindowSeconds,
    ]);
    await opsBudgetEscrow.waitForDeployment();

    const SubscriptionManager = await ethers.getContractFactory("SubscriptionManager");
    const subscriptionManager = await upgrades.deployProxy(SubscriptionManager, [
        XPNT_TOKEN_ADDRESS,
        REWARD_RATE_POOL_ADDRESS,
        await opsBudgetEscrow.getAddress(),
        PERMANENT_TREASURY_SAFE_ADDRESS,
        ALIAS_SIGNER_ADDRESS,
    ]);
    await subscriptionManager.waitForDeployment();

    await (await opsBudgetEscrow.setSubscriptionManager(await subscriptionManager.getAddress())).wait();

    if (rawMonthlyPrice) {
        const monthlyPrice = BigInt(rawMonthlyPrice) * XPNT_UNIT;
        const monthlyDurationSeconds = Number(rawMonthlyDurationDays) * 24 * 60 * 60;
        await (await subscriptionManager.setPlan(1, monthlyPrice, monthlyDurationSeconds, true)).wait();
    }

    const deployment = {
        network: networkName,
        contracts: {
            subscriptionManager: await subscriptionManager.getAddress(),
            opsBudgetEscrow: await opsBudgetEscrow.getAddress(),
            rewardRatePool: REWARD_RATE_POOL_ADDRESS,
            xpntToken: XPNT_TOKEN_ADDRESS,
        },
        parameters: {
            rewardsBps: 4000,
            permanentReserveBps: 2000,
            opsBudgetBps: 4000,
            epochDurationSeconds,
            claimWindowSeconds,
            epochZeroTimestamp,
            permanentTreasurySafe: PERMANENT_TREASURY_SAFE_ADDRESS,
            aliasSigner: ALIAS_SIGNER_ADDRESS,
            opsClaimer: OPS_CLAIMER_ADDRESS,
            monthlyPlanConfigured: Boolean(rawMonthlyPrice),
            monthlyPriceXpnt: rawMonthlyPrice || null,
            monthlyDurationDays: Number(rawMonthlyDurationDays),
        },
    };

    const dir = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, `${networkName}.subscriptions.latest.json`);
    fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2) + "\n");
    console.log(`Subscription deployment manifest written to: ${outPath}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});