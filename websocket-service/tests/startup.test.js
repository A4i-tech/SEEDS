// Only the blob package is blocked. Other Azure packages stay available.
jest.mock(
  "@azure/storage-blob",
  () => {
    throw new Error("Cannot find module '@azure/storage-blob'");
  },
  { virtual: true }
);

describe("start-up without @azure/storage-blob", () => {
  let savedBackend;

  beforeEach(() => {
    jest.resetModules();
    savedBackend = process.env.STORAGE_BACKEND;
    process.env.STORAGE_BACKEND = "s3";
  });

  afterEach(() => {
    if (savedBackend === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = savedBackend;
  });

  it("blocks the blob package", () => {
    expect(() => require("@azure/storage-blob")).toThrow("Cannot find module");
  });

  it.each([
    "../src/services/blobStorage",
    "../src/services/azureBlobService",
    "../src/services/websocketService",
    "../src/services/controlService",
  ])("loads %s without an import error", (modulePath) => {
    expect(() => require(modulePath)).not.toThrow();
  });
});
