// This script deploys the L1 version of the XPNT token, it sets up the Addresses
// of the Arbitrum Router and Custom Gateway which are specified on deployment.
//
// This script is the first to be run
const hre = require("hardhat");
const chalk = require("chalk");
const { patchRpcEmptyTo } = require("./normalize-rpc-empty-to.js");

patchRpcEmptyTo(hre);

const ethers = hre.ethers;

async function main() {
  const XPNT_UNIT = 1_000_000_000n;
  const SUPPLY = 240_000_000n * XPNT_UNIT;

  // Defaults are Arbitrum One values.
  // See https://docs.arbitrum.io/build-decentralized-apps/reference/contract-addresses
  const L1_ROUTER_ADDRESS = process.env.L1_ROUTER_ADDRESS || "0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef";
  const L1_GATEWAY_ADDRESS = process.env.L1_GATEWAY_ADDRESS || "0xcEe284F754E854890e311e3280b767F80797180d";

  if (!ethers.isAddress(L1_ROUTER_ADDRESS) || !ethers.isAddress(L1_GATEWAY_ADDRESS)) {
    console.error("Error: L1_ROUTER_ADDRESS and L1_GATEWAY_ADDRESS must be valid addresses.");
    process.exitCode = 1;
    return;
  }

  const args = {
    XPNT_UNIT,
    SUPPLY,
    L1_GATEWAY_ADDRESS,
    L1_ROUTER_ADDRESS,
  };

  await deployXPNT(args);
}

async function deployXPNT(args = {}, verify = true) {
  [owner] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();

  const networkName = hre.network.name;
  console.log("Deploying XPNT contract to:", chalk.yellow(networkName));

  if (verify) {
    let apiKey;
    if (typeof hre.config.etherscan?.apiKey === "object") {
      apiKey = hre.config.etherscan.apiKey[networkName];
    } else {
      apiKey = hre.config.etherscan?.apiKey;
    }
    if (!apiKey || apiKey == "") {
      console.error(
        chalk.red("Error: API key for contract verification is missing."),
      );
      console.error(
        "Please set it in your Hardhat configuration under 'etherscan.apiKey'.",
      );
      process.exit(1);
    }
  }

  const XPNT_UNIT = args.XPNT_UNIT || 1_000_000_000n;
  const SUPPLY = args.SUPPLY || 240_000_000n * XPNT_UNIT;
  const RECEIVER_GENESIS_ADDRESS = args.RECEIVER_GENESIS_ADDRESS || process.env.XPNT_GENESIS_RECEIVER_ADDRESS || ownerAddress;
  const L1_GATEWAY_ADDRESS = args.L1_GATEWAY_ADDRESS;
  const L1_ROUTER_ADDRESS = args.L1_ROUTER_ADDRESS;

  if (!ethers.isAddress(RECEIVER_GENESIS_ADDRESS)) {
    console.error("Error: XPNT_GENESIS_RECEIVER_ADDRESS must be a valid address.");
    process.exit(1);
  }

  const XPointERC20 = await ethers.getContractFactory("XPNT", owner);
  let xpntERC20;

  try {
    xpntERC20 = await XPointERC20.deploy(SUPPLY, RECEIVER_GENESIS_ADDRESS, L1_GATEWAY_ADDRESS, L1_ROUTER_ADDRESS);
  } catch (error) {
    console.error("Failed to deploy XPNT contract:", error);
    process.exit(1);
  }

  console.log(
    "  ",
    chalk.cyan(`XPNT Contract`),
    "deployed to:",
    chalk.greenBright(await xpntERC20.getAddress()),
    "on network:",
    chalk.yellow(networkName),
  );
  console.log(
    "  ",
    "Initial Supply will be received by:",
    chalk.green(RECEIVER_GENESIS_ADDRESS),
  );
  await xpntERC20.waitForDeployment();

  if (verify) {
    console.log(chalk.yellow("\n--- Verifying XPNT ---\n"));
    console.log("Waiting 6 confirmations to ensure etherscan has processed tx");
    await xpntERC20.deploymentTransaction().wait(6);
    console.log("Finished Waiting");
    try {
      await hre.run("verify:verify", {
        address: await xpntERC20.getAddress(),
        constructorArguments: [SUPPLY, RECEIVER_GENESIS_ADDRESS, L1_GATEWAY_ADDRESS, L1_ROUTER_ADDRESS],
        contract: "contracts/XPNT.sol:XPNT",
        force: true,
      });
    } catch (error) {
      console.error(chalk.red("Verification failed:"), error);
    }
    console.log(chalk.green("Contract verification complete."));
  }

  return { xpntERC20 };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

