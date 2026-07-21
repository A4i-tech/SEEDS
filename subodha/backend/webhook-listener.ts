"use strict";
// Tiny local webhook receiver for testing Subodha sync webhooks.
// Run: npx tsx webhook-listener.ts
// Then use http://localhost:<PORT>/subodha-hook (or any path) as "webhookUrl"
// in your POST /sync request to the Subodha server.

import http from "http";

const PORT = parseInt(process.env.WEBHOOK_LISTENER_PORT || "5005", 10);

const server = http.createServer((req, res) => {
  if (req.method !== "POST") {
    res.writeHead(404, { "Content-Type": "application/json" });
    return void res.end(JSON.stringify({ error: "Only POST is supported" }));
  }

  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });

  req.on("end", () => {
    const ts = new Date().toISOString();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(body);
    } catch (err) {
      console.log(`[webhook] ${ts} ${req.url} <non-JSON body>`, body);
      res.writeHead(200, { "Content-Type": "application/json" });
      return void res.end(JSON.stringify({ received: true }));
    }

    const { event, jobId } = parsed || {};
    console.log(`\n[webhook] ${ts} ${req.url}`);
    console.log(`  event : ${event || "(unknown)"}`);
    console.log(`  jobId : ${jobId || "(none)"}`);
    console.log(`  body  : ${JSON.stringify(parsed, null, 2)}`);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ received: true }));
  });

  req.on("error", (err) => {
    console.error("[webhook] request error:", err.message);
  });
});

server.on("error", (err) => {
  console.error("[webhook] server error:", err.message);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Webhook listener running on http://localhost:${PORT}`);
  console.log(`Use this as "webhookUrl" in your POST /sync body, e.g.:`);
  console.log(`  http://localhost:${PORT}/subodha-hook`);
});
