require("./deploy-common.js")();

async function main() {
    const TOKEN_ADDRESS = process.env.XPNT_TOKEN_ADDRESS || "";
    const rawStakingRequirement = process.env.XPNT_STAKING_REQUIREMENT || "";

    if (!TOKEN_ADDRESS) {
        console.error("Error: XPNT_TOKEN_ADDRESS cannot be empty. Deploy XPNT first or set the deployed token address.");
        process.exitCode = 1;
        return;
    }

    if (!rawStakingRequirement) {
        console.error("Error: XPNT_STAKING_REQUIREMENT cannot be empty. Example: XPNT_STAKING_REQUIREMENT=25000");
        process.exitCode = 1;
        return;
    }

    const XPNT_UNIT = 1_000_000_000n;
    const SUPPLY = 240_000_000n * XPNT_UNIT;
    const POOL_INITIAL = 40_000_000n * XPNT_UNIT;
    const mainnet = true;
    const STAKING_REQ = BigInt(rawStakingRequirement) * XPNT_UNIT;

    const args = {
        XPNT_UNIT,
        SUPPLY,
        POOL_INITIAL,
        STAKING_REQ,
        TOKEN_ADDRESS,
        mainnet
    };

    await deployContracts(args);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

