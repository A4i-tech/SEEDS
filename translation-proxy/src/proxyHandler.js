"use strict";

const INJECT_TAG = '<script src="/__translate/sdk.js" defer></script></body>';

// Headers we must not forward verbatim: hop-by-hop, or ones that would
// mismatch the (possibly rewritten) body we send back.
const STRIPPED_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
]);

function buildOriginRequestHeaders(req, originUrl) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (["host", "connection", "content-length"].includes(name.toLowerCase())) continue;
    if (Array.isArray(value)) {
      headers.set(name, value.join(", "));
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  headers.set("host", new URL(originUrl).host);
  return headers;
}

function createProxyHandler(originUrl) {
  return async function proxyHandler(req, res) {
    const targetUrl = new URL(req.originalUrl, originUrl).toString();

    let originResponse;
    try {
      originResponse = await fetch(targetUrl, {
        method: req.method,
        headers: buildOriginRequestHeaders(req, originUrl),
        body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
        redirect: "manual",
        duplex: req.method === "GET" || req.method === "HEAD" ? undefined : "half",
      });
    } catch (err) {
      res.status(502).json({ error: "Failed to reach origin", detail: err.message });
      return;
    }

    res.status(originResponse.status);
    originResponse.headers.forEach((value, name) => {
      if (STRIPPED_RESPONSE_HEADERS.has(name.toLowerCase())) return;
      res.setHeader(name, value);
    });

    const contentType = originResponse.headers.get("content-type") || "";

    if (contentType.includes("text/html")) {
      const body = await originResponse.text();
      const injected = body.includes("</body>")
        ? body.replace("</body>", INJECT_TAG)
        : body + INJECT_TAG;
      res.send(injected);
      return;
    }

    if (!originResponse.body) {
      res.end();
      return;
    }

    const reader = originResponse.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  };
}

module.exports = { createProxyHandler };
