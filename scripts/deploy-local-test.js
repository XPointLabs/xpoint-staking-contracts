const hre = require("hardhat");
const chalk = require('chalk');
require("./deploy-common.js")();

async function main() {
    const tokenName = "XPoint";
    const tokenSymbol = "XPNT";
    const XPNT_UNIT = 1_000_000_000n;
    const SUPPLY = 240_000_000n * XPNT_UNIT;
    const POOL_INITIAL = 40_000_000n * XPNT_UNIT;
    const STAKING_REQ = 120n * XPNT_UNIT;

    const args = {
        XPNT_UNIT,
        SUPPLY,
        POOL_INITIAL,
        STAKING_REQ,
    };

    await deployTestnetContracts(tokenName, tokenSymbol, args, false);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

