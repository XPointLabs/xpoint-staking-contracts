require("./deploy-common.js")();

async function main() {
    // NOTE: Set this when reusing an existing XPNT stagenet token.
    const TOKEN_ADDRESS = process.env.XPNT_TOKEN_ADDRESS || "";

    const args = {
      TOKEN_ADDRESS
    };
    await deployTestnetContracts("XPoint", "XPNT", args);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
