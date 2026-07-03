import { apiFetch } from "./api";

export const ivrService = {
  /**
   * Rebuild the IVR FSM from latest content (platform: PATCH /ivr)
   * @param {string} baseURL - Platform API base URL
   * @param {Object} headers - Auth headers
   * @returns {Promise<{message: string}>}
   */
  async updateIVR(baseURL, headers = {}) {
    if (!baseURL) {
      throw new Error("API URL not configured");
    }

    const url = `${baseURL}/ivr`;

    const response = await apiFetch(url, {
      method: "PATCH",
      headers,
    });

    return {
      message: response.message || "IVR updated successfully",
    };
  },
};
