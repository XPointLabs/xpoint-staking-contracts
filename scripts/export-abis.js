const fs = require("fs");
const path = require("path");

const contracts = [
  "XPNT",
  "XPNTL2",
  "RewardRatePool",
  "OpsBudgetEscrow",
  "ServiceNodeRewards",
  "ServiceNodeContribution",
  "ServiceNodeContributionFactory",
  "SubscriptionManager",
  "TokenVestingStaking",
  "TokenVestingNoStaking",
];

const root = path.resolve(__dirname, "..");
const artifactsDir = path.join(root, "artifacts", "contracts");
const outDir = path.join(root, "abi");

fs.mkdirSync(outDir, { recursive: true });

for (const contractName of contracts) {
  const artifact = findArtifact(artifactsDir, contractName);
  if (!artifact) {
    throw new Error(`Could not find artifact for ${contractName}. Run hardhat compile first.`);
  }

  const parsed = JSON.parse(fs.readFileSync(artifact, "utf8"));
  fs.writeFileSync(path.join(outDir, `${contractName}.json`), JSON.stringify(parsed.abi, null, 2) + "\n");
}

function findArtifact(dir, contractName) {
  if (!fs.existsSync(dir)) {
    return null;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findArtifact(fullPath, contractName);
      if (found) {
        return found;
      }
    } else if (entry.isFile() && entry.name === `${contractName}.json`) {
      return fullPath;
    }
  }

  return null;
}
