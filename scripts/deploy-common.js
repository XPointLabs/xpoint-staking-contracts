// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// You can also run a script with `npx hardhat run <script>`. If you do that, Hardhat
// will compile your contracts, add the Hardhat Runtime Environment's members to the
// global scope, and execute the script.
const hre = require("hardhat");
const chalk = require('chalk')
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { patchRpcEmptyTo } = require("./normalize-rpc-empty-to.js");

patchRpcEmptyTo(hre);

async function deployTestnetContracts(tokenName, tokenSymbol, args = {}, verify = true, local_devnet = false) {
    args.TOKEN_NAME   = tokenName;
    args.TOKEN_SYMBOL = tokenSymbol;
    args.local_devnet = local_devnet;
    return deployContracts(args, verify);
}

async function deployContracts(args = {}, verify = true) {
    const networkName = hre.network.name;
    console.log("Deploying contracts to:", networkName);

    if (verify) {
        let apiKey;
        if (typeof hre.config.etherscan?.apiKey === 'object') {
            apiKey = hre.config.etherscan.apiKey[networkName];
        } else {
            apiKey = hre.config.etherscan?.apiKey;
        }
        if (!apiKey || apiKey == "") {
            console.error(chalk.red("Error: API key for contract verification is missing."));
            console.error("Please set it in your Hardhat configuration under 'etherscan.apiKey'.");
            process.exit(1); // Exit with an error code
        }
    }
    const TOKEN_NAME     = args.TOKEN_NAME     || "XPoint";
    const TOKEN_SYMBOL   = args.TOKEN_SYMBOL   || "XPNT";
    const TOKEN_UNIT = args.TOKEN_UNIT || args.XPNT_UNIT || 1_000000000n;
    const SUPPLY = args.SUPPLY || 240_000_000n * TOKEN_UNIT;
    const POOL_INITIAL = args.POOL_INITIAL || 40_000_000n * TOKEN_UNIT;
    const STAKING_REQ = args.STAKING_REQ || 20_000n * TOKEN_UNIT;
    const TOKEN_ADDRESS  = args.TOKEN_ADDRESS  || "";
    const TOKEN_CONTRACT = args.TOKEN_CONTRACT || "XPNT";
    const local_devnet = args.local_devnet || false;
    const mainnet = args.mainnet || false;

    // Get signers
    [owner] = await ethers.getSigners();

    tokenContract = null
    if (TOKEN_ADDRESS) {
        tokenContract = await ethers.getContractAt("IERC20", TOKEN_ADDRESS);
    } else {
        try {
            const Token = await ethers.getContractFactory(TOKEN_CONTRACT);
            if (TOKEN_CONTRACT === "XPNT") {
                tokenContract = await Token.deploy(SUPPLY, await owner.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress);
            } else {
                tokenContract = await Token.deploy(TOKEN_NAME, TOKEN_SYMBOL, SUPPLY);
            }
            await tokenContract.waitForDeployment();
        } catch (error) {
            console.error(`Failed to deploy ${TOKEN_CONTRACT} token contract:`, error);
            return;
        }
    }

    const rewardPoolFactoryName = mainnet ? "RewardRatePool" : "TestnetRewardRatePool";
    RewardRatePool = await ethers.getContractFactory(rewardPoolFactoryName);
    rewardRatePool = await upgrades.deployProxy(RewardRatePool, [await owner.getAddress(), await tokenContract.getAddress()]);

    await (await tokenContract.approve(await rewardRatePool.getAddress(), POOL_INITIAL)).wait();
    await (await rewardRatePool.deposit(POOL_INITIAL)).wait();

    // Deploy the ServiceNodeRewards contract
    let serviceNodeRewardsDeployContract;
    if (mainnet) {
        serviceNodeRewardsDeployContract = "ServiceNodeRewards";
    } else {
        serviceNodeRewardsDeployContract = local_devnet ? "LocalDevnetServiceNodeRewards" : "TestnetServiceNodeRewards";
    }
    ServiceNodeRewardsMaster = await ethers.getContractFactory(serviceNodeRewardsDeployContract);

    serviceNodeRewards = await upgrades.deployProxy(ServiceNodeRewardsMaster,[
        await tokenContract.getAddress(),  // token address
        await rewardRatePool.getAddress(), // foundation pool address
        STAKING_REQ,                       // staking requirement
        10,                                // max contributors
        3,                                 // liquidator reward ratio
        17,                                // pool share of liquidation ratio
        9980                               // recipient ratio
    ]);
    await serviceNodeRewards.waitForDeployment();
    await (await serviceNodeRewards.initializeV2()).wait();
    await (await rewardRatePool.initializeV2(await serviceNodeRewards.getAddress())).wait();

    snContributionImplementationFactory = await ethers.getContractFactory("ServiceNodeContribution");
    snContributionImplementation        = await snContributionImplementationFactory.deploy();
    await snContributionImplementation.waitForDeployment();

    snContributionContractFactory = await ethers.getContractFactory("ServiceNodeContributionFactory");
    snContributionFactory         = await upgrades.deployProxy(snContributionContractFactory,
                                                               [
                                                                   await serviceNodeRewards.getAddress(),
                                                                   await snContributionImplementation.getAddress()
                                                               ]);
    await snContributionFactory.waitForDeployment();

    await (await rewardRatePool.setBeneficiary(await serviceNodeRewards.getAddress())).wait();

    console.log(
        '  ',
        chalk.cyan(`${TOKEN_SYMBOL} Token Contract`),
        'deployed to:',
        chalk.greenBright(await tokenContract.getAddress()),
    )
    console.log(
        '  ',
        chalk.cyan(`Service Node Rewards Contract`),
        'deployed to:',
        chalk.greenBright(await serviceNodeRewards.getAddress()),
    )
    console.log(
        '  ',
        chalk.cyan(`Reward Rate Pool Contract`),
        'deployed to:',
        chalk.greenBright(await rewardRatePool.getAddress()),
    )
    console.log(
        '  ',
        chalk.cyan(`Service Node Contribution Implementation`),
        'deployed to:',
        chalk.greenBright(await snContributionImplementation.getAddress()),
    )
    console.log(
        '  ',
        chalk.cyan(`Service Node Contribution Factory Contract`),
        'deployed to:',
        chalk.greenBright(await snContributionFactory.getAddress()),
    )

    if (verify) {
      // Add verify task runners
      console.log("\nVerifying contracts...");

      if (!args.TOKEN_ADDRESS) {
          console.log(chalk.yellow(`\n--- Verifying ${TOKEN_CONTRACT} ---\n`));
          tokenContract.waitForDeployment();
          try {
              const constructorArguments = TOKEN_CONTRACT === "XPNT"
                  ? [SUPPLY, await owner.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress]
                  : [TOKEN_NAME, TOKEN_SYMBOL, SUPPLY];
              await hre.run("verify:verify", {
                  address: await tokenContract.getAddress(),
                  constructorArguments,
                  contract: TOKEN_CONTRACT === "XPNT"
                      ? "contracts/XPNT.sol:XPNT"
                      : `contracts/test/${TOKEN_CONTRACT}.sol:${TOKEN_CONTRACT}`,
                  force: true,
              });
          } catch (error) {}
      }

      console.log(chalk.yellow("\n--- Verifying rewardRatePool ---\n"));
      rewardRatePool.waitForDeployment();
      try {
          await hre.run("verify:verify", {
              address: await rewardRatePool.getAddress(),
              constructorArguments: [],
              force: true,
          });
      } catch (error) {}

      console.log(chalk.yellow("\n--- Verifying serviceNodeRewards ---\n"));
      serviceNodeRewards.waitForDeployment();
      try {
          await hre.run("verify:verify", {
              address: await serviceNodeRewards.getAddress(),
              constructorArguments: [],
              force: true,
          });
      } catch (error) {}

      console.log(chalk.yellow("\n--- Verifying snContributionFactory ---\n"));
      snContributionFactory.waitForDeployment();
      try {
          await hre.run("verify:verify", {
              address: await snContributionFactory.getAddress(),
              constructorArguments: [],
              force: true,
          });
      } catch (error) {}

      console.log(chalk.yellow("\n--- Verifying snContributionImplementation ---\n"));
      snContributionImplementation.waitForDeployment();
      try {
          await hre.run("verify:verify", {
              address: await snContributionImplementation.getAddress(),
              constructorArguments: [],
              force: true,
          });
      } catch (error) {}

      console.log("Contract verification complete.");
    }

    const deploymentTransactions = {
        token: await getDeploymentTransaction(tokenContract),
        rewardRatePool: await getDeploymentTransaction(rewardRatePool),
        serviceNodeRewards: await getDeploymentTransaction(serviceNodeRewards),
        serviceNodeContributionFactory: await getDeploymentTransaction(snContributionFactory),
        serviceNodeContributionImplementation: await getDeploymentTransaction(snContributionImplementation),
    };
    const deploymentBlocks = Object.values(deploymentTransactions)
        .map((tx) => tx?.blockNumber)
        .filter((blockNumber) => Number.isInteger(blockNumber));

    const chainId = Number((await hre.ethers.provider.getNetwork()).chainId);
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
        throw new Error(`Unsupported deployment chain id: ${chainId}`);
    }
    const contracts = {
        token: await tokenContract.getAddress(),
        serviceNodeRewards: await serviceNodeRewards.getAddress(),
        rewardRatePool: await rewardRatePool.getAddress(),
        serviceNodeContributionFactory: await snContributionFactory.getAddress(),
        serviceNodeContributionImplementation: await snContributionImplementation.getAddress(),
    };
    const lifecycleId = crypto
        .createHash("sha256")
        .update(JSON.stringify({
            chainId,
            network: networkName,
            contracts,
            deploymentTransactions,
        }))
        .digest("hex");

    const deployment = {
        schemaVersion: 1,
        network: networkName,
        chainId,
        lifecycleId,
        token: {
            name: TOKEN_NAME,
            symbol: TOKEN_SYMBOL,
            decimals: 9,
            address: contracts.token,
        },
        startBlock: deploymentBlocks.length > 0 ? Math.min(...deploymentBlocks) : null,
        deploymentTransactions,
        contracts,
        parameters: {
            supply: SUPPLY.toString(),
            poolInitial: POOL_INITIAL.toString(),
            stakingRequirement: STAKING_REQ.toString(),
            maxContributors: 10,
            liquidatorRewardRatio: 3,
            poolShareOfLiquidationRatio: 17,
            recipientRatio: 9980,
            poolAnnualEmissionRateTenthsPercent: 140,
            activeStakeAnnualEmissionRateTenthsPercent: 300,
            localDevnet: local_devnet,
            mainnet,
        },
    };

    writeDeployment(networkName, deployment);
    return deployment;
}

