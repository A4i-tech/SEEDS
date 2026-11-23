describe("appConfig", () => {
  afterEach(() => {
    window.__ENV__ = {
      REACT_APP_API_BASE_URL: "http://localhost:3001",
      REACT_APP_STORAGE_ACCOUNT_NAME: "testaccount",
    };
    jest.resetModules();
  });

  it("throws naming the key when env.js lacks a required key", () => {
    window.__ENV__ = { REACT_APP_STORAGE_ACCOUNT_NAME: "acct" };
    expect(() => require("../../src/config/appConfig")).toThrow(
      "Missing REACT_APP_API_BASE_URL in /env.js"
    );
  });

  it("exports the values from env.js", () => {
    const { APP_CONFIG } = require("../../src/config/appConfig");
    expect(APP_CONFIG).toEqual({
      BASE_URL: "http://localhost:3001",
      STORAGE_ACCOUNT_NAME: "testaccount",
    });
  });
});
