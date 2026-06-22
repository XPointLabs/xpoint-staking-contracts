require("./deploy-common.js")();

async function main() {
    await deployTestnetContracts("XPoint Devnet", "DXPNT");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
