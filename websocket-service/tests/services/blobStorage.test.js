describe("blobStorage", () => {
  const loads = { objectStore: 0, azure: 0 };
  let objectStore;
  let azure;
  let savedBackend;

  beforeEach(() => {
    jest.resetModules();
    savedBackend = process.env.STORAGE_BACKEND;
    delete process.env.STORAGE_BACKEND;
    loads.objectStore = 0;
    loads.azure = 0;
    objectStore = { getBlobData: jest.fn().mockResolvedValue(Buffer.from("from object store")) };
    azure = { getBlobData: jest.fn().mockResolvedValue(Buffer.from("from azure")) };
    jest.doMock("../../src/services/objectStoreBlobService", () => {
      loads.objectStore++;
      return objectStore;
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

  it("uses the object-store provider when STORAGE_BACKEND=object-store", async () => {
    process.env.STORAGE_BACKEND = "object-store";
    const blobStorage = require("../../src/services/blobStorage");

    const data = await blobStorage.getBlobData("bucket", "a/b.wav");

    expect(data.toString()).toBe("from object store");
    expect(objectStore.getBlobData).toHaveBeenCalledWith("bucket", "a/b.wav");
    expect(loads.azure).toBe(0);
  });

  it("uses the azure provider when STORAGE_BACKEND=azure", async () => {
    process.env.STORAGE_BACKEND = "azure";
    const blobStorage = require("../../src/services/blobStorage");

    const data = await blobStorage.getBlobData("container", "a/b.wav");

    expect(data.toString()).toBe("from azure");
    expect(azure.getBlobData).toHaveBeenCalledWith("container", "a/b.wav");
    expect(loads.objectStore).toBe(0);
  });

  it("loads the provider on the first call only", async () => {
    process.env.STORAGE_BACKEND = "object-store";
    const blobStorage = require("../../src/services/blobStorage");
    expect(loads.objectStore).toBe(0);

    await blobStorage.getBlobData("bucket", "one.wav");
    await blobStorage.getBlobData("bucket", "two.wav");

    expect(loads.objectStore).toBe(1);
  });

  it("rejects an unsupported STORAGE_BACKEND with the values to use", async () => {
    process.env.STORAGE_BACKEND = "gcs";
    const blobStorage = require("../../src/services/blobStorage");

    await expect(blobStorage.getBlobData("bucket", "a.wav")).rejects.toThrow(
      "STORAGE_BACKEND=gcs is not supported. Set STORAGE_BACKEND to object-store or azure."
    );
  });
});
