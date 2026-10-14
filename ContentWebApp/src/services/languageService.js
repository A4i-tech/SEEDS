import { SEEDS_URL } from "../Constants";
import { apiFetch } from "./api";

export const languageService = {
  async listLanguages() {
    const url = `${SEEDS_URL}/v1/languages`;
    const response = await apiFetch(url, { method: "GET" });
    return response.languages;
  },
};
