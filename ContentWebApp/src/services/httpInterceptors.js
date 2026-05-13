import axios from "axios";
import { clearAuth } from "../utils/authHelpers";

let installed = false;

export const installHttpInterceptors = () => {
  if (installed) return;
  installed = true;

  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const status = error?.response?.status;
      const hasToken = !!localStorage.getItem("authToken");

      if (hasToken && (status === 401 || status === 403)) {
        clearAuth();
        if (typeof window !== "undefined" && window.location.pathname !== "/") {
          window.location.href = "/";
        }
      }

      return Promise.reject(error);
    }
  );
};
