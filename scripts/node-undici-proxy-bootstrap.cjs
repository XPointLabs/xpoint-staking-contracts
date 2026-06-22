"use strict";

// Hardhat/ethers use undici for outbound RPC traffic in this repo, and Node on
// Windows does not automatically inherit the Windows system proxy settings.
// This bootstrap makes undici route all requests through the configured proxy.

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;

if (!proxyUrl) {
  return;
}

const hardhatPath = require.resolve("hardhat");
const undici = require(require.resolve("undici", { paths: [hardhatPath] }));

if (!undici.ProxyAgent || !undici.setGlobalDispatcher) {
  throw new Error("undici ProxyAgent support is not available in this environment");
}

undici.setGlobalDispatcher(new undici.ProxyAgent(proxyUrl));