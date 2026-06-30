#!/usr/bin/env node
const fs = require("fs");
const http = require("http");
const path = require("path");
const url = require("url");

const repoRoot = path.resolve(__dirname, "..");
const host = process.env.METAMASK_START_HOST || "127.0.0.1";
const port = Number(process.env.METAMASK_START_PORT || 28163);
const config = {
    chainId: 42161,
    chainHex: "0xa4b1",
    chainName: "Arbitrum One",
    rpcUrl: process.env.ARB_MAINNET_RPC_URL || "https://arb1.arbitrum.io/rpc",
    explorerUrl: "https://arbiscan.io",
    owner: "0x62174f6e6a25E7D8135Bd172C1053D7ABd7D2750",
    serviceNodeRewards: "0xc52284b7aBAebbEF7BdE0E1ca8251B44AeA12F5f",
    expectedImplementation: "0x5D006b3d22d063C63A0257E077fd0517E1290b84",
};
const serviceAbi = [
    "function VERSION() view returns (uint256)",
    "function owner() view returns (address)",
    "function isStarted() view returns (bool)",
    "function totalNodes() view returns (uint256)",
    "function stakingRequirement() view returns (uint256)",
    "function start()",
];

function json(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body, null, 2));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
            if (body.length > 100_000) reject(new Error("Report is too large"));
        });
        req.on("end", () => resolve(body));
        req.on("error", reject);
    });
}

function saveReport(report) {
    if (report.status !== "verified" || report.chainId !== config.chainId ||
        report.serviceNodeRewards !== config.serviceNodeRewards || report.isStarted !== true) {
        throw new Error("Refusing malformed start report");
    }
    const dir = path.join(repoRoot, "deployments");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "production-service-node-rewards-start.latest.json");
    fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
    return file;
}

