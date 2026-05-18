/**
 * Check if localStorage is available and accessible
 * @returns {boolean} True if localStorage can be used
 */
export const isLocalStorageAvailable = () => {
  try {
    const test = "__localStorage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Get authentication headers with token
 * @returns {Object} Headers object with Authorization
 */
export const getAuthHeaders = () => {
  const token = localStorage.getItem("authToken");

  if (!token) {
    clearAuth();
    return null;
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
};

export const getTokenPayload = () => {
  try {
    const token = localStorage.getItem("authToken");
    if (!token) return {};
    const [, payload] = token.split(".");
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    return JSON.parse(atob(padded));
  } catch (_error) {
    return {};
  }
};

export const isTokenExpired = () => {
  const { exp } = getTokenPayload();
  if (typeof exp !== "number") return false;
  return Date.now() >= exp * 1000;
};

/**
 * Check if user is authenticated
 * @returns {boolean} True if token exists
 */
export const isAuthenticated = () => {
  if (!isLocalStorageAvailable()) return false;
  if (!localStorage.getItem("authToken")) return false;
  if (isTokenExpired()) {
    clearAuth();
    return false;
  }
  return true;
};

const clearAllCookies = () => {
  if (typeof document === "undefined" || !document.cookie) return;
  const { hostname } = window.location;
  const domains = [hostname, `.${hostname}`, ""];
  document.cookie.split(";").forEach((entry) => {
    const name = entry.split("=")[0].trim();
    if (!name) return;
    domains.forEach((domain) => {
      const domainAttr = domain ? `; domain=${domain}` : "";
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainAttr}`;
    });
  });
};

/**
 * Clear all authentication data
 */
export const clearAuth = () => {
  if (isLocalStorageAvailable()) {
    localStorage.removeItem("authToken");
  }
  clearAllCookies();
};

export const forceLogout = (redirectPath = "/") => {
  clearAuth();
  if (typeof window !== "undefined" && window.location.pathname !== redirectPath) {
    window.location.href = redirectPath;
  }
};
