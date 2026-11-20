describe("Constants", () => {
  afterEach(() => {
    window.__ENV__ = {
      REACT_APP_API_BASE_URL: "http://localhost:4000",
      REACT_APP_STORAGE_ACCOUNT_NAME: "",
    };
    jest.resetModules();
  });

  it("throws naming the key when env.js lacks a required key", () => {
    window.__ENV__ = { REACT_APP_API_BASE_URL: "http://localhost:4000" };
    expect(() => require("../src/Constants")).toThrow(
      "Missing REACT_APP_STORAGE_ACCOUNT_NAME in /env.js"
    );
  });

  it("exports the values from env.js", () => {
    window.__ENV__ = {
      REACT_APP_API_BASE_URL: "http://api.test",
      REACT_APP_STORAGE_ACCOUNT_NAME: "acct",
    };
    const { SEEDS_URL, AUDIO_BASE_URL } = require("../src/Constants");
    expect(SEEDS_URL).toBe("http://api.test");
    expect(AUDIO_BASE_URL).toBe("https://acct.blob.core.windows.net/output-original");
  });
});
