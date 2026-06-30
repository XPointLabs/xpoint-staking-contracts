#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const path = require("path");
const url = require("url");

const repoRoot = path.resolve(__dirname, "..");
const host = process.env.METAMASK_DEPLOY_HOST || "127.0.0.1";
const port = Number(process.env.METAMASK_DEPLOY_PORT || 28161);

const config = {
  chainId: 42161,
  chainHex: "0xa4b1",
  chainName: "Arbitrum One",
  rpcUrl: process.env.ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc",
  explorerUrl: "https://arbiscan.io",
  tokenAddress:
    process.env.XPNT_TOKEN_ADDRESS || "0x63B2cdb8B0d8774F1Fdca91D24803698582a079F",
  ownerAddress:
    process.env.PROD_OWNER_ADDRESS || "0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750",
  stakingRequirementXpnt: process.env.XPNT_STAKING_REQUIREMENT || "25000",
  poolInitialXpnt: process.env.XPNT_REWARD_POOL_INITIAL || "40000000",
  tokenDecimals: 9,
  maxContributors: 10,
  liquidatorRewardRatio: 3,
  poolShareOfLiquidationRatio: 17,
  recipientRatio: 9980,
};

const artifactPaths = {
  RewardRatePool: "artifacts/contracts/RewardRatePool.sol/RewardRatePool.json",
  ServiceNodeRewards: "artifacts/contracts/ServiceNodeRewards.sol/ServiceNodeRewards.json",
  ServiceNodeContribution:
    "artifacts/contracts/ServiceNodeContribution.sol/ServiceNodeContribution.json",
  ServiceNodeContributionFactory:
    "artifacts/contracts/ServiceNodeContributionFactory.sol/ServiceNodeContributionFactory.json",
  TransparentUpgradeableProxy:
    "artifacts/@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol/TransparentUpgradeableProxy.json",
};

const erc20Abi = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

