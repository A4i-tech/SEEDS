const path = require("path");

const SDK_E2E_FIXTURE = path.join(
  __dirname,
  "..",
  "e2e",
  "fixtures",
  "files",
  "e2e-sdk-test-page.html"
);

module.exports = (app) => {
  app.get("/e2e-sdk-test-page.html", (req, res) => res.sendFile(SDK_E2E_FIXTURE));
};
