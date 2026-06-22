const patchedProviders = new WeakSet();

function normalizeEmptyTo(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeEmptyTo);
  }

  if (value && typeof value === "object") {
    const result = {};
    for (const [key, innerValue] of Object.entries(value)) {
      result[key] = normalizeEmptyTo(innerValue);
    }

    if (Object.prototype.hasOwnProperty.call(result, "to") && result.to === "") {
      result.to = null;
    }

    return result;
  }

  return value;
}

function patchRpcEmptyTo(hre) {
  const provider = hre.network.provider;
  if (!provider || patchedProviders.has(provider)) {
    return;
  }

  if (typeof provider.send === "function") {
    const originalSend = provider.send.bind(provider);
    provider.send = async (...args) => {
      const result = await originalSend(...args);
      return normalizeEmptyTo(result);
    };
  }

  if (typeof provider.request === "function") {
    const originalRequest = provider.request.bind(provider);
    provider.request = async (...args) => {
      const result = await originalRequest(...args);
      return normalizeEmptyTo(result);
    };
  }

  patchedProviders.add(provider);
}

module.exports = { patchRpcEmptyTo };