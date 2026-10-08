import { uploadToStorage } from "../../src/utils/blobUpload";

describe("uploadToStorage", () => {
  const file = { name: "audio.mp3", type: "audio/mpeg" };
  const metadata = { experience: "Story", isfinalaudio: "true", Question: "false" };

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201 });
  });

  afterEach(() => {
    delete global.fetch;
  });

  test("sends blob type and metadata headers to an Azure link", async () => {
    const url = "https://seedsblob.blob.core.windows.net/input-container/a.mp3?sv=2024&sig=x";

    await uploadToStorage(url, file, metadata);

    expect(global.fetch).toHaveBeenCalledWith(url, {
      method: "PUT",
      headers: {
        "Content-Type": "audio/mpeg",
        "x-ms-blob-type": "BlockBlob",
        "x-ms-meta-experience": "Story",
        "x-ms-meta-isfinalaudio": "true",
        "x-ms-meta-Question": "false",
      },
      body: file,
    });
  });

  test("sends only the content type to an S3 link", async () => {
    const url = "http://localhost:9000/input-container/a.mp3?X-Amz-Signature=x";

    await uploadToStorage(url, file, metadata);

    expect(global.fetch).toHaveBeenCalledWith(url, {
      method: "PUT",
      headers: { "Content-Type": "audio/mpeg" },
      body: file,
    });
  });

  test("throws the status and the next step when the upload fails", async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 403 });

    await expect(
      uploadToStorage("http://localhost:9000/input-container/a.mp3", file, metadata)
    ).rejects.toThrow(/status 403\. Try saving again\./);
  });
});
