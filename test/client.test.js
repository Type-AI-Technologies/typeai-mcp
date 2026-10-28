// The MCP side against a fake TypeAI API: requests sent, errors passed on, the swap request lifecycle
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

process.env.TYPEAI_API_URL = "https://api.test/api/mcp/v1/";
const robinhood = require("../src/robinhood");

const TORCH = { address: "0x000050E18ffa3F8F7aD170Eb9CeF160eb3Ed1111", name: "Torch", symbol: "TORCH", decimals: 18 };
const WALLET = "0xba10bCdF9BD3906aB1C9d042B8d5a17aD2d7155F";
const HASH = `0x${"ab".repeat(32)}`;

let calls;
let routes;
const reply = (status, body) => ({ status, ok: status < 400, json: async () => body });

global.fetch = async (url, options = {}) => {
  const target = new URL(url);
  calls.push({ method: options.method || "GET", path: target.pathname, query: Object.fromEntries(target.searchParams), body: options.body && JSON.parse(options.body) });
  const route = routes[`${options.method || "GET"} ${target.pathname}`];
  return route ? route(target) : reply(404, { error: "not found" });
};

const quote = (overrides = {}) => ({
  pay: "0.001 ETH",
  receive: "250 TORCH",
  receiveUsd: "2.34",
  gasUsd: "0.0300",
  typeAiFee: "0.00001 ETH (1%, less for TYPE holders)",
  slippagePercent: 3,
  slippageBps: 300,
  amountEth: "0.001",
  token: TORCH,
  safety: { honeypot: false, buyTaxPercent: 2, sellTaxPercent: 0, warnings: ["Buy tax 2.0%"] },
  canSwap: true,
  ...overrides,
});

beforeEach(() => {
  calls = [];
  routes = {
    "GET /api/mcp/v1/quote": () => reply(200, quote()),
    "POST /api/mcp/v1/swap": () => reply(200, { chainId: 4663, tx: { from: WALLET, to: "0xrouter", data: "0x", value: "0x1" }, display: {} }),
    [`GET /api/mcp/v1/transactions/${HASH}`]: () => reply(200, { status: "confirmed" }),
  };
});

test("calls the API with only the parameters that were given", async () => {
  routes["GET /api/mcp/v1/wallets/" + WALLET] = () => reply(200, { eth: "1.0" });
  await robinhood.walletBalance(WALLET);
  await robinhood.quoteSwap("TORCH", 0.001);
  assert.deepEqual(calls.map(({ path, query }) => ({ path, query })), [
    { path: `/api/mcp/v1/wallets/${WALLET}`, query: {} },
    { path: "/api/mcp/v1/quote", query: { token: "TORCH", amountEth: "0.001" } },
  ]);
});

test("token names are escaped in the path", async () => {
  routes["GET /api/mcp/v1/tokens/a%2Fb/safety"] = () => reply(200, { riskScore: 1 });
  assert.deepEqual(await robinhood.tokenSafety("a/b"), { riskScore: 1 });
});

test("the API's error message reaches Claude", async () => {
  routes["GET /api/mcp/v1/quote"] = () => reply(400, { error: "amountEth must be more than 0" });
  await assert.rejects(robinhood.quoteSwap("TORCH", -1), { message: "amountEth must be more than 0" });
});

test("rate limiting is explained", async () => {
  routes["GET /api/mcp/v1/tokens"] = () => reply(429, {});
  await assert.rejects(robinhood.listTokens("trending"), /Too many requests/);
});

test("honeypots are refused before a signing link exists", async () => {
  routes["GET /api/mcp/v1/quote"] = () =>
    reply(200, quote({ canSwap: false, safety: { honeypot: true, warnings: ["Flagged as a honeypot"] } }));
  await assert.rejects(robinhood.createSwapRequest("SCAM", 0.001), /honeypot/);
});

test("a swap request goes from wallet to signature to confirmed", async () => {
  const { id } = await robinhood.createSwapRequest("TORCH", 0.001);
  assert.equal(robinhood.publicRequest(id).status, "awaiting_wallet");
  assert.equal(robinhood.publicRequest(id).chain.id, 4663);

  await robinhood.buildSwapTransaction(id, WALLET);
  assert.deepEqual(calls.at(-1).body, { token: TORCH.address, amountEth: "0.001", slippageBps: 300, wallet: WALLET });
  assert.equal((await robinhood.swapStatus(id)).status, "awaiting_signature");

  assert.throws(() => robinhood.markSubmitted(id, "0x123"), /Invalid transaction hash/);
  robinhood.markSubmitted(id, HASH);
  const status = await robinhood.swapStatus(id);
  assert.equal(status.status, "confirmed");
  assert.equal(status.explorer, `https://robinhoodchain.blockscout.com/tx/${HASH}`);
});

test("unknown swap requests get a clear error", async () => {
  await assert.rejects(robinhood.swapStatus("nope"), /expired or doesn't exist/);
});
