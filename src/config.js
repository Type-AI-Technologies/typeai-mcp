// The TypeAI API serves every tool; the chain details are for the signing page and links
const DEFAULT_API_URL = "https://api.typeai.live/api/mcp/v1";

const API_URL = (process.env.TYPEAI_API_URL || DEFAULT_API_URL).replace(/\/+$/, "");

const CHAIN = {
  id: 4663,
  name: "Robinhood Chain",
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com",
  explorerUrl: "https://robinhoodchain.blockscout.com",
};

module.exports = { API_URL, CHAIN };
