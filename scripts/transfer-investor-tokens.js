const hre = require("hardhat");
const fs = require('fs');
const chalk = require('chalk');

// Constants
const xpntAddress = process.env.XPNT_TOKEN_ADDRESS || "0x63B2cdb8B0d8774F1Fdca91D24803698582a079F";
const jsonFilePath = process.env.VESTING_DEPLOYMENTS_JSON || "";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Transferring tokens with account:", chalk.yellow(deployer.address));

  const networkName = hre.network.name;
  console.log("Network:", chalk.cyan(networkName));
  console.log("XPNT token address:", chalk.yellow(xpntAddress));
  console.log("JSON file:", chalk.yellow(jsonFilePath));

  if (!jsonFilePath) {
    console.error(chalk.red("Error: VESTING_DEPLOYMENTS_JSON is not set"));
    process.exit(1);
  }

  if (!fs.existsSync(jsonFilePath)) {
    console.error(chalk.red(`Error: JSON file not found at ${jsonFilePath}`));
    process.exit(1);
  }

  if (!hre.ethers.isAddress(xpntAddress)) {
    console.error(chalk.red(`Error: Invalid XPNT token address: ${xpntAddress}`));
    process.exit(1);
  }

  const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
  let deployments;
  
  try {
    deployments = JSON.parse(fileContent);
  } catch (error) {
    console.error(chalk.red(`Error parsing JSON file: ${error.message}`));
    process.exit(1);
  }

  if (!deployments || !Array.isArray(deployments['contracts']) || deployments['contracts'].length === 0) {
    console.error(chalk.red("Error: JSON file is empty or invalid"));
    process.exit(1);
  }

  const xpntContract = await hre.ethers.getContractAt("XPNT", xpntAddress);
  
  const deployerBalance = await xpntContract.balanceOf(deployer.address);
  const totalRequired = deployments['contracts'].reduce((sum, deployment) => {
    return sum + hre.ethers.parseUnits(deployment.amount, 9); // XPNT has 9 decimals
  }, 0n);

  console.log("Your balance:", chalk.yellow(hre.ethers.formatUnits(deployerBalance, 9)), "XPNT");
  console.log("Total required:", chalk.yellow(hre.ethers.formatUnits(totalRequired, 9)), "XPNT");

  if (deployerBalance < totalRequired) {
    console.error(chalk.red("Error: Insufficient XPNT balance for transfers"));
    console.error(`You have ${hre.ethers.formatUnits(deployerBalance, 9)} XPNT, but need ${hre.ethers.formatUnits(totalRequired, 9)} XPNT`);
    process.exit(1);
  }

  console.log(chalk.yellow("Starting transfers...\n"));

  let successful = 0;
  let failed = 0;
  
  for (const deployment of deployments['contracts']) {
    try {
      if (!hre.ethers.isAddress(deployment['vestingAddress'])) {
        throw new Error(`Invalid vesting contract address: ${deployment['vestingAddress']}`);
      }

      const amount = hre.ethers.parseUnits(deployment['amount'], 9); // XPNT has 9 decimals
      console.log(chalk.cyan(`Transferring ${deployment['amount']} XPNT to ${deployment['vestingAddress']}...`));
      
      const transferTx = await xpntContract.transfer(deployment['vestingAddress'], amount);
      await transferTx.wait();
      
      console.log(chalk.green("✓ Transfer successful! Tx hash:"), transferTx.hash);
      successful++;
    } catch (error) {
      console.error(chalk.red(`Error transferring to ${deployment['vestingAddress']}:`), error.message);
      failed++;
    }
  }

  console.log(chalk.cyan("\nTransfer Summary:"));
  console.log("Total contracts:", chalk.yellow(deployments['contracts'].length));
  console.log("Successful:", chalk.green(successful));
  console.log("Failed:", failed > 0 ? chalk.red(failed) : chalk.green(failed));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(chalk.red("Unhandled error:"));
    console.error(error);
    process.exit(1);
  }); 
