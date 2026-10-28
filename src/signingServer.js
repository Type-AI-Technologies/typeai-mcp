// Local page where the user approves swaps in MetaMask. Claude links here;
// the page connects the wallet, fetches a fresh transaction and asks the wallet to sign.
const fs = require("fs");
const http = require("http");
const path = require("path");
const robinhood = require("./robinhood");

const HOST = "127.0.0.1";
const FIRST_PORT = Number(process.env.TYPEAI_SIGNING_PORT || 4747);
const SIGN_PAGE = path.join(__dirname, "..", "public", "sign.html");

let baseUrl = null;

const sendJson = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
};

const readJson = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });

const handle = async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const [, first, id, action] = url.pathname.split("/");

  try {
    if (req.method === "GET" && url.pathname === "/typeai.png") {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "max-age=3600" });
      return res.end(fs.readFileSync(path.join(__dirname, "..", "public", "typeai.png")));
    }
    if (req.method === "GET" && first === "sign" && id) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(fs.readFileSync(SIGN_PAGE));
    }
    if (first === "api" && id) {
      if (req.method === "GET" && !action) return sendJson(res, 200, robinhood.publicRequest(id));
      if (req.method === "POST" && action === "build") {
        const { wallet } = await readJson(req);
        return sendJson(res, 200, await robinhood.buildSwapTransaction(id, wallet));
      }
      if (req.method === "POST" && action === "submitted") {
        const { txHash } = await readJson(req);
        return sendJson(res, 200, robinhood.markSubmitted(id, txHash));
      }
      if (req.method === "GET" && action === "status") {
        return sendJson(res, 200, await robinhood.swapStatus(id));
      }
    }
    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    console.error("signing server:", error);
    sendJson(res, 400, { error: error.message });
  }
};

// first free port from FIRST_PORT, so a second MCP instance doesn't crash
const startSigningServer = () =>
  new Promise((resolve, reject) => {
    const tryPort = (port) => {
      const server = http.createServer(handle);
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE" && port < FIRST_PORT + 10) return tryPort(port + 1);
        reject(error);
      });
      server.listen(port, HOST, () => {
        baseUrl = `http://localhost:${port}`;
        console.error(`TypeAI signing page on ${baseUrl}`);
        resolve(baseUrl);
      });
    };
    tryPort(FIRST_PORT);
  });

const signingUrl = (id) => `${baseUrl}/sign/${id}`;

module.exports = { startSigningServer, signingUrl };
