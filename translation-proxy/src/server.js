"use strict";

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");

const PORT = process.env.PORT || 4000;
const SOURCE_APP_BASE = process.env.SOURCE_APP_BASE || "http://localhost:3000";
const SITE_ID = process.env.SITE_ID || "";

const SITE_DIR = path.join(__dirname, "..", "public", "site");

function buildSnippet() {
  return (
    `<script src="${SOURCE_APP_BASE}/sdk.js" ` +
    `data-site-id="${SITE_ID}" ` +
    `data-api-base="${SOURCE_APP_BASE}" defer></script>`
  );
}

function injectSdk(html) {
  const snippet = buildSnippet();
  return html.includes("</body>")
    ? html.replace("</body>", `${snippet}\n</body>`)
    : html + snippet;
}

const app = express();

app.use(express.static(SITE_DIR, { index: false, extensions: [] }));

app.get("*", (req, res) => {
  const file = path.join(SITE_DIR, "index.html");
  fs.readFile(file, "utf8", (err, html) => {
    if (err) {
      res.status(500).send("Target site not found");
      return;
    }
    res.type("html").send(injectSdk(html));
  });
});

app.listen(PORT, () => {
  console.log(
    `TARGET customer website on http://localhost:${PORT} — SDK injected from ${SOURCE_APP_BASE} (siteId=${SITE_ID || "unset"})`
  );
});
