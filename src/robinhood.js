// Robinhood Chain tools on top of the TypeAI API, plus the swap requests the local
// signing page works through (they live in memory, on the user's machine)
const crypto = require("crypto");
const { api } = require("./http");
const { CHAIN } = require("./config");

const path = encodeURIComponent;

// ---------- research ----------

const listTokens = (list) => api.get("/tokens", { list });
const tokenInfo = (token) => api.get(`/tokens/${path(token)}`);
const tokenSafety = (token) => api.get(`/tokens/${path(token)}/safety`);
const walletBalance = (address, token) => api.get(`/wallets/${path(address)}`, { token });
const quoteSwap = (token, amountEth, slippagePercent) =>
  api.get("/quote", { token, amountEth, slippagePercent });

// ---------- signing requests ----------

const requests = new Map();
const REQUEST_TTL_MS = 30 * 60_000;

const createSwapRequest = async (token, amountEth, slippagePercent) => {
  const quote = await quoteSwap(token, amountEth, slippagePercent);
  if (!quote.canSwap) {
    throw new Error(
      `Refusing to prepare this swap: ${quote.token.symbol} is flagged as a honeypot (${quote.safety.warnings.join("; ")})`
    );
  }
  const id = crypto.randomBytes(6).toString("hex");
  requests.set(id, {
    id,
    createdAt: Date.now(),
    status: "awaiting_wallet",
    amountEth: quote.amountEth,
    slippageBps: quote.slippageBps,
    token: quote.token,
    safety: quote.safety,
    estimate: { receive: quote.receive, receiveUsd: quote.receiveUsd, gasUsd: quote.gasUsd },
  });
  return { id, quote };
};

const getRequest = (id) => {
  const request = requests.get(id);
  if (!request || Date.now() - request.createdAt > REQUEST_TTL_MS) {
    throw new Error("This swap request has expired or doesn't exist. Ask Claude to prepare it again.");
  }
  return request;
};

// called by the signing page once the wallet is connected: a fresh, simulated transaction for that wallet
const buildSwapTransaction = async (id, wallet) => {
  const request = getRequest(id);
  const built = await api.post("/swap", {
    token: request.token.address,
    amountEth: request.amountEth,
    slippageBps: request.slippageBps,
    wallet,
  });
  Object.assign(request, { status: "awaiting_signature", wallet: built.tx.from });
  return built;
};

const markSubmitted = (id, txHash) => {
  const request = getRequest(id);
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) throw new Error("Invalid transaction hash");
  Object.assign(request, { status: "submitted", txHash });
  return { ok: true };
};

const swapStatus = async (id) => {
  const request = getRequest(id);
  if (request.txHash && request.status === "submitted") {
    const { status } = await api.get(`/transactions/${request.txHash}`);
    if (status !== "pending") request.status = status;
  }
  return {
    id,
    status: request.status,
    token: request.token.symbol,
    pay: `${request.amountEth} ETH`,
    estimatedReceive: request.estimate.receive,
    wallet: request.wallet ?? null,
    txHash: request.txHash ?? null,
    explorer: request.txHash ? `${CHAIN.explorerUrl}/tx/${request.txHash}` : null,
  };
};

const publicRequest = (id) => {
  const r = getRequest(id);
  return {
    id: r.id,
    status: r.status,
    chain: CHAIN,
    pay: `${r.amountEth} ETH`,
    token: r.token,
    estimate: r.estimate,
    safety: r.safety,
    slippagePercent: r.slippageBps / 100,
    txHash: r.txHash ?? null,
  };
};

module.exports = {
  listTokens,
  tokenInfo,
  tokenSafety,
  walletBalance,
  quoteSwap,
  createSwapRequest,
  buildSwapTransaction,
  markSubmitted,
  swapStatus,
  publicRequest,
};