async function getDeploymentTransaction(contract) {
    const tx = contract.deploymentTransaction?.();
    if (!tx) {
        return null;
    }

    const receipt = await tx.wait();
    if (!receipt) {
        return null;
    }

    return {
        hash: receipt.hash,
        blockHash: receipt.blockHash,
        blockNumber: receipt.blockNumber,
        contractAddress: receipt.contractAddress,
    };
}

function writeDeployment(networkName, deployment) {
    const dir = path.join(__dirname, "..", "deployments");
    fs.mkdirSync(dir, { recursive: true });

    const latestPath = path.join(dir, `${networkName}.latest.json`);
    const temporaryPath = `${latestPath}.tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
    let temporaryFile;
    try {
        // Deployment manifests contain public addresses and transaction
        // identities, never signer material. Keep them readable by the
        // unprivileged staking runtime that mounts this volume read-only.
        temporaryFile = fs.openSync(temporaryPath, "wx", 0o644);
        fs.writeFileSync(temporaryFile, JSON.stringify(deployment, null, 2) + "\n", "utf8");
        fs.fsyncSync(temporaryFile);
        fs.closeSync(temporaryFile);
        temporaryFile = undefined;
        fs.renameSync(temporaryPath, latestPath);
    } finally {
        if (temporaryFile !== undefined) {
            fs.closeSync(temporaryFile);
        }
        if (fs.existsSync(temporaryPath)) {
            fs.unlinkSync(temporaryPath);
        }
    }
    console.log("  ", chalk.cyan("Deployment manifest"), "written to:", chalk.greenBright(latestPath));
}

module.exports = function() {
    this.deployTestnetContracts = deployTestnetContracts;
    this.deployContracts = deployContracts;
    this.writeDeployment = writeDeployment;
};