function readArtifact(name) {
  const artifactPath = path.join(repoRoot, artifactPaths[name]);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Missing ${name} artifact at ${artifactPath}. Run "npx hardhat compile" first.`
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return {
    contractName: artifact.contractName,
    abi: artifact.abi,
    bytecode: artifact.bytecode,
  };
}

function deploymentBundle() {
  return {
    config,
    erc20Abi,
    artifacts: Object.fromEntries(
      Object.keys(artifactPaths).map((name) => [name, readArtifact(name)])
    ),
  };
}

function writeJsonResponse(res, statusCode, body) {
  const json = JSON.stringify(body, null, 2);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(json);
}

function writeManifest(manifest) {
  const deploymentsDir = path.join(repoRoot, "deployments");
  fs.mkdirSync(deploymentsDir, { recursive: true });

  const hardhatPath = path.join(deploymentsDir, "arbitrum.latest.json");
  const summaryPath = path.join(deploymentsDir, "xpnt-staking-arbitrum.latest.json");

  fs.writeFileSync(hardhatPath, JSON.stringify(manifest, null, 2) + "\n");

  const summary = {
    timestamp: manifest.timestamp,
    network: "arbitrum",
    chainId: config.chainId,
    owner: manifest.owner,
    token: {
      address: config.tokenAddress,
      symbol: "XPNT",
      stakingRequirement: config.stakingRequirementXpnt,
      stakingRequirementAtomic: manifest.parameters.stakingRequirement,
    },
    contracts: {
      serviceNodeRewards: manifest.contracts.serviceNodeRewards,
      rewardRatePool: manifest.contracts.rewardRatePool,
      serviceNodeContributionFactory: manifest.contracts.serviceNodeContributionFactory,
      serviceNodeContributionImplementation:
        manifest.contracts.serviceNodeContributionImplementation,
      rewardRatePoolImplementation: manifest.contracts.rewardRatePoolImplementation,
      serviceNodeRewardsImplementation: manifest.contracts.serviceNodeRewardsImplementation,
      serviceNodeContributionFactoryImplementation:
        manifest.contracts.serviceNodeContributionFactoryImplementation,
    },
    proxyAdmins: manifest.proxyAdmins || {},
    deploymentTransactions: manifest.deploymentTransactions,
    manifests: {
      hardhat: hardhatPath,
      summary: summaryPath,
    },
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n");

  return { hardhatPath, summaryPath };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store",
    });
    res.end(data);
  });
}

const page = String.raw`<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>XPoint Staking Mainnet Deployment</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #05070b;
      --panel: #0f1725;
      --panel-2: #111d31;
      --text: #edf6ff;
      --muted: #91a3bc;
      --line: #26364f;
      --blue: #2897ff;
      --blue-2: #61d5ff;
      --danger: #ff6578;
      --ok: #73a7ff;
      --warn: #ffcc66;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at top left, rgba(40,151,255,.26), transparent 32rem),
        linear-gradient(135deg, #05070b 0%, #08111f 48%, #05070b 100%);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 36px 0 64px;
    }
    header { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: clamp(28px, 4vw, 44px); letter-spacing: 0; line-height: 1.05; }
    h2 { margin: 0 0 14px; font-size: 18px; letter-spacing: 0; }
    p { color: var(--muted); line-height: 1.55; margin: 0; }
    code { color: var(--blue-2); overflow-wrap: anywhere; }
    button {
      border: 0;
      color: white;
      background: linear-gradient(135deg, var(--blue), #4169ff);
      padding: 12px 16px;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 12px 34px rgba(40,151,255,.22);
    }
    button.secondary { background: #1a263a; box-shadow: none; border: 1px solid var(--line); }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .panel {
      background: linear-gradient(180deg, rgba(17,29,49,.96), rgba(10,18,31,.96));
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      box-shadow: 0 18px 60px rgba(0,0,0,.24);
    }
    .wide { grid-column: 1 / -1; }
    .kv { display: grid; gap: 10px; }
    .row { display: grid; grid-template-columns: 190px 1fr; gap: 12px; align-items: start; }
    .label { color: var(--muted); }
    .value { color: var(--text); overflow-wrap: anywhere; }
    .status { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); border-radius: 999px; padding: 7px 11px; color: var(--muted); background: rgba(15,23,37,.72); }
    .dot { width: 9px; height: 9px; border-radius: 999px; background: var(--muted); }
    .status.ok .dot { background: var(--ok); }
    .status.bad .dot { background: var(--danger); }
    .status.warn .dot { background: var(--warn); }
    .steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
    .step { display: grid; grid-template-columns: 32px 1fr auto; gap: 12px; align-items: center; padding: 12px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); border-radius: 8px; }
    .step-index { width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center; background: #18263b; color: var(--muted); font-weight: 700; }
    .step.done .step-index { background: rgba(115,167,255,.18); color: #b8d2ff; }
    .step.failed { border-color: rgba(255,101,120,.65); }
    .step small { display: block; color: var(--muted); margin-top: 3px; overflow-wrap: anywhere; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    .checklist { display: grid; gap: 10px; }
    label.confirm { display: flex; gap: 10px; color: var(--text); align-items: flex-start; }
    input[type="checkbox"] { margin-top: 4px; }
    pre { margin: 0; max-height: 360px; overflow: auto; padding: 14px; background: #050b14; border: 1px solid var(--line); border-radius: 8px; color: #cfe4ff; }
    a { color: var(--blue-2); }
    @media (max-width: 820px) {
      header, .grid { display: block; }
      .panel { margin-bottom: 16px; }
      .row { grid-template-columns: 1fr; gap: 2px; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>XPoint Staking Mainnet Deployment</h1>
        <p>Локальный wizard. Транзакции подписывает только MetaMask, приватный ключ не покидает браузер.</p>
      </div>
      <span id="networkStatus" class="status warn"><span class="dot"></span><span>Не подключено</span></span>
    </header>

    <section class="grid">
      <div class="panel">
        <h2>Параметры</h2>
        <div class="kv" id="params"></div>
      </div>
      <div class="panel">
        <h2>Кошелёк</h2>
        <div class="kv" id="wallet"></div>
        <div class="actions" style="margin-top: 16px;">
          <button id="connectBtn">Подключить MetaMask</button>
          <button id="switchBtn" class="secondary">Переключить на Arbitrum One</button>
        </div>
      </div>

      <div class="panel wide">
        <h2>Подтверждение перед деплоем</h2>
        <div class="checklist">
          <label class="confirm"><input id="confirmOwner" type="checkbox" /> <span>Я подключил deployer/owner кошелёк <code id="ownerInline"></code>. Если адрес не совпадает, кнопка деплоя останется заблокированной.</span></label>
          <label class="confirm"><input id="confirmDeposit" type="checkbox" /> <span>Я подтверждаю initial deposit <code id="depositInline"></code> XPNT в RewardRatePool.</span></label>
          <label class="confirm"><input id="confirmNoSubscriptions" type="checkbox" /> <span>Я понимаю, что SubscriptionManager и связанные контракты подписок сейчас не деплоятся.</span></label>
        </div>
        <div class="actions" style="margin-top: 16px;">
          <button id="deployBtn" disabled>Запустить последовательный деплой</button>
          <button id="saveBtn" class="secondary" disabled>Сохранить manifest ещё раз</button>
        </div>
      </div>

      <div class="panel wide">
        <h2>Шаги</h2>
        <ol class="steps" id="steps"></ol>
      </div>

      <div class="panel wide">
        <h2>Manifest</h2>
        <pre id="manifest">{}</pre>
      </div>
    </section>
  </main>

  <script src="/vendor/ethers.umd.min.js"></script>
  <script>
    const $ = (id) => document.getElementById(id);
    const explorerAddress = (addr) => state.bundle.config.explorerUrl + "/address/" + addr;
    const explorerTx = (tx) => state.bundle.config.explorerUrl + "/tx/" + tx;
    const state = {
      bundle: null,
      provider: null,
      signer: null,
      account: "",
      chainId: 0,
      manifest: null,
      deployments: {},
      proxyAdmins: {},
      txs: {},
      receipts: {},
      running: false,
    };

    const stepDefs = [
      ["rewardRatePoolImplementation", "Deploy RewardRatePool implementation"],
      ["rewardRatePool", "Deploy RewardRatePool proxy"],
      ["serviceNodeRewardsImplementation", "Deploy ServiceNodeRewards implementation"],
      ["serviceNodeRewards", "Deploy ServiceNodeRewards proxy"],
      ["serviceNodeContributionImplementation", "Deploy ServiceNodeContribution implementation"],
      ["serviceNodeContributionFactoryImplementation", "Deploy ServiceNodeContributionFactory implementation"],
      ["serviceNodeContributionFactory", "Deploy ServiceNodeContributionFactory proxy"],
      ["initializeServiceNodeRewardsV2", "Initialize ServiceNodeRewards V2 state"],
      ["initializeRewardRatePoolV2", "Connect RewardRatePool to active stake"],
      ["setRewardPoolBeneficiary", "Set RewardRatePool beneficiary to ServiceNodeRewards"],
      ["approveRewardPoolDeposit", "Approve 40,000,000 XPNT for RewardRatePool"],
      ["depositRewardPool", "Deposit 40,000,000 XPNT into RewardRatePool"],
      ["saveManifest", "Save deployment manifest locally"],
    ];

    function atomic(amount) {
      return ethers.parseUnits(String(amount), state.bundle.config.tokenDecimals);
    }

    function short(value) {
      if (!value) return "";
      return value.slice(0, 6) + "..." + value.slice(-4);
    }

    function setStatus(kind, text) {
      $("networkStatus").className = "status " + kind;
      $("networkStatus").lastElementChild.textContent = text;
    }

    function kv(label, value) {
      return '<div class="row"><div class="label">' + label + '</div><div class="value">' + value + '</div></div>';
    }

    function renderParams() {
      const c = state.bundle.config;
      $("ownerInline").textContent = c.ownerAddress;
      $("depositInline").textContent = Number(c.poolInitialXpnt).toLocaleString("en-US");
      $("params").innerHTML = [
        kv("Network", c.chainName + " (" + c.chainId + ")"),
        kv("XPNT", '<a href="' + explorerAddress(c.tokenAddress) + '" target="_blank">' + c.tokenAddress + "</a>"),
        kv("Owner/deployer", "<code>" + c.ownerAddress + "</code>"),
        kv("Staking requirement", Number(c.stakingRequirementXpnt).toLocaleString("en-US") + " XPNT"),
        kv("Reward pool deposit", Number(c.poolInitialXpnt).toLocaleString("en-US") + " XPNT"),
        kv("Max contributors per node", String(c.maxContributors)),
        kv(
          "Liquidation split",
          c.liquidatorRewardRatio + " / " + c.poolShareOfLiquidationRatio + " / " + c.recipientRatio +
            " (liquidator / reward pool / recipient; 0.03% / 0.17% / 99.8%)"
        ),
      ].join("");
    }

    async function renderWallet() {
      const c = state.bundle.config;
      let html = [
        kv("Account", state.account ? "<code>" + state.account + "</code>" : "Не подключено"),
        kv("Chain", state.chainId ? String(state.chainId) : "Не подключено"),
      ];
      if (state.account && state.provider) {
        try {
          const token = new ethers.Contract(c.tokenAddress, state.bundle.erc20Abi, state.provider);
          const [symbol, decimals, balance] = await Promise.all([
            token.symbol(),
            token.decimals(),
            token.balanceOf(state.account),
          ]);
          html.push(kv("Token", symbol + " / " + decimals + " decimals"));
          html.push(kv("XPNT balance", ethers.formatUnits(balance, decimals) + " " + symbol));
        } catch (err) {
          html.push(kv("Token check", '<span style="color: var(--danger)">' + err.message + "</span>"));
        }
      }
      $("wallet").innerHTML = html.join("");
      const ok =
        state.account &&
        state.chainId === c.chainId &&
        state.account.toLowerCase() === c.ownerAddress.toLowerCase() &&
        $("confirmOwner").checked &&
        $("confirmDeposit").checked &&
        $("confirmNoSubscriptions").checked &&
        !state.running;
      $("deployBtn").disabled = !ok;
      $("saveBtn").disabled = !state.manifest;

      if (!state.account) setStatus("warn", "MetaMask не подключен");
      else if (state.chainId !== c.chainId) setStatus("bad", "Нужно переключить сеть");
      else if (state.account.toLowerCase() !== c.ownerAddress.toLowerCase()) setStatus("bad", "Адрес не совпадает с owner");
      else setStatus("ok", "Готово к подписанию");
    }

    function renderSteps(activeKey, failedKey) {
      $("steps").innerHTML = stepDefs.map(([key, title], index) => {
        const done = state.deployments[key] || state.txs[key] || key === "saveManifest" && state.manifest;
        const failed = failedKey === key;
        const tx = state.txs[key];
        const addr = state.deployments[key];
        const proxyAdmin = state.proxyAdmins[key];
        let meta = "";
        if (addr) meta += '<small>Address: <a target="_blank" href="' + explorerAddress(addr) + '">' + addr + "</a></small>";
        if (proxyAdmin) meta += '<small>ProxyAdmin: <a target="_blank" href="' + explorerAddress(proxyAdmin) + '">' + proxyAdmin + "</a></small>";
        if (tx) meta += '<small>Tx: <a target="_blank" href="' + explorerTx(tx) + '">' + tx + "</a></small>";
        if (activeKey === key) meta += "<small>Ожидаю подтверждение/майнинг...</small>";
        return '<li class="step ' + (done ? "done " : "") + (failed ? "failed" : "") + '">' +
          '<div class="step-index">' + (index + 1) + "</div>" +
          '<div><strong>' + title + "</strong>" + meta + "</div>" +
          '<div>' + (done ? "OK" : activeKey === key ? "..." : "") + "</div>" +
          "</li>";
      }).join("");
    }

    function contractFactory(name) {
      const artifact = state.bundle.artifacts[name];
      return new ethers.ContractFactory(artifact.abi, artifact.bytecode, state.signer);
    }

    async function waitDeployment(key, contract) {
      const tx = contract.deploymentTransaction();
      state.txs[key] = tx.hash;
      renderSteps(key);
      const receipt = await tx.wait(1);
      const address = await contract.getAddress();
      state.deployments[key] = address;
      state.txs[key] = receipt.hash;
      state.receipts[key] = {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        contractAddress: address,
      };
      renderSteps();
      return address;
    }

    async function deployImplementation(key, name) {
      if (state.deployments[key]) return state.deployments[key];
      const contract = await contractFactory(name).deploy();
      return waitDeployment(key, contract);
    }

    async function deployProxy(key, implementation, initData) {
      if (state.deployments[key]) return state.deployments[key];
      const proxy = await contractFactory("TransparentUpgradeableProxy").deploy(
        implementation,
        state.bundle.config.ownerAddress,
        initData
      );
      const proxyAddress = await waitDeployment(key, proxy);
      state.proxyAdmins[key] = await readProxyAdmin(proxyAddress);
      renderSteps();
      return proxyAddress;
    }

    async function readProxyAdmin(proxyAddress) {
      const slot = ethers.toBeHex(BigInt(ethers.id("eip1967.proxy.admin")) - 1n, 32);
      const value = await state.provider.getStorage(proxyAddress, slot);
      return ethers.getAddress("0x" + value.slice(-40));
    }

    async function sendTx(key, txPromise) {
      if (state.txs[key]) return;
      renderSteps(key);
      const tx = await txPromise;
      state.txs[key] = tx.hash;
      renderSteps(key);
      const receipt = await tx.wait(1);
      state.txs[key] = receipt.hash;
      state.receipts[key] = {
        hash: receipt.hash,
        blockNumber: receipt.blockNumber,
        contractAddress: null,
      };
      renderSteps();
    }

    function buildManifest() {
      const c = state.bundle.config;
      const deployBlocks = Object.values(state.receipts || {})
        .map((receipt) => receipt && receipt.blockNumber)
        .filter(Number.isInteger);
      const txRecord = (key, contractAddress = null) =>
        state.receipts[key] || (state.txs[key] ? {
          hash: state.txs[key],
          blockNumber: null,
          contractAddress,
        } : null);
      return {
        timestamp: new Date().toISOString(),
        network: "arbitrum",
        chainId: c.chainId,
        owner: c.ownerAddress,
        token: {
          name: "XPoint",
          symbol: "XPNT",
          decimals: c.tokenDecimals,
          address: c.tokenAddress,
        },
        startBlock: deployBlocks.length ? Math.min(...deployBlocks) : null,
        deploymentTransactions: {
          token: null,
          rewardRatePoolImplementation: txRecord("rewardRatePoolImplementation", state.deployments.rewardRatePoolImplementation),
          rewardRatePool: txRecord("rewardRatePool", state.deployments.rewardRatePool),
          serviceNodeRewardsImplementation: txRecord("serviceNodeRewardsImplementation", state.deployments.serviceNodeRewardsImplementation),
          serviceNodeRewards: txRecord("serviceNodeRewards", state.deployments.serviceNodeRewards),
          serviceNodeContributionImplementation: txRecord("serviceNodeContributionImplementation", state.deployments.serviceNodeContributionImplementation),
          serviceNodeContributionFactoryImplementation: txRecord(
            "serviceNodeContributionFactoryImplementation",
            state.deployments.serviceNodeContributionFactoryImplementation
          ),
          serviceNodeContributionFactory: txRecord("serviceNodeContributionFactory", state.deployments.serviceNodeContributionFactory),
          initializeServiceNodeRewardsV2: txRecord("initializeServiceNodeRewardsV2"),
          initializeRewardRatePoolV2: txRecord("initializeRewardRatePoolV2"),
          setRewardPoolBeneficiary: txRecord("setRewardPoolBeneficiary"),
          approveRewardPoolDeposit: txRecord("approveRewardPoolDeposit"),
          depositRewardPool: txRecord("depositRewardPool"),
        },
        contracts: {
          token: c.tokenAddress,
          rewardRatePoolImplementation: state.deployments.rewardRatePoolImplementation,
          rewardRatePool: state.deployments.rewardRatePool,
          serviceNodeRewardsImplementation: state.deployments.serviceNodeRewardsImplementation,
          serviceNodeRewards: state.deployments.serviceNodeRewards,
          serviceNodeContributionImplementation: state.deployments.serviceNodeContributionImplementation,
          serviceNodeContributionFactoryImplementation: state.deployments.serviceNodeContributionFactoryImplementation,
          serviceNodeContributionFactory: state.deployments.serviceNodeContributionFactory,
        },
        proxyAdmins: {
          rewardRatePool: state.proxyAdmins.rewardRatePool,
          serviceNodeRewards: state.proxyAdmins.serviceNodeRewards,
          serviceNodeContributionFactory: state.proxyAdmins.serviceNodeContributionFactory,
        },
        parameters: {
          supply: null,
          poolInitial: atomic(c.poolInitialXpnt).toString(),
          stakingRequirement: atomic(c.stakingRequirementXpnt).toString(),
          maxContributors: c.maxContributors,
          liquidatorRewardRatio: c.liquidatorRewardRatio,
          poolShareOfLiquidationRatio: c.poolShareOfLiquidationRatio,
          recipientRatio: c.recipientRatio,
          poolAnnualEmissionRateTenthsPercent: 140,
          activeStakeAnnualEmissionRateTenthsPercent: 300,
          mainnet: true,
          subscriptionContractsDeployed: false,
        },
      };
    }

    async function saveManifest() {
      state.manifest = buildManifest();
      $("manifest").textContent = JSON.stringify(state.manifest, null, 2);
      const response = await fetch("/api/manifest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(state.manifest),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      state.txs.saveManifest = "local";
      renderSteps();
      return result;
    }

    async function connect() {
      if (!window.ethereum) {
        alert("MetaMask не найден в этом браузере.");
        return;
      }
      state.provider = new ethers.BrowserProvider(window.ethereum);
      await state.provider.send("eth_requestAccounts", []);
      state.signer = await state.provider.getSigner();
      state.account = await state.signer.getAddress();
      const network = await state.provider.getNetwork();
      state.chainId = Number(network.chainId);
      await renderWallet();
    }

    async function switchNetwork() {
      const c = state.bundle.config;
      if (!window.ethereum) return;
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: c.chainHex }],
        });
      } catch (err) {
        if (err.code === 4902) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: c.chainHex,
              chainName: c.chainName,
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: [c.rpcUrl],
              blockExplorerUrls: [c.explorerUrl],
            }],
          });
        } else {
          throw err;
        }
      }
      await connect();
    }

    async function deployAll() {
      state.running = true;
      await renderWallet();
      try {
        const c = state.bundle.config;
        const rewardPoolIface = new ethers.Interface(state.bundle.artifacts.RewardRatePool.abi);
        const rewardsIface = new ethers.Interface(state.bundle.artifacts.ServiceNodeRewards.abi);
        const factoryIface = new ethers.Interface(state.bundle.artifacts.ServiceNodeContributionFactory.abi);

        const token = new ethers.Contract(c.tokenAddress, state.bundle.erc20Abi, state.signer);
        const [symbol, decimals, balance] = await Promise.all([
          token.symbol(),
          token.decimals(),
          token.balanceOf(state.account),
        ]);
        if (symbol !== "XPNT") throw new Error("Token symbol mismatch: " + symbol);
        if (Number(decimals) !== c.tokenDecimals) throw new Error("Token decimals mismatch: " + decimals);
        if (balance < atomic(c.poolInitialXpnt)) {
          throw new Error("Недостаточно XPNT для reward pool deposit: " + ethers.formatUnits(balance, decimals));
        }

        const rewardPoolImpl = await deployImplementation("rewardRatePoolImplementation", "RewardRatePool");
        const rewardPoolProxy = await deployProxy(
          "rewardRatePool",
          rewardPoolImpl,
          rewardPoolIface.encodeFunctionData("initialize", [c.ownerAddress, c.tokenAddress])
        );

        const serviceNodeRewardsImpl = await deployImplementation(
          "serviceNodeRewardsImplementation",
          "ServiceNodeRewards"
        );
        const serviceNodeRewardsProxy = await deployProxy(
          "serviceNodeRewards",
          serviceNodeRewardsImpl,
          rewardsIface.encodeFunctionData("initialize", [
            c.tokenAddress,
            rewardPoolProxy,
            atomic(c.stakingRequirementXpnt),
            c.maxContributors,
            c.liquidatorRewardRatio,
            c.poolShareOfLiquidationRatio,
            c.recipientRatio,
          ])
        );

        await deployImplementation("serviceNodeContributionImplementation", "ServiceNodeContribution");

        const factoryImpl = await deployImplementation(
          "serviceNodeContributionFactoryImplementation",
          "ServiceNodeContributionFactory"
        );
        await deployProxy(
          "serviceNodeContributionFactory",
          factoryImpl,
          factoryIface.encodeFunctionData("initialize", [
            serviceNodeRewardsProxy,
            state.deployments.serviceNodeContributionImplementation,
          ])
        );

        const rewardPool = new ethers.Contract(rewardPoolProxy, state.bundle.artifacts.RewardRatePool.abi, state.signer);
        const serviceNodeRewards = new ethers.Contract(
          serviceNodeRewardsProxy,
          state.bundle.artifacts.ServiceNodeRewards.abi,
          state.signer
        );
        await sendTx("initializeServiceNodeRewardsV2", serviceNodeRewards.initializeV2());
        await sendTx("initializeRewardRatePoolV2", rewardPool.initializeV2(serviceNodeRewardsProxy));
        await sendTx("setRewardPoolBeneficiary", rewardPool.setBeneficiary(serviceNodeRewardsProxy));

        const allowance = await token.allowance(state.account, rewardPoolProxy);
        const poolInitial = atomic(c.poolInitialXpnt);
        if (allowance < poolInitial) {
          await sendTx("approveRewardPoolDeposit", token.approve(rewardPoolProxy, poolInitial));
        } else {
          state.txs.approveRewardPoolDeposit = "allowance-sufficient";
        }
        await sendTx("depositRewardPool", rewardPool.deposit(poolInitial));

        await saveManifest();
        alert("Деплой завершён. Manifest сохранён локально.");
      } catch (err) {
        console.error(err);
        const message = err && (err.shortMessage || err.message) ? (err.shortMessage || err.message) : String(err);
        alert("Деплой остановлен: " + message);
      } finally {
        state.running = false;
        await renderWallet();
      }
    }

    async function init() {
      state.bundle = await fetch("/api/bundle").then((r) => r.json());
      renderParams();
      renderSteps();
      ["confirmOwner", "confirmDeposit", "confirmNoSubscriptions"].forEach((id) => {
        $(id).addEventListener("change", renderWallet);
      });
      $("connectBtn").addEventListener("click", connect);
      $("switchBtn").addEventListener("click", switchNetwork);
      $("deployBtn").addEventListener("click", deployAll);
      $("saveBtn").addEventListener("click", saveManifest);
      if (window.ethereum) {
        window.ethereum.on("accountsChanged", connect);
        window.ethereum.on("chainChanged", connect);
      }
      await renderWallet();
    }

    init().catch((err) => {
      console.error(err);
      alert(err.message || String(err));
    });
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  try {
    if (req.method === "GET" && parsed.pathname === "/") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end(page);
      return;
    }

    if (req.method === "GET" && parsed.pathname === "/api/bundle") {
      writeJsonResponse(res, 200, deploymentBundle());
      return;
    }

    if (req.method === "GET" && parsed.pathname === "/vendor/ethers.umd.min.js") {
      serveFile(
        res,
        path.join(repoRoot, "node_modules", "ethers", "dist", "ethers.umd.min.js"),
        "text/javascript; charset=utf-8"
      );
      return;
    }

    if (req.method === "POST" && parsed.pathname === "/api/manifest") {
      const raw = await readBody(req);
      const manifest = JSON.parse(raw);
      const paths = writeManifest(manifest);
      writeJsonResponse(res, 200, { ok: true, paths });
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(err.stack || err.message || String(err));
  }
});

server.listen(port, host, () => {
  console.log(`MetaMask staking deployment wizard: http://${host}:${port}/`);
  console.log(`Network: ${config.chainName} (${config.chainId})`);
  console.log(`XPNT: ${config.tokenAddress}`);
  console.log(`Owner/deployer: ${config.ownerAddress}`);
  console.log(`Staking requirement: ${config.stakingRequirementXpnt} XPNT`);
  console.log(`Reward pool initial deposit: ${config.poolInitialXpnt} XPNT`);
});
