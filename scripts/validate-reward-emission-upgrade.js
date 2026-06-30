const { inspectUpgrade } = require("./reward-emission-upgrade-common");

async function main() {
    const validate = process.env.SKIP_MANIFEST_VALIDATION !== "true";
    const { snapshot } = await inspectUpgrade({ validate });
    console.log(JSON.stringify(snapshot, null, 2));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
