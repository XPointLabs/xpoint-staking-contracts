const hre = require("hardhat");

function requiredEnv(name) {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`Set required environment variable ${name}.`);
    }

    return value.trim();
}

function requiredAddress(name) {
    const value = requiredEnv(name);
    if (!hre.ethers.isAddress(value)) {
        throw new Error(`${name} must be a valid EVM address.`);
    }

    return value;
}

function requiredPositiveInteger(name) {
    const value = requiredEnv(name);
    if (!/^[1-9][0-9]*$/.test(value)) {
        throw new Error(`${name} must be a positive integer.`);
    }

    return BigInt(value);
}

const TOKEN_A_ADDRESS = requiredAddress("TOKEN_A_ADDRESS");
const TOKEN_B_ADDRESS = requiredAddress("TOKEN_B_ADDRESS");
const INITIAL_NUMERATOR = requiredPositiveInteger("INITIAL_NUMERATOR");
const INITIAL_DENOMINATOR = requiredPositiveInteger("INITIAL_DENOMINATOR");

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
    const TokenConverter = await hre.ethers.getContractFactory("TokenConverter");

    console.log("Deploying TokenConverter...");
    const tokenConverter = await TokenConverter.deploy(
        TOKEN_A_ADDRESS,
        TOKEN_B_ADDRESS,
        INITIAL_NUMERATOR,
        INITIAL_DENOMINATOR
    );

    console.log("TokenConverter deployed to:", await tokenConverter.getAddress());

    console.log("Waiting for Etherscan to index the contract...");
    await sleep(30_000);

    console.log("Verifying contract on Etherscan...");
    try {
        await hre.run("verify:verify", {
            address: await tokenConverter.getAddress(),
            constructorArguments: [
                TOKEN_A_ADDRESS,
                TOKEN_B_ADDRESS,
                INITIAL_NUMERATOR,
                INITIAL_DENOMINATOR,
            ],
    });
    console.log("Contract verified successfully.");
    } catch (error) {
        console.error("Failed to verify contract on Etherscan:", error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Error deploying TokenConverter:", error);
        process.exit(1);
    });

