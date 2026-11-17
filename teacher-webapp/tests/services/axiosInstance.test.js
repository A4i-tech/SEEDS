import axiosInstance, { refreshAccessToken } from "../../src/services/axiosInstance";
import axios from "axios";
import { setAccessToken, clearAccessToken } from "../../src/utils/tokenStore";

jest.mock("axios", () => {
  const actual = jest.requireActual("axios");
  return {
    ...actual,
    post: jest.fn(),
  };
});

const getRejectedHandler = () => axiosInstance.interceptors.response.handlers[0].rejected;

describe("axiosInstance response interceptor error logging", () => {
  let consoleErrorSpy;

  beforeEach(() => {
    clearAccessToken();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("logs a server error when the response has a status", async () => {
    const error = { config: {}, response: { status: 500, data: { message: "boom" } } };
    await expect(getRejectedHandler()(error)).rejects.toBe(error);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Server error:", 500, { message: "boom" });
  });

  it("logs a network error when a request was made but no response received", async () => {
    const error = { config: {}, request: {} };
    await expect(getRejectedHandler()(error)).rejects.toBe(error);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Network error: No response received", error.request);
  });

  it("logs a request error when neither a response nor a request exists", async () => {
    const error = { config: {}, message: "bad config" };
    await expect(getRejectedHandler()(error)).rejects.toBe(error);
    expect(consoleErrorSpy).toHaveBeenCalledWith("Request error:", "bad config");
  });

  it("does not duplicate generic error logging on the 401 refresh-retry path", async () => {
    setAccessToken("expired-token");
    axios.post.mockRejectedValue({ response: { status: 401 } });

    const error = {
      config: { headers: {}, _retry: false },
      response: { status: 401 },
    };

    await expect(getRejectedHandler()(error)).rejects.toMatchObject({ status: 401 });

    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      "Server error:",
      expect.anything(),
      expect.anything()
    );
  });
});

describe("refreshAccessToken", () => {
  afterEach(() => {
    clearAccessToken();
  });

  it("coalesces concurrent calls into a single POST", async () => {
    axios.post.mockResolvedValue({ data: { access_token: "new-token" } });

    const [a, b] = await Promise.all([refreshAccessToken(), refreshAccessToken()]);

    expect(a).toBe("new-token");
    expect(b).toBe("new-token");
    expect(axios.post).toHaveBeenCalledTimes(1);
  });
});
