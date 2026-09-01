/**
 * CRA dev-server proxy (Source application, localhost:3000).
 *
 * Issue #436 architecture: the browser must talk ONLY to the Source origin
 * (localhost:3000). FastAPI stays the implementation on localhost:8000; this
 * proxy fronts it at 3000 so no client ever calls 8000 directly.
 *
 * Two proxied surfaces:
 *
 *   1. Admin UI API  ->  everything under "/api/*" (relative base set via
 *      REACT_APP_API_BASE_URL=/api). The "/api" prefix is stripped before
 *      forwarding, so /api/content -> :8000/content, /api/tenant/login ->
 *      :8000/tenant/login, etc. Using a dedicated prefix avoids colliding with
 *      the SPA's own client routes (/content, /ivr, ...), which must keep being
 *      served by the React dev server.
 *
 *   2. Localization SDK API  ->  bare "/translations" and "/languages". The SDK
 *      (hosted at 3000/sdk.js, injected into the Target site on :4000) is
 *      configured with data-api-base=http://localhost:3000 and calls these
 *      paths directly; they are forwarded unchanged to :8000.
 *
 * CRA auto-loads this file when running `react-scripts start`.
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

const BACKEND = process.env.REACT_APP_BACKEND_ORIGIN || "http://localhost:8000";

module.exports = function (app) {
  // 1. Admin UI API surface, under the /api prefix (prefix stripped on forward).
  app.use(
    "/api",
    createProxyMiddleware({
      target: BACKEND,
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
      logLevel: "warn",
    })
  );

  // 2. Localization SDK API surface (paths preserved, e.g. /translations -> :8000/translations).
  app.use(
    ["/translations", "/languages"],
    createProxyMiddleware({
      target: BACKEND,
      changeOrigin: true,
      logLevel: "warn",
    })
  );
};
