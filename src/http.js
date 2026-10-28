// Client for the TypeAI API: JSON in and out, a timeout, and the API's own error message
const { API_URL } = require("./config");
const { version } = require("../package.json");

const request = async (path, { method = "GET", params, body, timeoutMs = 45_000 } = {}) => {
  const url = new URL(`${API_URL}${path}`);
  Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .forEach(([key, value]) => url.searchParams.set(key, String(value)));

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        "User-Agent": `typeai-mcp/${version}`,
        ...(body && { "Content-Type": "application/json" }),
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new Error(`Couldn't reach TypeAI (${error.cause?.code || error.message}). Please try again.`);
  }

  const data = await response.json().catch(() => null);
  if (response.status === 429) throw new Error("Too many requests to TypeAI, please wait a minute and try again.");
  if (!response.ok) throw new Error(data?.error || `TypeAI answered with status ${response.status}`);
  return data;
};

const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: "POST", body }),
};

module.exports = { api };
