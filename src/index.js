#!/usr/bin/env node
// TypeAI MCP server: Robinhood Chain research, rug-pull checks and wallet-signed swaps.
// Data, safety checks and swap routes come from the TypeAI API.
// stdout carries the MCP protocol, so every log goes to stderr.
console.log = console.error;
console.info = console.error;
console.warn = console.error;

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const robinhood = require("./robinhood");
const { version } = require("../package.json");
const { startSigningServer, signingUrl } = require("./signingServer");

const INSTRUCTIONS = `TypeAI gives you live Robinhood Chain (chain id 4663) data and lets the user swap ETH for tokens from their own wallet.
- Tokens can be named by symbol, name or contract address. Look-alike tokens exist: always show the contract address you resolved.
- Before any swap, run robinhood_token_safety and robinhood_swap_quote and tell the user the rug-pull risk and any warnings (honeypot, taxes) in plain words.
- Swaps are ETH -> token only. robinhood_prepare_swap returns a link: give it to the user and explain they approve it in MetaMask on that page. You never hold keys and cannot sign.
- A swap is only done when robinhood_swap_status says "confirmed". Never claim success before that.
- If a tool says TypeAI is busy, wait a minute before retrying.
- You don't give financial advice: describe what the data shows, not whether to buy.`;

const server = new McpServer(
  { name: "typeai-robinhood", version },
  { instructions: INSTRUCTIONS }
);

const ok = (result) => ({
  content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
});
const fail = (error) => ({
  isError: true,
  content: [{ type: "text", text: error.message || String(error) }],
});
const tool = (name, config, handler) =>
  server.registerTool(name, config, async (args) => {
    try {
      return ok(await handler(args));
    } catch (error) {
      console.error(`${name} failed:`, error);
      return fail(error);
    }
  });

const tokenParam = z
  .string()
  .min(1)
  .describe("Token symbol, name or 0x contract address on Robinhood Chain, e.g. TORCH");

tool(
  "robinhood_trending_tokens",
  {
    title: "Trending tokens on Robinhood Chain",
    description:
      "Live list of trending tokens, top gainers or top losers (24h) on Robinhood Chain with price, 24h change, market cap, volume and an explorer link.",
    inputSchema: {
      list: z
        .enum(["trending", "gainers", "losers"])
        .default("trending")
        .describe("Which list to fetch"),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ list }) => robinhood.listTokens(list)
);

tool(
  "robinhood_token_info",
  {
    title: "Token details",
    description:
      "Price, 5m/6h/24h price change, market cap, liquidity, 24h volume, holders, description, website and socials for a Robinhood Chain token.",
    inputSchema: { token: tokenParam },
    annotations: { readOnlyHint: true },
  },
  async ({ token }) => robinhood.tokenInfo(token)
);

tool(
  "robinhood_token_safety",
  {
    title: "Rug-pull check",
    description:
      "TypeAI rug-pull check for a Robinhood Chain token: a 0-100 risk score and level, red flags (honeypot, taxes, unlocked liquidity, mintable supply, holder concentration...), good signs, and a plain-English verdict. Run this before any swap.",
    inputSchema: { token: tokenParam },
    annotations: { readOnlyHint: true },
  },
  async ({ token }) => robinhood.tokenSafety(token)
);

tool(
  "robinhood_wallet_balance",
  {
    title: "Wallet balance",
    description:
      "ETH balance of a wallet on Robinhood Chain, plus one token's balance if a token is given.",
    inputSchema: {
      address: z.string().regex(/^0x[a-fA-F0-9]{40}$/).describe("Wallet address (0x…)"),
      token: tokenParam.optional(),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ address, token }) => robinhood.walletBalance(address, token)
);

const swapParams = {
  token: tokenParam.describe("Token to buy with ETH"),
  amount_eth: z.number().positive().max(10).describe("Amount of ETH to spend, e.g. 0.001"),
  slippage_percent: z
    .number()
    .min(0.1)
    .max(20)
    .optional()
    .describe("Optional. Defaults to 1%, raised automatically to cover the token's buy tax"),
};

tool(
  "robinhood_swap_quote",
  {
    title: "Swap quote (ETH → token)",
    description:
      "Live quote for swapping ETH into a Robinhood Chain token: expected amount, USD values, gas, TypeAI fee, slippage and safety warnings. Doesn't create anything.",
    inputSchema: swapParams,
    annotations: { readOnlyHint: true },
  },
  async ({ token, amount_eth, slippage_percent }) => {
    const { slippageBps, amountEth, canSwap, ...quote } = await robinhood.quoteSwap(
      token,
      amount_eth,
      slippage_percent
    );
    return quote;
  }
);

tool(
  "robinhood_prepare_swap",
  {
    title: "Prepare swap for signing",
    description:
      "Prepares an ETH → token swap on Robinhood Chain and returns a local link where the user connects MetaMask, reviews a fresh quote and signs. Nothing is sent until the user confirms in their wallet. Refuses tokens flagged as honeypots.",
    inputSchema: swapParams,
  },
  async ({ token, amount_eth, slippage_percent }) => {
    const { id, quote } = await robinhood.createSwapRequest(token, amount_eth, slippage_percent);
    const { slippageBps, amountEth, canSwap, ...summary } = quote;
    return {
      request_id: id,
      signing_link: signingUrl(id),
      next_step:
        "Give the user the signing_link. They connect MetaMask there, review and confirm. Then call robinhood_swap_status with request_id.",
      ...summary,
    };
  }
);

tool(
  "robinhood_swap_status",
  {
    title: "Swap status",
    description:
      "Status of a prepared swap: awaiting_wallet, awaiting_signature, submitted, confirmed or failed, with the transaction link once sent.",
    inputSchema: { request_id: z.string().min(1).describe("request_id from robinhood_prepare_swap") },
    annotations: { readOnlyHint: true },
  },
  async ({ request_id }) => robinhood.swapStatus(request_id)
);

const main = async () => {
  await startSigningServer();
  await server.connect(new StdioServerTransport());
  console.error("TypeAI MCP server (Robinhood Chain) ready");
};

main().catch((error) => {
  console.error("TypeAI MCP server failed to start:", error);
  process.exit(1);
});
