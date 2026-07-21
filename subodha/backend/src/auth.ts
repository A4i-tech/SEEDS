"use strict";
import { client as axios } from "./httpClient";

const BASE_URL = process.env.SUBODHA_BASE_URL || "https://subodha-lms.visionempowertrust.org";

let _sessionCookie: string | null = null;
let _sessionExpiresAt = 0;

function parseCookies(setCookieHeaders: string[] | string | undefined): Record<string, string> {
  const jar: Record<string, string> = {};
  (Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders]).forEach((line) => {
    if (!line) return;
    const [pair] = line.split(";");
    const [key, ...rest] = pair.split("=");
    jar[key.trim()] = rest.join("=").trim();
  });
  return jar;
}

function cookieString(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

export async function getSubodhaSession(): Promise<string> {
  const now = Date.now();
  if (_sessionCookie && now < _sessionExpiresAt - 30 * 60 * 1000) {
    return _sessionCookie;
  }

  const initRes = await axios.get(`${BASE_URL}/`, { withCredentials: false, timeout: 30_000 });
  const initCookies = parseCookies(initRes.headers["set-cookie"]);

  const loginRes = await axios.post(
    `${BASE_URL}/api/user/v1/account/login_session/`,
    new URLSearchParams({
      email: process.env.SUBODHA_USERNAME || "",
      password: process.env.SUBODHA_PASSWORD || "",
    }).toString(),
    {
      withCredentials: false,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken": initCookies["csrftoken"] || "",
        Cookie: cookieString(initCookies),
        Referer: `${BASE_URL}/login`,
      },
      timeout: 30_000,
    }
  );

  if (!loginRes.data?.success) {
    throw new Error(`Subodha login failed: ${JSON.stringify(loginRes.data)}`);
  }

  const loginCookies = parseCookies(loginRes.headers["set-cookie"]);
  const merged = { ...initCookies, ...loginCookies };

  _sessionCookie = cookieString(merged);
  _sessionExpiresAt = now + 7 * 24 * 60 * 60 * 1000;

  return _sessionCookie;
}

export function clearSessionCache(): void {
  _sessionCookie = null;
  _sessionExpiresAt = 0;
}
