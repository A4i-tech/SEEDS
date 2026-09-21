import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { request } from "./requestHelpers";
import { fromLanguageResponse } from "../dto/LocalizationDto";

export const languageService = {
  async listLanguages() {
    const url = `${SEEDS_URL}/languages?enabledOnly=false`;

    const response = await request(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return response.map(fromLanguageResponse);
  },
};
