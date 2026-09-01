"use strict";

/**
 * TARGET application (localhost:4000) — Issue #436 architecture.
 *
 * This represents a real CUSTOMER WEBSITE. It contains NO admin functionality
 * and NO translation APIs. Its only job is to serve the customer's site and
 * auto-inject the localization SDK snippet, exactly like a Weglot/Localize.js
 * customer would embed a one-line script.
 *
 * The injected SDK is hosted by the SOURCE application (localhost:3000) and is
 * configured to send all of its requests (extract, runtime fetch, languages) to
 * the SOURCE origin. The Target never talks to the backend (:8000) directly and
 * never proxies API calls — the browser only ever contacts :3000 for anything
 * localization-related.
 *
 *   Target page (4000)  --loads-->  http://localhost:3000/sdk.js
 *   SDK in the page     --calls-->  http://localhost:3000/translations, /languages
 *   Source (3000)       --proxies-> FastAPI backend (8000)   [see ContentWebApp/src/setupProxy.js]
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");

const PORT = process.env.PORT || 4000;
// The SOURCE application origin that hosts the SDK and fronts the runtime APIs.
const SOURCE_APP_BASE = process.env.SOURCE_APP_BASE || "http://localhost:3000";
// Which site's translations this customer website belongs to (configured in the Admin UI).
const SITE_ID = process.env.SITE_ID || "";

const SITE_DIR = path.join(__dirname, "..", "public", "site");

function buildSnippet() {
  // One-line embed, loaded from the SOURCE app, pointed at the SOURCE app.
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

// Static assets of the customer site (css/images/etc.) served as-is.
// index:false so HTML page requests fall through to the injecting handler below.
app.use(express.static(SITE_DIR, { index: false, extensions: [] }));

// Serve the customer website for any page route, injecting the SDK snippet.
// A single-page customer site: every path renders index.html (SDK reads the
// route from window.location.pathname at runtime).
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
