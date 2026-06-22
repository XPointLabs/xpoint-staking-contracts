// Bridges an already-registered L1 XPNT balance from Ethereum mainnet to Arbitrum One.
// Unlike register-and-bridge.js, this script does not repeat L1->L2 token registration.
const hre = require("hardhat");
const chalk = require("chalk");
const { patchRpcEmptyTo } = require("./normalize-rpc-empty-to.js");

patchRpcEmptyTo(hre);

const ethers = hre.ethers;

async function main() {
  const XPNT_DECIMALS = 9;
  const XPNT_TO_TRANSFER = process.env.XPNT_BRIDGE_AMOUNT || process.env.XPNT_BRIDGE_TEST_AMOUNT || "1";

  const L1_TOKEN_ADDRESS = process.env.L1_XPNT_TOKEN_ADDRESS;
  const L2_TOKEN_ADDRESS = process.env.L2_XPNT_TOKEN_ADDRESS || process.env.L2_XPNTL2_TOKEN_ADDRESS || "";

  // Defaults are Ethereum mainnet -> Arbitrum One bridge contracts.
  const L1_GATEWAY_ROUTER_ADDRESS = process.env.L1_ROUTER_ADDRESS || "0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef";
  const L1_CUSTOM_GATEWAY_ADDRESS = process.env.L1_GATEWAY_ADDRESS || "0xcEe284F754E854890e311e3280b767F80797180d";

  const [owner] = await ethers.getSigners();
  const ownerAddress = await owner.getAddress();
  const destinationAddress = process.env.BRIDGE_DESTINATION_ADDRESS || ownerAddress;

  for (const [name, address] of Object.entries({
    L1_XPNT_TOKEN_ADDRESS: L1_TOKEN_ADDRESS,
    L1_ROUTER_ADDRESS: L1_GATEWAY_ROUTER_ADDRESS,
    L1_GATEWAY_ADDRESS: L1_CUSTOM_GATEWAY_ADDRESS,
    BRIDGE_DESTINATION_ADDRESS: destinationAddress,
  })) {
    if (!ethers.isAddress(address)) {
      console.error(chalk.red(`Error: ${name} must be set to a valid address.`));
      process.exit(1);
    }
  }

  if (L2_TOKEN_ADDRESS && !ethers.isAddress(L2_TOKEN_ADDRESS)) {
    console.error(chalk.red("Error: L2_XPNT_TOKEN_ADDRESS must be a valid address when provided."));
    process.exit(1);
  }

  console.log(chalk.green(`Using deployer: ${ownerAddress}`));
  console.log(`Destination on Arbitrum: ${destinationAddress}`);
  if (L2_TOKEN_ADDRESS) {
    console.log(`Expected L2 token address: ${L2_TOKEN_ADDRESS}`);
  }

  const feeData = await owner.provider.getFeeData();
  const l1GasPriceBid = feeData.gasPrice ? feeData.gasPrice * BigInt(2) : ethers.parseUnits("10", "gwei");
  const l2GasPriceBid = process.env.L2_GAS_PRICE_BID ? BigInt(process.env.L2_GAS_PRICE_BID) : BigInt("1000000000");

  const l1MaxGas = process.env.BRIDGE_L1_GAS_LIMIT ? BigInt(process.env.BRIDGE_L1_GAS_LIMIT) : BigInt(300000);
  const l2MaxGas = process.env.BRIDGE_L2_MAX_GAS ? BigInt(process.env.BRIDGE_L2_MAX_GAS) : BigInt(1000000);
  const maxSubmissionCost = process.env.BRIDGE_MAX_SUBMISSION_COST ? BigInt(process.env.BRIDGE_MAX_SUBMISSION_COST) : BigInt("500000000000000");
  const callHookData = process.env.BRIDGE_CALL_HOOK_DATA || "0x";
  const l2CallValue = process.env.BRIDGE_L2_CALL_VALUE_WEI ? BigInt(process.env.BRIDGE_L2_CALL_VALUE_WEI) : ethers.parseEther("0.002");

  const totalL2GasCost = l2MaxGas * l2GasPriceBid;
  const totalL2Value = maxSubmissionCost + totalL2GasCost + l2CallValue;
  const extraData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "bytes"],
    [maxSubmissionCost, callHookData]
  );

  const depositAmount = ethers.parseUnits(XPNT_TO_TRANSFER, XPNT_DECIMALS);

  console.log(chalk.blue("\nApproving XPNT for the L1 custom gateway..."));
  console.log(`Amount: ${XPNT_TO_TRANSFER} XPNT`);
  console.log(`L1 token: ${L1_TOKEN_ADDRESS}`);
  console.log(`L1 gateway: ${L1_CUSTOM_GATEWAY_ADDRESS}`);
  console.log(`L1 router: ${L1_GATEWAY_ROUTER_ADDRESS}`);
  console.log(`Max submission cost: ${maxSubmissionCost}`);
  console.log(`L2 gas price bid: ${l2GasPriceBid}`);
  console.log(`L2 max gas: ${l2MaxGas}`);
  console.log(`Total retryable value (wei): ${totalL2Value}`);

  const erc20ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)"
  ];
  const l1TokenContract = new ethers.Contract(L1_TOKEN_ADDRESS, erc20ABI, owner);

  try {
    const approveTx = await l1TokenContract.approve(L1_CUSTOM_GATEWAY_ADDRESS, depositAmount);
    await approveTx.wait();
    console.log(chalk.green(`Approval complete: ${approveTx.hash}`));
  } catch (error) {
    console.error(chalk.red("Error during token approval:"), error);
    process.exit(1);
  }

  console.log(chalk.blue("\nInitiating outbound transfer on the custom bridge..."));

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
      ownerAddress,
      destinationAddress,
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
    if (L2_TOKEN_ADDRESS) {
      console.log(`Import the L2 token in your wallet if needed: ${L2_TOKEN_ADDRESS}`);
    }
  } catch (error) {
    console.error(chalk.red("Error during outbound transfer:"), error);
    process.exit(1);
  }

  console.log(chalk.green("\nXPNT bridge transfer complete."));
}

main().catch((error) => {
  console.error(chalk.red("Script encountered an error:"), error);
  process.exitCode = 1;
});