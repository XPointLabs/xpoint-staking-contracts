#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const path = require("path");
const url = require("url");

const repoRoot = path.resolve(__dirname, "..");
const host = process.env.METAMASK_UPGRADE_HOST || "127.0.0.1";
const port = Number(process.env.METAMASK_UPGRADE_PORT || 28162);
const config = {
    chainId: 42161,
    chainHex: "0xa4b1",
    chainName: "Arbitrum One",
    rpcUrl: process.env.ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    owner: process.env.PROD_OWNER_ADDRESS || "0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750",
    serviceNodeRewards: process.env.SERVICE_NODE_REWARDS_ADDRESS || "0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f",
    rewardRatePool: process.env.REWARD_RATE_POOL_ADDRESS || "0xEd894fb5f0BA3b141A562190D4c9941FEd348356",
    expected: {
        serviceNodeRewardsImplementation: "0x12EB6963deA94CC253136854DbbEFC9E7464118f",
        rewardRatePoolImplementation: "0x6fc2A62B8a3A24E531F66A678FF2f0BEc86Ca5B5",
        serviceNodeRewardsProxyAdmin: "0xb5E91592e646201720b995E0b5C552E5458424b0",
        rewardRatePoolProxyAdmin: "0x095DA371BFC91751DA3A22A18577D0cCbb84Dbb3",
    },
    uatEvidence: {
        serviceNodeRewardsUpgrade: "0x13cb054bca9f9aa6e82a4f7cac97ab3bebc586a803baa9bea4188f8c79e0ae62",
        rewardRatePoolUpgrade: "0xd688d8322b99ee852e9543cc64bb9627e5dbe64c04612a249bad801b77aa2c98",
        v2Checkpoint: "0xdb744328ecd1a7bf245bb135ab8c647d16f7d1e3c7142f918e69703e185524fa",
    },
};

function readArtifact(name) {
    const file = path.join(repoRoot, "artifacts", "contracts", `${name}.sol`, `${name}.json`);
    if (!fs.existsSync(file)) throw new Error(`Missing ${name} artifact; run hardhat compile first`);
    const artifact = JSON.parse(fs.readFileSync(file, "utf8"));
    return { abi: artifact.abi, bytecode: artifact.bytecode };
}

function bundle() {
    return {
        config,
        artifacts: {
            ServiceNodeRewards: readArtifact("ServiceNodeRewards"),
            RewardRatePool: readArtifact("RewardRatePool"),
        },
        proxyAdminAbi: [
            "function owner() view returns (address)",
            "function upgradeAndCall(address proxy,address implementation,bytes data) payable",
        ],
        tokenAbi: ["function balanceOf(address) view returns (uint256)"],
    };
}

function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body, null, 2));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 1_000_000) reject(new Error("Report is too large"));
        });
        req.on("end", () => resolve(body));
        req.on("error", reject);
    });
}

function saveReport(report) {
    if (report.chainId !== config.chainId || report.proxies?.serviceNodeRewards !== config.serviceNodeRewards ||
        report.proxies?.rewardRatePool !== config.rewardRatePool || report.status !== "verified") {
        throw new Error("Refusing malformed production upgrade report");
    }
    const dir = path.join(repoRoot, "deployments");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "production-reward-emission-v2.latest.json");
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
    return file;
}

