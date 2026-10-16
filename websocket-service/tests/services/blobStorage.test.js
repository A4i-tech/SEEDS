describe("blobStorage", () => {
  const loads = { s3: 0, azure: 0 };
  let s3;
  let azure;
  let savedBackend;

  beforeEach(() => {
    jest.resetModules();
    savedBackend = process.env.STORAGE_BACKEND;
    delete process.env.STORAGE_BACKEND;
    loads.s3 = 0;
    loads.azure = 0;
    s3 = { getBlobData: jest.fn().mockResolvedValue(Buffer.from("from s3")) };
    azure = { getBlobData: jest.fn().mockResolvedValue(Buffer.from("from azure")) };
    jest.doMock("../../src/services/s3BlobService", () => {
      loads.s3++;
      return s3;
    });
    jest.doMock("../../src/services/azureBlobService", () => {
      loads.azure++;
      return azure;
    });
  });

  afterEach(() => {
    if (savedBackend === undefined) delete process.env.STORAGE_BACKEND;
    else process.env.STORAGE_BACKEND = savedBackend;
  });

  it("uses the s3 provider when STORAGE_BACKEND is not set", async () => {
    const blobStorage = require("../../src/services/blobStorage");

    const data = await blobStorage.getBlobData("bucket", "a/b.wav");

    expect(data.toString()).toBe("from s3");
    expect(s3.getBlobData).toHaveBeenCalledWith("bucket", "a/b.wav");
    expect(loads.azure).toBe(0);
  });

  it("uses the azure provider when STORAGE_BACKEND=azure", async () => {
    process.env.STORAGE_BACKEND = "azure";
    const blobStorage = require("../../src/services/blobStorage");

    const data = await blobStorage.getBlobData("container", "a/b.wav");

    expect(data.toString()).toBe("from azure");
    expect(azure.getBlobData).toHaveBeenCalledWith("container", "a/b.wav");
    expect(loads.s3).toBe(0);
  });

  it("loads the provider on the first call only", async () => {
    const blobStorage = require("../../src/services/blobStorage");
    expect(loads.s3).toBe(0);

    await blobStorage.getBlobData("bucket", "one.wav");
    await blobStorage.getBlobData("bucket", "two.wav");

    expect(loads.s3).toBe(1);
  });

  it("rejects an unsupported STORAGE_BACKEND with the values to use", async () => {
    process.env.STORAGE_BACKEND = "gcs";
    const blobStorage = require("../../src/services/blobStorage");

    await expect(blobStorage.getBlobData("bucket", "a.wav")).rejects.toThrow(
      "STORAGE_BACKEND=gcs is not supported. Set STORAGE_BACKEND to s3 or azure."
    );
  });
});
