import { apiFetch } from "./api";

export const ivrService = {
  /**
   * Update IVR configuration
   * @param {string} ivrURL - Base IVR service URL
   * @param {Object} headers - Auth headers
   * @returns {Promise<{message: string}>}
   */
  async updateIVR(ivrURL, headers = {}) {
    if (!ivrURL) {
      throw new Error("IVR URL not configured");
    }

    const url = `${ivrURL}/updateivr`;

    const response = await apiFetch(url, {
      method: "POST",
      headers,
    });

    return {
      message: response.message || "IVR updated successfully",
    };
  },
};