const page = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>XPoint Reward Emission Upgrade</title>
  <style>
    :root { color-scheme: dark; --bg:#0b0d10; --surface:#14181d; --line:#303740; --text:#f3f5f7; --muted:#aab2bc; --green:#36c98f; --amber:#f4b942; --red:#f06b72; --blue:#5fa8ff; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font:14px/1.45 Inter,system-ui,sans-serif; }
    main { width:min(1040px,calc(100% - 32px)); margin:0 auto; padding:28px 0 48px; }
    header { display:flex; justify-content:space-between; gap:24px; align-items:flex-start; border-bottom:1px solid var(--line); padding-bottom:20px; }
    h1 { margin:0; font-size:28px; letter-spacing:0; }
    h2 { margin:0 0 14px; font-size:16px; letter-spacing:0; }
    p { margin:6px 0 0; color:var(--muted); }
    section { padding:20px 0; border-bottom:1px solid var(--line); }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
    .rows { display:grid; gap:9px; }
    .row { display:grid; grid-template-columns:150px minmax(0,1fr); gap:12px; }
    .label { color:var(--muted); }
    code { color:#cfe3ff; overflow-wrap:anywhere; font-size:12px; }
    a { color:var(--blue); }
    .status { display:inline-flex; align-items:center; gap:8px; color:var(--muted); white-space:nowrap; }
    .dot { width:9px; height:9px; border-radius:50%; background:var(--amber); }
    .status.ok .dot { background:var(--green); } .status.bad .dot { background:var(--red); }
    button { border:1px solid transparent; border-radius:6px; padding:10px 14px; background:var(--blue); color:#06111e; font-weight:700; cursor:pointer; }
    button.secondary { background:transparent; border-color:var(--line); color:var(--text); }
    button:disabled { opacity:.4; cursor:not-allowed; }
    .actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:14px; }
    .checks { display:grid; gap:10px; margin-top:14px; }
    label { display:flex; gap:9px; align-items:flex-start; }
    ol { list-style:none; margin:0; padding:0; display:grid; gap:8px; }
    li { display:grid; grid-template-columns:28px 1fr auto; gap:10px; align-items:center; border:1px solid var(--line); border-radius:6px; padding:10px; }
    .n { width:24px; height:24px; border-radius:50%; display:grid; place-items:center; background:#242b33; color:var(--muted); }
    li.done .n { background:#164b3a; color:#baf3dd; } li.failed { border-color:var(--red); }
    small { display:block; color:var(--muted); overflow-wrap:anywhere; }
    pre { margin:0; max-height:320px; overflow:auto; background:#090b0e; border:1px solid var(--line); border-radius:6px; padding:12px; color:#cfe3ff; }
    @media(max-width:760px){ header,.grid{display:block}.status{margin-top:12px}.grid>div+div{margin-top:20px}.row{grid-template-columns:1fr;gap:2px} }
  </style>
</head>
<body><main>
  <header><div><h1>Reward Emission V2</h1><p>Production upgrade on Arbitrum One</p></div><span id="status" class="status"><span class="dot"></span><span>Not connected</span></span></header>
  <section class="grid"><div><h2>Contracts</h2><div id="contracts" class="rows"></div></div><div><h2>Wallet</h2><div id="wallet" class="rows"></div><div class="actions"><button id="connect">Connect MetaMask</button><button id="switch" class="secondary">Switch network</button></div></div></section>
  <section><h2>Preflight</h2><div id="preflight" class="rows"><span class="label">Not run</span></div><div class="actions"><button id="check" class="secondary" disabled>Run preflight</button></div></section>
  <section><h2>Approval</h2><div class="checks"><label><input id="confirmUat" type="checkbox">UAT upgrade and V2 checkpoint evidence reviewed.</label><label><input id="confirmFive" type="checkbox">I expect five MetaMask transactions: two deployments, two proxy upgrades, one legacy checkpoint.</label><label><input id="confirmOwner" type="checkbox">The connected account is the production owner shown above.</label></div><div class="actions"><button id="upgrade" disabled>Execute production upgrade</button></div></section>
  <section><h2>Transactions</h2><ol id="steps"></ol></section>
  <section><h2>Verification report</h2><pre id="report">{}</pre></section>
</main><script src="/vendor/ethers.umd.min.js"></script><script>
const el=(id)=>document.getElementById(id);
const state={bundle:null,provider:null,signer:null,account:"",chainId:0,preflight:null,running:false,txs:{},deployments:{},report:null};
const steps=[["deployService","Deploy ServiceNodeRewards V2"],["deployPool","Deploy RewardRatePool V2"],["upgradeService","Upgrade ServiceNodeRewards + initializeV2"],["checkpoint","Checkpoint legacy reward accrual"],["upgradePool","Upgrade RewardRatePool + initializeV2"],["verify","Verify state and save report"]];
const row=(a,b)=>'<div class="row"><span class="label">'+a+'</span><span>'+b+'</span></div>';
const link=(type,value)=>'<a target="_blank" href="'+state.bundle.config.explorerUrl+'/'+type+'/'+value+'"><code>'+value+'</code></a>';
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
function setStatus(kind,text){el("status").className="status "+kind;el("status").lastElementChild.textContent=text;}
function renderContracts(){const c=state.bundle.config;el("contracts").innerHTML=[row("ServiceNodeRewards",link("address",c.serviceNodeRewards)),row("RewardRatePool",link("address",c.rewardRatePool)),row("Expected owner","<code>"+c.owner+"</code>"),row("Formula","min(14% pool, 30% active stake)")].join("");}
function renderWallet(){el("wallet").innerHTML=[row("Account",state.account?"<code>"+state.account+"</code>":"Not connected"),row("Chain",state.chainId||"Not connected")].join("");if(!state.account)setStatus("","Not connected");else if(state.chainId!==state.bundle.config.chainId)setStatus("bad","Wrong network");else if(!same(state.account,state.bundle.config.owner))setStatus("bad","Wrong owner wallet");else setStatus("ok","Owner wallet connected");updateButtons();}
function renderSteps(active,failed){el("steps").innerHTML=steps.map(([key,title],i)=>{const done=state.txs[key]||key==="verify"&&state.report;const meta=state.txs[key]?'<small>'+link("tx",state.txs[key])+"</small>":state.deployments[key]?'<small>'+link("address",state.deployments[key])+"</small>":active===key?"<small>Waiting for wallet and confirmation...</small>":"";return '<li class="'+(done?"done ":"")+(failed===key?"failed":"")+'"><span class="n">'+(i+1)+'</span><span><strong>'+title+'</strong>'+meta+'</span><span>'+(done?"OK":active===key?"...":"")+'</span></li>';}).join("");}
function updateButtons(){const ready=state.account&&state.chainId===state.bundle.config.chainId&&same(state.account,state.bundle.config.owner)&&state.preflight&&el("confirmUat").checked&&el("confirmFive").checked&&el("confirmOwner").checked&&!state.running;el("check").disabled=!state.account||state.chainId!==state.bundle.config.chainId||state.running;el("upgrade").disabled=!ready;}
async function connect(){if(!window.ethereum)throw new Error("MetaMask not found");state.provider=new ethers.BrowserProvider(window.ethereum);await state.provider.send("eth_requestAccounts",[]);state.signer=await state.provider.getSigner();state.account=await state.signer.getAddress();state.chainId=Number((await state.provider.getNetwork()).chainId);state.preflight=null;renderWallet();}
async function switchNetwork(){await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:state.bundle.config.chainHex}]});await connect();}
async function proxySlot(proxy,name){const slot=ethers.toBeHex(BigInt(ethers.id("eip1967.proxy."+name))-1n,32);const value=await state.provider.getStorage(proxy,slot);return ethers.getAddress("0x"+value.slice(-40));}
async function deriveStake(rewards){const [ids]=await rewards.allServiceNodeIDs();let total=0n;for(const id of ids)total+=(await rewards.serviceNodes(id)).deposit;return {ids:ids.map(String),total};}
async function runPreflight(){const c=state.bundle.config;if(!same(state.account,c.owner))throw new Error("Connected wallet is not the production owner");const rewards=new ethers.Contract(c.serviceNodeRewards,state.bundle.artifacts.ServiceNodeRewards.abi,state.provider);const pool=new ethers.Contract(c.rewardRatePool,state.bundle.artifacts.RewardRatePool.abi,state.provider);const serviceAdmin=await proxySlot(c.serviceNodeRewards,"admin");const poolAdmin=await proxySlot(c.rewardRatePool,"admin");const serviceImpl=await proxySlot(c.serviceNodeRewards,"implementation");const poolImpl=await proxySlot(c.rewardRatePool,"implementation");const serviceAdminContract=new ethers.Contract(serviceAdmin,state.bundle.proxyAdminAbi,state.provider);const poolAdminContract=new ethers.Contract(poolAdmin,state.bundle.proxyAdminAbi,state.provider);const stake=await deriveStake(rewards);const checks={serviceImplementation:same(serviceImpl,c.expected.serviceNodeRewardsImplementation),poolImplementation:same(poolImpl,c.expected.rewardRatePoolImplementation),serviceAdmin:same(serviceAdmin,c.expected.serviceNodeRewardsProxyAdmin),poolAdmin:same(poolAdmin,c.expected.rewardRatePoolProxyAdmin),serviceAdminOwner:same(await serviceAdminContract.owner(),c.owner),poolAdminOwner:same(await poolAdminContract.owner(),c.owner),serviceOwner:same(await rewards.owner(),c.owner),poolOwner:same(await pool.owner(),c.owner),foundationPool:same(await rewards.foundationPool(),c.rewardRatePool),beneficiary:same(await pool.beneficiary(),c.serviceNodeRewards),sameToken:same(await rewards.designatedToken(),await pool.XPNT()),versionOne:(await rewards.VERSION())===1n&&(await pool.VERSION())===1n};if(Object.values(checks).some(v=>!v))throw new Error("Production state differs from the reviewed snapshot: "+JSON.stringify(checks));state.preflight={checkedAt:new Date().toISOString(),serviceAdmin,poolAdmin,serviceImpl,poolImpl,totalNodes:(await rewards.totalNodes()).toString(),derivedActiveStake:stake.total.toString(),nodeIds:stake.ids,checks};el("preflight").innerHTML=[row("Result","<span style='color:var(--green)'>All checks passed</span>"),row("Current versions","1 / 1"),row("Total nodes",state.preflight.totalNodes),row("Derived active stake",state.preflight.derivedActiveStake),row("Service ProxyAdmin","<code>"+serviceAdmin+"</code>"),row("Pool ProxyAdmin","<code>"+poolAdmin+"</code>")].join("");updateButtons();return state.preflight;}
async function deploy(key,name){if(state.deployments[key])return state.deployments[key];renderSteps(key);const a=state.bundle.artifacts[name];const contract=await new ethers.ContractFactory(a.abi,a.bytecode,state.signer).deploy();const tx=contract.deploymentTransaction();const receipt=await tx.wait(1);state.txs[key]=receipt.hash;state.deployments[key]=await contract.getAddress();renderSteps();return state.deployments[key];}
async function send(key,txFactory){if(state.txs[key])return;renderSteps(key);const tx=await txFactory();const receipt=await tx.wait(1);if(receipt.status!==1)throw new Error(key+" reverted");state.txs[key]=receipt.hash;renderSteps();return receipt;}
async function execute(){state.running=true;updateButtons();let active="";try{if(!state.preflight)await runPreflight();const c=state.bundle.config;active="deployService";const serviceImpl=await deploy(active,"ServiceNodeRewards");active="deployPool";const poolImpl=await deploy(active,"RewardRatePool");const serviceIface=new ethers.Interface(state.bundle.artifacts.ServiceNodeRewards.abi);const poolIface=new ethers.Interface(state.bundle.artifacts.RewardRatePool.abi);const serviceAdmin=new ethers.Contract(state.preflight.serviceAdmin,state.bundle.proxyAdminAbi,state.signer);const poolAdmin=new ethers.Contract(state.preflight.poolAdmin,state.bundle.proxyAdminAbi,state.signer);active="upgradeService";await send(active,()=>serviceAdmin.upgradeAndCall(c.serviceNodeRewards,serviceImpl,serviceIface.encodeFunctionData("initializeV2")));const pool=new ethers.Contract(c.rewardRatePool,state.bundle.artifacts.RewardRatePool.abi,state.signer);active="checkpoint";await send(active,()=>pool.checkpoint());active="upgradePool";await send(active,()=>poolAdmin.upgradeAndCall(c.rewardRatePool,poolImpl,poolIface.encodeFunctionData("initializeV2",[c.serviceNodeRewards])));active="verify";const rewards=new ethers.Contract(c.serviceNodeRewards,state.bundle.artifacts.ServiceNodeRewards.abi,state.provider);const upgradedPool=new ethers.Contract(c.rewardRatePool,state.bundle.artifacts.RewardRatePool.abi,state.provider);const token=new ethers.Contract(await upgradedPool.XPNT(),state.bundle.tokenAbi,state.provider);const stake=await deriveStake(rewards);const balance=await token.balanceOf(c.rewardRatePool);const poolAnnual=balance*140n/1000n;const stakeAnnual=stake.total*300n/1000n;const annual=poolAnnual<stakeAnnual?poolAnnual:stakeAnnual;const poolRate=balance*140n*120n/(1000n*31536000n);const stakeRate=stake.total*300n*120n/(1000n*31536000n);const rate=poolRate<stakeRate?poolRate:stakeRate;const verification={serviceVersion:(await rewards.VERSION()).toString(),poolVersion:(await upgradedPool.VERSION()).toString(),activeStake:(await rewards.totalActiveStake()).toString(),provider:await upgradedPool.activeStakeProvider(),annualEmission:(await upgradedPool.annualEmission()).toString(),rewardRate:(await upgradedPool.rewardRate()).toString(),serviceImplementation:await proxySlot(c.serviceNodeRewards,"implementation"),poolImplementation:await proxySlot(c.rewardRatePool,"implementation")};if(verification.serviceVersion!=="2"||verification.poolVersion!=="2"||verification.activeStake!==stake.total.toString()||!same(verification.provider,c.serviceNodeRewards)||verification.annualEmission!==annual.toString()||verification.rewardRate!==rate.toString()||!same(verification.serviceImplementation,serviceImpl)||!same(verification.poolImplementation,poolImpl))throw new Error("Post-upgrade verification failed: "+JSON.stringify(verification));state.report={status:"verified",timestamp:new Date().toISOString(),chainId:c.chainId,owner:state.account,formula:{poolRateTenthsPercent:140,activeStakeRateTenthsPercent:300},proxies:{serviceNodeRewards:c.serviceNodeRewards,rewardRatePool:c.rewardRatePool},proxyAdmins:{serviceNodeRewards:state.preflight.serviceAdmin,rewardRatePool:state.preflight.poolAdmin},implementations:{serviceNodeRewards:serviceImpl,rewardRatePool:poolImpl},transactions:state.txs,preflight:state.preflight,verification,uatEvidence:c.uatEvidence};const response=await fetch("/api/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(state.report)});if(!response.ok)throw new Error(await response.text());el("report").textContent=JSON.stringify(state.report,null,2);renderSteps();setStatus("ok","Upgrade verified");}catch(err){console.error(err);renderSteps("",active);alert(err.shortMessage||err.message||String(err));}finally{state.running=false;updateButtons();}}
async function init(){state.bundle=await fetch("/api/bundle").then(r=>r.json());renderContracts();renderWallet();renderSteps();el("connect").onclick=()=>connect().catch(e=>alert(e.message));el("switch").onclick=()=>switchNetwork().catch(e=>alert(e.message));el("check").onclick=()=>runPreflight().catch(e=>alert(e.message));el("upgrade").onclick=execute;["confirmUat","confirmFive","confirmOwner"].forEach(id=>el(id).onchange=updateButtons);if(window.ethereum){window.ethereum.on("accountsChanged",()=>connect());window.ethereum.on("chainChanged",()=>connect());}}
init().catch(e=>alert(e.message));
</script></body></html>`;

const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url);
    try {
        if (req.method === "GET" && parsed.pathname === "/") {
            res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
            res.end(page);
        } else if (req.method === "GET" && parsed.pathname === "/api/bundle") {
            json(res, 200, bundle());
        } else if (req.method === "GET" && parsed.pathname === "/vendor/ethers.umd.min.js") {
            const file = path.join(repoRoot, "node_modules", "ethers", "dist", "ethers.umd.min.js");
            res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
            fs.createReadStream(file).pipe(res);
        } else if (req.method === "POST" && parsed.pathname === "/api/report") {
            const report = JSON.parse(await readBody(req));
            json(res, 200, { ok: true, file: saveReport(report) });
        } else {
            res.writeHead(404).end("Not found");
        }
    } catch (error) {
        res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        res.end(error.stack || error.message);
    }
});

server.listen(port, host, () => {
    console.log(`MetaMask reward emission upgrade wizard: http://${host}:${port}/`);
    console.log(`Network: ${config.chainName} (${config.chainId})`);
    console.log(`Owner: ${config.owner}`);
});
