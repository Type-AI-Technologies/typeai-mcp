# TypeAI MCP: Robinhood Chain for Claude

An [MCP](https://modelcontextprotocol.io) server that lets Claude (or any MCP client) research, rug-pull check and buy tokens on **Robinhood Chain**, from **your own wallet**.

- **Live market data:** trending tokens, top gainers and losers, price, market cap, liquidity, holders.
- **TypeAI rug-pull check:** a 0–100 risk score with red flags, good signs and a plain-English verdict. Honeypots are refused.
- **Non-custodial:** Claude never sees a private key. Swaps open a local page where you review a fresh quote and sign in MetaMask.
- **No account, no API key.** Powered by the [TypeAI](https://typeai.online) API.

## Try asking

> What's trending on Robinhood Chain right now?
>
> Tell me about TORCH. What's its rug-pull risk?
>
> How much TORCH would I get for 0.001 ETH?
>
> Okay, swap 0.001 ETH to TORCH.
>
> Did it go through?

## Install

Requires Node.js 18.17 or newer.

**Claude Code**

```bash
claude mcp add typeai -- npx -y typeai-mcp
```

**Claude Desktop**, **Cursor**, **Windsurf** and other MCP clients: add this to the client's MCP config (for Claude Desktop: Settings → Developer → Edit Config), then restart the client.

```json
{
  "mcpServers": {
    "typeai": {
      "command": "npx",
      "args": ["-y", "typeai-mcp"]
    }
  }
}
```

## Tools

| Tool | What it does |
|---|---|
| `robinhood_trending_tokens` | Trending tokens, top gainers or top losers (24h) |
| `robinhood_token_info` | Price, 5m/6h/24h change, market cap, liquidity, volume, holders, links |
| `robinhood_token_safety` | Rug-pull risk score and level, red flags, good signs, honeypot and taxes |
| `robinhood_wallet_balance` | ETH balance of a wallet, plus one token's balance |
| `robinhood_swap_quote` | Live quote for ETH → token, with fees, gas and slippage |
| `robinhood_prepare_swap` | Prepares the swap and returns a link where you sign it |
| `robinhood_swap_status` | Awaiting wallet, awaiting signature, submitted, confirmed or failed |

Tokens can be named by symbol, name or contract address. Look-alike scam tokens copy popular names, so Claude is told to always show you the contract address it used.

## How a swap works

1. Claude checks the token and gets a quote.
2. `robinhood_prepare_swap` returns a link like `http://localhost:4747/sign/3f9a…`. The page is served by this server, on your machine only.
3. You open it and connect MetaMask. The page adds Robinhood Chain to your wallet if needed.
4. TypeAI builds the swap for your wallet with a fresh quote and simulates it. If it would fail, you're told why before signing.
5. You review the amounts, minimum received, fees and any warnings, then confirm in MetaMask.
6. Claude follows the transaction until it's confirmed on-chain.

Nothing is sent without your confirmation in the wallet. The server only ever receives your public wallet address. Swap requests expire after 30 minutes and live in memory on your machine.

## Fees

Swaps include a **TypeAI fee of 1%** of the ETH spent, shown in every quote and on the signing page before you sign. Wallets holding the TYPE token on Ethereum pay less:

| TYPE held (share of supply) | Fee |
|---|---|
| more than 2% | 0% |
| more than 1.5% | 0.5% |
| more than 1% | 0.75% |
| more than 0.5% | 0.9% |
| otherwise | 1% |

Network gas is paid separately, as with any transaction.

## Configuration (optional)

| Variable | Default | Why change it |
|---|---|---|
| `TYPEAI_SIGNING_PORT` | `4747` | Port of the local signing page (the next free one is used if it's busy) |
| `TYPEAI_API_URL` | TypeAI's API | Only for developing against your own copy of the API |

## Limits

- Robinhood Chain only, and swaps are ETH → token.
- The TypeAI API is rate limited per IP. If Claude says TypeAI is busy, wait a minute.
- The rug-pull check is an estimate from on-chain data, not a guarantee: only trade what you can afford to lose.

## Development

```bash
git clone <this repo> && cd typeai-mcp
npm install
npm test                                              # unit tests (offline)
npx @modelcontextprotocol/inspector node src/index.js # try the tools in a browser
```

The server speaks MCP over stdio, so logs go to stderr.

## Disclaimer

This software is provided as is, without warranty. It is not financial advice. Crypto tokens, especially new ones, can lose all their value.

## License

[MIT](LICENSE) © TypeAI
