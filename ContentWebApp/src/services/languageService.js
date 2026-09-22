import { SEEDS_URL } from "../Constants";
import { request } from "./requestHelpers";

export const languageService = {
  async listLanguages() {
    const url = `${SEEDS_URL}/v1/languages`;

    const response = await request(url, {
      method: "GET",
    });

    return response.languages;
  },
};
