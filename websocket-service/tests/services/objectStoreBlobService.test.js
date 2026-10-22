const { spawnSync } = require("child_process");
const { randomBytes } = require("crypto");
const Minio = require("minio");

const ENDPOINT_URL = "http://localhost:9000";
const BUCKET = "output-container";
const KEY_PREFIX = `contract-test-${Date.now()}`;

// Jest 29 cannot skip at run time, so probe MinIO before the tests are declared.
const probe = `require("http").get("${ENDPOINT_URL}/minio/health/ready", (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on("error", () => process.exit(1));`;
const minioReady = spawnSync(process.execPath, ["-e", probe], { timeout: 3000 }).status === 0;

const OBJECT_STORE_ENV = ["OBJECT_STORE_ENDPOINT_URL", "OBJECT_STORE_ACCESS_KEY_ID", "OBJECT_STORE_SECRET_ACCESS_KEY", "OBJECT_STORE_REGION"];
const savedEnv = {};

beforeEach(() => {
  jest.resetModules();
  OBJECT_STORE_ENV.forEach((name) => {
    savedEnv[name] = process.env[name];
    delete process.env[name];
  });
});

afterEach(() => {
  OBJECT_STORE_ENV.forEach((name) => {
    if (savedEnv[name] === undefined) delete process.env[name];
    else process.env[name] = savedEnv[name];
  });
});

const describeMinio = minioReady ? describe : describe.skip;

describeMinio(
  minioReady
    ? "objectStoreBlobService against MinIO"
    : `objectStoreBlobService against MinIO (skipped: ${ENDPOINT_URL}/minio/health/ready did not answer)`,
  () => {
    const minioClient = new Minio.Client({
      endPoint: "localhost",
      port: 9000,
      useSSL: false,
      accessKey: "test-access-key",
      secretKey: "test-secret-key",
    });
    const keys = [];

    const putObject = async (key, bytes) => {
      keys.push(key);
      await minioClient.putObject(BUCKET, key, bytes);
    };

    beforeEach(() => {
      process.env.OBJECT_STORE_ENDPOINT_URL = ENDPOINT_URL;
      process.env.OBJECT_STORE_ACCESS_KEY_ID = "test-access-key";
      process.env.OBJECT_STORE_SECRET_ACCESS_KEY = "test-secret-key";
    });

    afterAll(async () => {
      await Promise.all(keys.map((key) => minioClient.removeObject(BUCKET, key)));
    });

    it("returns the exact bytes of a stored object", async () => {
      const bytes = Buffer.concat([Buffer.from([0x00, 0xff]), randomBytes(200000)]);
      await putObject(`${KEY_PREFIX}/answer/1.0.wav`, bytes);
      const { getBlobData } = require("../../src/services/objectStoreBlobService");

      const result = await getBlobData(BUCKET, `${KEY_PREFIX}/answer/1.0.wav`);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.equals(bytes)).toBe(true);
    });

    it("returns an empty Buffer for an empty object", async () => {
      await putObject(`${KEY_PREFIX}/empty.wav`, Buffer.alloc(0));
      const { getBlobData } = require("../../src/services/objectStoreBlobService");

      const result = await getBlobData(BUCKET, `${KEY_PREFIX}/empty.wav`);

      expect(result.length).toBe(0);
    });

    it("rejects when the object does not exist", async () => {
      const { getBlobData } = require("../../src/services/objectStoreBlobService");

      await expect(getBlobData(BUCKET, `${KEY_PREFIX}/missing.wav`)).rejects.toMatchObject({
        code: "NoSuchKey",
      });
    });
  }
);

describe("objectStoreBlobService without an endpoint", () => {
  it("names the missing setting", async () => {
    const { getBlobData } = require("../../src/services/objectStoreBlobService");

    await expect(getBlobData("container", "file")).rejects.toThrow(/OBJECT_STORE_ENDPOINT_URL is not set/);
  });
});
