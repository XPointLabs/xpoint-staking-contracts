// This script deploys the L2 version of the XPNT token, it sets up the Addresses
// of the Arbitrum Custom Gateway which are specified on deployment.
//
// This script is the second to be run, but it needs the L1 Token Address from the
// token deployed in deploy-l1-xpnt script
const hre = require("hardhat");
const chalk = require("chalk");
const { patchRpcEmptyTo } = require("./normalize-rpc-empty-to.js");

patchRpcEmptyTo(hre);

async function main() {
  const L1_TOKEN_ADDRESS = process.env.L1_XPNT_TOKEN_ADDRESS;
  const L2_GATEWAY_ADDRESS = process.env.L2_GATEWAY_ADDRESS || "0x096760F208390250649E3e8763348E783AEF5562"; // Arbitrum One custom gateway

  if (!hre.ethers.isAddress(L1_TOKEN_ADDRESS)) {
    console.error("Error: L1_XPNT_TOKEN_ADDRESS must be set to the deployed L1 XPNT address.");
    process.exitCode = 1;
    return;
  }

  if (!hre.ethers.isAddress(L2_GATEWAY_ADDRESS)) {
    console.error("Error: L2_GATEWAY_ADDRESS is not a valid address.");
    process.exitCode = 1;
    return;
  }

  const args = {
    L2_GATEWAY_ADDRESS,
    L1_TOKEN_ADDRESS,
  };

  await deployXPNTL2(args);
}

async function deployXPNTL2(args = {}, verify = true) {
  const [owner] = await hre.ethers.getSigners();
  const ownerAddress = await owner.getAddress();
  const networkName = hre.network.name;

  console.log("Deploying XPNTL2 proxy contract to:", chalk.yellow(networkName));

  // Check for a valid API key in the Hardhat config (for verification)
  if (verify) {
    let apiKey;
    if (typeof hre.config.etherscan?.apiKey === "object") {
      apiKey = hre.config.etherscan.apiKey[networkName];
    } else {
      apiKey = hre.config.etherscan?.apiKey;
    }
    if (!apiKey || apiKey === "") {
      console.error(
        chalk.red("Error: API key for contract verification is missing.")
      );
      console.error(
        "Please set it in your Hardhat configuration under 'etherscan.apiKey'."
      );
      process.exit(1);
    }
  }

  const L2_GATEWAY_ADDRESS = args.L2_GATEWAY_ADDRESS;
  const L1_TOKEN_ADDRESS = args.L1_TOKEN_ADDRESS;

  const XPNTL2 = await hre.ethers.getContractFactory("XPNTL2", owner);

  let xpntl2Proxy;
  try {
    xpntl2Proxy = await hre.upgrades.deployProxy(
      XPNTL2,
      [L2_GATEWAY_ADDRESS, L1_TOKEN_ADDRESS]
    );
  } catch (error) {
    console.error("Failed to deploy XPNTL2 proxy contract:", error);
    process.exit(1);
  }

  console.log(
    "  ",
    chalk.cyan("XPNTL2 Proxy Contract"),
    "deployed to:",
    chalk.greenBright(await xpntl2Proxy.getAddress()),
    "on network:",
    chalk.yellow(networkName)
  );
  console.log("  ", "Deployment transaction sender:", chalk.green(ownerAddress));
  await xpntl2Proxy.waitForDeployment();

  if (verify) {
    console.log(chalk.yellow("\n--- Verifying XPNTL2 Implementation ---\n"));
    console.log("Waiting 60 confirmations to ensure etherscan has processed tx");
    await xpntl2Proxy.deploymentTransaction().wait(60);
    console.log("Finished Waiting");
    try {
      await hre.run("verify:verify", {
        address: await xpntl2Proxy.getAddress(),
        constructorArguments: [],
        contract: "contracts/XPNTL2.sol:XPNTL2",
        force: true,
      });
    } catch (error) {
      console.error(chalk.red("Verification failed:"), error);
    }
    console.log(chalk.green("Contract verification complete."));
  }
  return { xpntl2Proxy };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

