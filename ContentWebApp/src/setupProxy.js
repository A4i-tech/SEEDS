const { createProxyMiddleware } = require("http-proxy-middleware");

const BACKEND = process.env.REACT_APP_BACKEND_ORIGIN || "http://localhost:8000";

module.exports = function (app) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: BACKEND,
      changeOrigin: true,
      pathRewrite: { "^/api": "" },
      logLevel: "warn",
    })
  );

  app.use(
    ["/translations", "/languages"],
    createProxyMiddleware({
      target: BACKEND,
      changeOrigin: true,
      logLevel: "warn",
    })
  );
};