const page = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Start XPoint Service Node Registration</title>
<style>
:root{color-scheme:dark;--bg:#0b0d10;--line:#303740;--text:#f3f5f7;--muted:#aab2bc;--green:#36c98f;--amber:#f4b942;--red:#f06b72;--blue:#5fa8ff}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.45 Inter,system-ui,sans-serif}main{width:min(760px,calc(100% - 32px));margin:0 auto;padding:32px 0 48px}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;border-bottom:1px solid var(--line);padding-bottom:20px}h1{font-size:26px;letter-spacing:0;margin:0}h2{font-size:16px;letter-spacing:0;margin:0 0 14px}p{color:var(--muted);margin:6px 0 0}section{padding:20px 0;border-bottom:1px solid var(--line)}.rows{display:grid;gap:9px}.row{display:grid;grid-template-columns:160px minmax(0,1fr);gap:12px}.label{color:var(--muted)}code{font-size:12px;color:#cfe3ff;overflow-wrap:anywhere}a{color:var(--blue)}.status{display:inline-flex;align-items:center;gap:8px;color:var(--muted);white-space:nowrap}.dot{width:9px;height:9px;border-radius:50%;background:var(--amber)}.ok .dot{background:var(--green)}.bad .dot{background:var(--red)}button{border:1px solid transparent;border-radius:6px;padding:10px 14px;background:var(--blue);color:#06111e;font-weight:700;cursor:pointer}button.secondary{background:transparent;border-color:var(--line);color:var(--text)}button:disabled{opacity:.4;cursor:not-allowed}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}label{display:flex;gap:9px;align-items:flex-start;margin-top:14px}.result{padding:12px;border:1px solid var(--line);border-radius:6px;margin-top:14px}pre{margin:0;background:#090b0e;border:1px solid var(--line);border-radius:6px;padding:12px;color:#cfe3ff;overflow:auto}@media(max-width:600px){header{display:block}.status{margin-top:12px}.row{grid-template-columns:1fr;gap:2px}}
</style></head><body><main>
<header><div><h1>Enable node registration</h1><p>ServiceNodeRewards.start() on Arbitrum One</p></div><span id="status" class="status"><span class="dot"></span><span>Not connected</span></span></header>
<section><h2>Target</h2><div class="rows" id="target"></div></section>
<section><h2>Wallet and preflight</h2><div class="rows" id="wallet"></div><div class="actions"><button id="connect">Connect MetaMask</button><button id="switch" class="secondary">Switch network</button><button id="check" class="secondary" disabled>Run preflight</button></div><div id="preflight" class="result">Not run</div></section>
<section><h2>Authorization</h2><label><input id="confirm" type="checkbox">I confirm that registration should be enabled permanently for the production ServiceNodeRewards contract.</label><div class="actions"><button id="start" disabled>Sign start() transaction</button></div></section>
<section><h2>Result</h2><pre id="report">{}</pre></section>
</main><script src="/vendor/ethers.umd.min.js"></script><script>
const el=id=>document.getElementById(id);const state={bundle:null,provider:null,signer:null,account:"",chainId:0,preflight:null,running:false};const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();const row=(a,b)=>'<div class="row"><span class="label">'+a+'</span><span>'+b+'</span></div>';const link=(type,value)=>'<a target="_blank" href="'+state.bundle.config.explorerUrl+'/'+type+'/'+value+'"><code>'+value+'</code></a>';
function setStatus(kind,text){el("status").className="status "+kind;el("status").lastElementChild.textContent=text}function update(){const c=state.bundle.config;el("wallet").innerHTML=[row("Account",state.account?"<code>"+state.account+"</code>":"Not connected"),row("Chain",state.chainId||"Not connected")].join("");if(!state.account)setStatus("","Not connected");else if(state.chainId!==c.chainId)setStatus("bad","Wrong network");else if(!same(state.account,c.owner))setStatus("bad","Wrong owner wallet");else setStatus("ok","Owner wallet connected");el("check").disabled=!state.account||state.chainId!==c.chainId||state.running;el("start").disabled=!(state.preflight&&state.preflight.canStart&&el("confirm").checked&&!state.running)}
async function connect(){if(!window.ethereum)throw new Error("MetaMask not found");state.provider=new ethers.BrowserProvider(window.ethereum);await state.provider.send("eth_requestAccounts",[]);state.signer=await state.provider.getSigner();state.account=await state.signer.getAddress();state.chainId=Number((await state.provider.getNetwork()).chainId);state.preflight=null;el("preflight").textContent="Not run";update()}
async function switchNetwork(){await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:state.bundle.config.chainHex}]});await connect()}
async function implementation(proxy){const slot=ethers.toBeHex(BigInt(ethers.id("eip1967.proxy.implementation"))-1n,32);const value=await state.provider.getStorage(proxy,slot);return ethers.getAddress("0x"+value.slice(-40))}
async function preflight(){const c=state.bundle.config;if(!same(state.account,c.owner))throw new Error("Connected account is not the production owner");const contract=new ethers.Contract(c.serviceNodeRewards,state.bundle.serviceAbi,state.provider);const snapshot={version:(await contract.VERSION()).toString(),owner:await contract.owner(),implementation:await implementation(c.serviceNodeRewards),isStarted:await contract.isStarted(),totalNodes:(await contract.totalNodes()).toString(),stakingRequirement:(await contract.stakingRequirement()).toString()};snapshot.canStart=snapshot.version==="2"&&same(snapshot.owner,c.owner)&&same(snapshot.implementation,c.expectedImplementation)&&snapshot.isStarted===false;if(!snapshot.canStart){if(snapshot.isStarted===true)throw new Error("ServiceNodeRewards is already started");throw new Error("Production state differs from the reviewed V2 snapshot")};state.preflight=snapshot;el("preflight").innerHTML=[row("Result","<span style='color:var(--green)'>Ready for start()</span>"),row("Version",snapshot.version),row("Implementation","<code>"+snapshot.implementation+"</code>"),row("Current nodes",snapshot.totalNodes),row("isStarted","false")].join("");update();return snapshot}
async function start(){state.running=true;update();try{await preflight();const c=state.bundle.config;const contract=new ethers.Contract(c.serviceNodeRewards,state.bundle.serviceAbi,state.signer);const tx=await contract.start();el("report").textContent=JSON.stringify({status:"pending",transaction:tx.hash},null,2);const receipt=await tx.wait(1);if(receipt.status!==1)throw new Error("start() reverted");const isStarted=await contract.isStarted();if(!isStarted)throw new Error("Postflight failed: isStarted is false");const report={status:"verified",timestamp:new Date().toISOString(),chainId:c.chainId,owner:state.account,serviceNodeRewards:c.serviceNodeRewards,implementation:await implementation(c.serviceNodeRewards),transaction:receipt.hash,blockNumber:receipt.blockNumber,isStarted,totalNodes:(await contract.totalNodes()).toString(),preflight:state.preflight};const response=await fetch("/api/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(report)});if(!response.ok)throw new Error(await response.text());el("report").textContent=JSON.stringify(report,null,2);state.preflight.canStart=false;setStatus("ok","Registration enabled")}catch(error){console.error(error);alert(error.shortMessage||error.message||String(error))}finally{state.running=false;update()}}
async function init(){state.bundle=await fetch("/api/bundle").then(r=>r.json());const c=state.bundle.config;el("target").innerHTML=[row("Network",c.chainName+" ("+c.chainId+")"),row("Contract",link("address",c.serviceNodeRewards)),row("V2 implementation",link("address",c.expectedImplementation)),row("Owner","<code>"+c.owner+"</code>")].join("");update();el("connect").onclick=()=>connect().catch(e=>alert(e.message));el("switch").onclick=()=>switchNetwork().catch(e=>alert(e.message));el("check").onclick=()=>preflight().catch(e=>alert(e.message));el("start").onclick=start;el("confirm").onchange=update;if(window.ethereum){window.ethereum.on("accountsChanged",()=>connect());window.ethereum.on("chainChanged",()=>connect())}}
init().catch(e=>alert(e.message));
</script></body></html>`;

const server = http.createServer(async (req, res) => {
    const parsed = url.parse(req.url);
    try {
        if (req.method === "GET" && parsed.pathname === "/") {
            res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
            res.end(page);
        } else if (req.method === "GET" && parsed.pathname === "/api/bundle") {
            json(res, 200, { config, serviceAbi });
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
    console.log(`MetaMask start wizard: http://${host}:${port}/`);
    console.log(`ServiceNodeRewards: ${config.serviceNodeRewards}`);
});
