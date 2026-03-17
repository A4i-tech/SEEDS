const request = require("supertest");
const express = require("express");

jest.mock("../src/services/BlobService.js", () => {
  return jest.fn().mockImplementation(() => {
    return {
      getUploadSASToken: jest.fn().mockResolvedValue("dummytoken"),
      getContainerClient: jest.fn().mockReturnValue({
        getBlockBlobClient: () => ({ url: "https://example.com/input-container/blob.mp3" }),
      }),
    };
  });
});

const contentRouter = require("../src/routes/contentRouter.js");

describe("GET /content/sasToken", () => {
  let app;
  beforeAll(() => {
    app = express();
    app.use("/content", contentRouter);
  });

  test("rejects non-mp3 blobName with 400", async () => {
    const res = await request(app).get("/content/sasToken").query({ blobName: "file.wav" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error", "Only .mp3 files are allowed.");
  });

  test("accepts mp3 blobName and returns sasToken", async () => {
    const res = await request(app).get("/content/sasToken").query({ blobName: "file.mp3" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("sasToken");
    expect(typeof res.body.sasToken).toBe("string");
  });
});

