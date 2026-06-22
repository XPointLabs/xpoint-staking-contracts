// This script registers the L1 token with its L2 counterpart using the Arbitrum custom gateway
// and then bridges over some tokens via the custom bridge.
// It assumes that the tokens are already deployed and that the necessary gateway addresses are hardcoded.
const hre = require("hardhat");
const chalk = require("chalk");
const { patchRpcEmptyTo } = require("./normalize-rpc-empty-to.js");

patchRpcEmptyTo(hre);

const ethers = hre.ethers;


async function main() {
  const XPNT_DECIMALS = 9;
  const XPNT_TO_TRANSFER = process.env.XPNT_BRIDGE_TEST_AMOUNT || "1";

  const L1_TOKEN_ADDRESS = process.env.L1_XPNT_TOKEN_ADDRESS;
  const L2_TOKEN_ADDRESS = process.env.L2_XPNT_TOKEN_ADDRESS || process.env.L2_XPNTL2_TOKEN_ADDRESS;

  // Defaults are Ethereum mainnet -> Arbitrum One bridge contracts.
  const L1_GATEWAY_ROUTER_ADDRESS = process.env.L1_ROUTER_ADDRESS || "0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef";
  const L1_CUSTOM_GATEWAY_ADDRESS = process.env.L1_GATEWAY_ADDRESS || "0xcEe284F754E854890e311e3280b767F80797180d";

  const [owner] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();
  const destinationAddress = process.env.BRIDGE_DESTINATION_ADDRESS || ownerAddress;

  for (const [name, address] of Object.entries({
    L1_XPNT_TOKEN_ADDRESS: L1_TOKEN_ADDRESS,
    L2_XPNT_TOKEN_ADDRESS: L2_TOKEN_ADDRESS,
    L1_ROUTER_ADDRESS: L1_GATEWAY_ROUTER_ADDRESS,
    L1_GATEWAY_ADDRESS: L1_CUSTOM_GATEWAY_ADDRESS,
    BRIDGE_DESTINATION_ADDRESS: destinationAddress,
  })) {
    if (!ethers.isAddress(address)) {
      console.error(chalk.red(`Error: ${name} must be set to a valid address.`));
      process.exit(1);
    }
  }

  console.log(chalk.green(`Using deployer: ${ownerAddress}`));

  // Constants
  const feeData = await owner.provider.getFeeData();
  const l1GasPriceBid = feeData.gasPrice ? feeData.gasPrice * BigInt(2) : ethers.parseUnits('10', 'gwei');
  const l2GasPriceBid = process.env.L2_GAS_PRICE_BID ? BigInt(process.env.L2_GAS_PRICE_BID) : BigInt("1000000000");
  const maxGasForCustomGateway = process.env.REGISTER_MAX_GAS_CUSTOM_GATEWAY ? BigInt(process.env.REGISTER_MAX_GAS_CUSTOM_GATEWAY) : BigInt(1000000);
  const maxGasForRouter = process.env.REGISTER_MAX_GAS_ROUTER ? BigInt(process.env.REGISTER_MAX_GAS_ROUTER) : BigInt(500000);
  const maxSubmissionCostForCustomGateway = process.env.REGISTER_MAX_SUBMISSION_COST_CUSTOM_GATEWAY ? BigInt(process.env.REGISTER_MAX_SUBMISSION_COST_CUSTOM_GATEWAY) : BigInt("500000000000000");
  const maxSubmissionCostForRouter = process.env.REGISTER_MAX_SUBMISSION_COST_ROUTER ? BigInt(process.env.REGISTER_MAX_SUBMISSION_COST_ROUTER) : BigInt("300000000000000");
  const gatewayGasCost = maxGasForCustomGateway * l2GasPriceBid;
  const routerGasCost = maxGasForRouter * l2GasPriceBid;
  const valueForGateway = maxSubmissionCostForCustomGateway + gatewayGasCost;
  const valueForRouter = maxSubmissionCostForRouter + routerGasCost;
  const totalValue = valueForGateway + valueForRouter;
  
  console.log(chalk.blue("\nRegistering L1 token to L2 token..."));
  
  const registerTokenABI = [
    "function registerTokenOnL2(address l2CustomTokenAddress, uint256 maxSubmissionCostForCustomGateway, uint256 maxSubmissionCostForRouter, uint256 maxGasForCustomGateway, uint256 maxGasForRouter, uint256 gasPriceBid, uint256 valueForGateway, uint256 valueForRouter, address creditBackAddress) payable"
  ];
  
  const l1Token = new ethers.Contract(
    L1_TOKEN_ADDRESS,
    registerTokenABI,
    owner
  );
  
  try {
    console.log("Transaction parameters:");
    console.log(`L2 Token Address: ${L2_TOKEN_ADDRESS}`);
    console.log(`Max Submission Cost (Gateway): ${maxSubmissionCostForCustomGateway}`);
    console.log(`Max Submission Cost (Router): ${maxSubmissionCostForRouter}`);
    console.log(`Max Gas (Gateway): ${maxGasForCustomGateway}`);
    console.log(`Max Gas (Router): ${maxGasForRouter}`);
    console.log(`Gas Price Bid: ${l2GasPriceBid}`);
    console.log(`Value For Gateway: ${valueForGateway}`);
    console.log(`Value For Router: ${valueForRouter}`);
    console.log(`Total Value: ${totalValue}`);
    
    const registerTx = await l1Token.registerTokenOnL2(
      L2_TOKEN_ADDRESS,
      maxSubmissionCostForCustomGateway,
      maxSubmissionCostForRouter,
      maxGasForCustomGateway,
      maxGasForRouter,
      l2GasPriceBid,
      valueForGateway,
      valueForRouter,
      destinationAddress,
      { value: totalValue }
    );
    
    console.log("Registration transaction submitted, waiting for confirmation...");
    const registerReceipt = await registerTx.wait();
    const registerTxHash = registerReceipt.hash || registerTx.hash;
    console.log(chalk.green(`Token registration successful: ${registerTxHash}`));
  } catch (error) {
    console.error(chalk.red("Error during token registration:"), error);
    process.exit(1);
  }

  // --- Bridging Tokens over to L2 ---
  console.log(chalk.blue("\nInitiating token bridge via the custom bridge..."));

  // Parameters for the bridge function
  const l1MaxGas = process.env.BRIDGE_L1_GAS_LIMIT ? BigInt(process.env.BRIDGE_L1_GAS_LIMIT) : BigInt(300000);
  const l2MaxGas = process.env.BRIDGE_L2_MAX_GAS ? BigInt(process.env.BRIDGE_L2_MAX_GAS) : BigInt(1000000);
  const maxSubmissionCost = process.env.BRIDGE_MAX_SUBMISSION_COST ? BigInt(process.env.BRIDGE_MAX_SUBMISSION_COST) : BigInt("500000000000000");
  const callHookData = process.env.BRIDGE_CALL_HOOK_DATA || "0x";
  const l2amount = process.env.BRIDGE_L2_CALL_VALUE_WEI ? BigInt(process.env.BRIDGE_L2_CALL_VALUE_WEI) : ethers.parseEther("0.002");
  const totalL2GasCost = l2MaxGas * l2GasPriceBid;
  const totalL2Value = maxSubmissionCost + totalL2GasCost + l2amount;
  const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
  ["uint256", "bytes"],
  [maxSubmissionCost, callHookData]
  );

  // Approve the token for the gateway transfer.
  const depositAmount = ethers.parseUnits(XPNT_TO_TRANSFER, XPNT_DECIMALS);
  console.log(`Approving ${XPNT_TO_TRANSFER} XPNT for the L1 Gateway...`);
  const erc20ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)"
  ];
  const l1TokenContract = new ethers.Contract(L1_TOKEN_ADDRESS, erc20ABI, owner);
  try {
    const approveTx = await l1TokenContract.approve(L1_CUSTOM_GATEWAY_ADDRESS, depositAmount);
    await approveTx.wait();
    console.log(chalk.green("Token approval complete."));
  } catch (error) {
    console.error(chalk.red("Error during token approval:"), error);
    process.exit(1);
  }


  console.log("Initiating outbound transfer on the custom bridge...");
  const l1GatewayRouterABI = [
     "function outboundTransferCustomRefund(address _token, address _refundTo, address _to, uint256 _amount, uint256 _maxGas, uint256 _gasPriceBid, bytes calldata _data) external payable returns (bytes memory)",
  ];

  const l1GatewayRouter = new ethers.Contract(
     L1_GATEWAY_ROUTER_ADDRESS,
     l1GatewayRouterABI,
     owner
  );

  try {
    const outboundTx = await l1GatewayRouter.outboundTransferCustomRefund(
      L1_TOKEN_ADDRESS,
      ownerAddress,         // refund recipient
      destinationAddress,   // destination on L2
      depositAmount,
      l2MaxGas,
      l2GasPriceBid,
      extraData,
      {
        gasLimit: l1MaxGas,
        gasPrice: l1GasPriceBid,
        value: totalL2Value,
      }
    );
    console.log("Outbound transfer transaction submitted, waiting for confirmation...");
    const receipt = await outboundTx.wait();
    console.log(chalk.green(`Outbound transfer successful: ${receipt.hash}`));
    console.log(`Track the retryable ticket here: https://retryable-dashboard.arbitrum.io/tx/${receipt.hash}`);
  } catch (error) {
    console.error(chalk.red("Error during outbound transfer:"), error);
    process.exit(1);
  }

  console.log(chalk.green("\nToken registration and bridging complete."));
}

main().catch((error) => {
  console.error(chalk.red("Script encountered an error:"), error);
  process.exitCode = 1;
});

