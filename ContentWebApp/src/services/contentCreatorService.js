import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";

export const contentCreatorService = {
  async getContentCreators(headers = {}, signal = null) {
    const url = `${SEEDS_URL}/content-creator`;
    const response = await apiFetch(url, {
      method: "GET",
      headers,
      signal,
    });
    return response || [];
  },

  async registerContentCreator({ name, email, password }, headers = {}) {
    const url = `${SEEDS_URL}/content-creator/tenant/register`;
    return await apiFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, email, password }),
    });
  },
};
