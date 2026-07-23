"use strict";

require("dotenv").config();
const path = require("path");
const express = require("express");
const translationRoutes = require("./routes/translationRoutes");
const { createProxyHandler } = require("./proxyHandler");

const PORT = process.env.PORT || 4000;
const ORIGIN_URL = process.env.ORIGIN_URL;

if (!ORIGIN_URL) {
  console.error("ORIGIN_URL env var is required (the content-webapp-service URL to proxy).");
  process.exit(1);
}

const app = express();

// JSON body parsing only for our own API — the catch-all proxy route below
// needs the raw request stream untouched so it can pipe it to the origin.
app.use("/api/translations", express.json(), translationRoutes);

app.use("/__translate", express.static(path.join(__dirname, "..", "public")));

app.use(createProxyHandler(ORIGIN_URL));

app.listen(PORT, () => {
  console.log(`translation-proxy listening on http://localhost:${PORT} -> ${ORIGIN_URL}`);
});
