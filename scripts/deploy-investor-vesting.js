const hre = require("hardhat");
const fs = require('fs');
const csv = require('csv-parse/sync');
const chalk = require('chalk');


// This script will deploy many investor contract, it takes as input a CSV "investors.csv" which is required to have 
// these headers: beneficiary,revoker,start,end,transferableBeneficiary,amount
//
// After deploying the investor contracts it can fund them with XPNT from the deployer's address, so this requires
// the deployer having enough tokens in their account.
//
// Finally the script will finish by producing both a json and a CSV with the deployed contracts in a newly created "deployments" folder

const xpntAddress = process.env.XPNT_TOKEN_ADDRESS || "0x63B2cdb8B0d8774F1Fdca91D24803698582a079F";
const rewardsAddress = process.env.REWARDS_CONTRACT_ADDRESS || "";
const multiContributorAddress = process.env.MULTICONTRIBUTOR_CONTRACT_ADDRESS || "";
const csvFilePath = process.env.INVESTORS_CSV_PATH || "investors.csv";

// Configuration constants
const SHOULD_VERIFY_CONTRACTS = true;
const SHOULD_TRANSFER_FUNDS = false;

async function verifyContract(address, constructorArgs) {
  console.log(chalk.yellow("\nVerifying contract on Etherscan..."));
  try {
    await hre.run("verify:verify", {
      address: address,
      constructorArguments: constructorArgs,
      contract: "contracts/utils/TokenVestingStaking.sol:TokenVestingStaking"
    });
    console.log(chalk.green("Contract verified successfully"));
  } catch (error) {
    if (error.message.includes("already been verified")) {
      console.log(chalk.yellow("Contract already verified"));
    } else {
      console.error(chalk.red("Error verifying contract:"), error);
    }
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", chalk.yellow(deployer.address));

  const networkName = hre.network.name;
  console.log("Network:", chalk.cyan(networkName));

  let apiKey;
  if (typeof hre.config.etherscan?.apiKey === "object") {
    apiKey = hre.config.etherscan.apiKey[networkName];
  } else {
    apiKey = hre.config.etherscan?.apiKey;
  }
  if (!apiKey || apiKey == "") {
    console.error(chalk.red("Error: API key for contract verification is missing."));
    console.error("Please set it in your Hardhat configuration under 'etherscan.apiKey'.");
    process.exit(1);
  }

  // Load CSV of the investors
  console.log(`CSV file: ${csvFilePath}`);
  if (!fs.existsSync(csvFilePath)) {
    console.error(chalk.red(`Error: CSV file not found at ${csvFilePath}`));
    console.error("Please create a CSV file with the following headers:");
    console.error("beneficiary,revoker,start,end,transferableBeneficiary,amount");
    process.exit(1);
  }

  const fileContent = fs.readFileSync(csvFilePath);
  const records = csv.parse(fileContent, {
    columns: true,
    skip_empty_lines: true
  });

  const TokenVestingStaking = await hre.ethers.getContractFactory("TokenVestingStaking");
  
  const requiredAddresses = {
    'XPNT_TOKEN_ADDRESS': xpntAddress,
    'REWARDS_CONTRACT_ADDRESS': rewardsAddress,
    'MULTICONTRIBUTOR_CONTRACT_ADDRESS': multiContributorAddress
  };
  for (const [name, address] of Object.entries(requiredAddresses)) {
    if (!address) {
      console.error(chalk.red(`Error: ${name} variable not set`));
      process.exit(1);
    }
    if (!hre.ethers.isAddress(address)) {
      console.error(chalk.red(`Error: ${name} is not a valid address: ${address}`));
      process.exit(1);
    }
  }

  const deployedContracts = [];
  
  const xpntContract = await hre.ethers.getContractAt("XPNT", xpntAddress);

  // Deploy contracts for each investor
  for (const record of records) {
    try {
      console.log(chalk.cyan("\nDeploying vesting contract for:"), chalk.yellow(record.beneficiary));
      
      if (!hre.ethers.isAddress(record.beneficiary)) {
        throw new Error(`Invalid beneficiary address: ${record.beneficiary}`);
      }
      if (!hre.ethers.isAddress(record.revoker)) {
        throw new Error(`Invalid revoker address: ${record.revoker}`);
      }

      const start = Math.floor(new Date(record.start).getTime() / 1000);
      const end = Math.floor(new Date(record.end).getTime() / 1000);
      const transferableBeneficiary = record.transferableBeneficiary.toLowerCase() === 'true';
      
      const currentTime = Math.floor(Date.now() / 1000);
      if (start <= currentTime) {
        throw new Error(`Start time must be in the future. Current: ${currentTime}, Start: ${start}`);
      }
      if (end <= start) {
        throw new Error(`End time must be after start time. Start: ${start}, End: ${end}`);
      }

      const constructorArgs = [
        record.beneficiary,
        record.revoker,
        start,
        end,
        transferableBeneficiary,
        rewardsAddress,
        multiContributorAddress,
        xpntAddress
      ];

      const vestingContract = await TokenVestingStaking.deploy(...constructorArgs);
      await vestingContract.waitForDeployment();
      const vestingAddress = await vestingContract.getAddress();
      
      console.log(chalk.green("Vesting contract deployed to:"), chalk.yellow(vestingAddress));

      if (SHOULD_VERIFY_CONTRACTS) {
        console.log("Waiting for deployment to be confirmed...");
        await vestingContract.deploymentTransaction().wait(5);
        await verifyContract(vestingAddress, constructorArgs);
      }

      if (SHOULD_TRANSFER_FUNDS) {
        const amount = hre.ethers.parseUnits(record.amount, 9); // XPNT has 9 decimals
        const transferTx = await xpntContract.transfer(vestingAddress, amount);
        await transferTx.wait();
        
        console.log(chalk.green("Tokens transferred:"), chalk.yellow(record.amount), "XPNT");
      }

      deployedContracts.push({
        beneficiary: record.beneficiary,
        vestingAddress: vestingAddress,
        amount: record.amount,
        start: new Date(start * 1000).toISOString(),
        end: new Date(end * 1000).toISOString(),
        transferableBeneficiary: transferableBeneficiary,
        revoker: record.revoker
      });

    } catch (error) {
      console.error(chalk.red(`Error deploying contract for ${record.beneficiary}:`), error);
    }
  }

  // Save deployment results as JSON
  const deploymentResults = {
    timestamp: new Date().toISOString(),
    network: networkName,
    xpntAddress,
    rewardsAddress,
    multiContributorAddress,
    contracts: deployedContracts
  };

  const outputDir = './deployments';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
  }
  
  const jsonOutputPath = `${outputDir}/vesting-${networkName}-${Date.now()}.json`;
  fs.writeFileSync(jsonOutputPath, JSON.stringify(deploymentResults, null, 2));
  console.log(chalk.green("\nDeployment results saved to:"), jsonOutputPath);

  // Generate and save CSV of the deployed contracts
  const csvOutputPath = `${outputDir}/vesting-${networkName}-${Date.now()}.csv`;
  const csvHeaders = [
    'beneficiary',
    'vestingAddress',
    'amount',
    'start',
    'end',
    'transferableBeneficiary',
    'revoker'
  ];
  
  const csvRows = [
    csvHeaders.join(','),
    ...deployedContracts.map(contract => {
      return [
        contract.beneficiary,
        contract.vestingAddress,
        contract.amount,
        contract.start,
        contract.end,
        contract.transferableBeneficiary,
        contract.revoker
      ].join(',');
    })
  ];

  fs.writeFileSync(csvOutputPath, csvRows.join('\n'));
  console.log(chalk.green("Deployment CSV summary saved to:"), csvOutputPath);

  // Print summary to console
  console.log(chalk.cyan("\nDeployment Summary:"));
  console.log("Network:", chalk.yellow(networkName));
  console.log("Total contracts deployed:", chalk.yellow(deployedContracts.length));
  console.table(
    deployedContracts.map(c => ({
      Beneficiary: c.beneficiary,
      'Vesting Contract': c.vestingAddress,
      Amount: c.amount
    }))
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 
