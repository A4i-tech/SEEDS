import { toast } from "react-toastify";

export const showToast = {
  success: (message) => toast.success(message, { position: "top-right" }),
  error: (message) => toast.error(message, { position: "top-right" }),
  warning: (message) => toast.warning(message, { position: "top-right" }),
  info: (message) => toast.info(message, { position: "top-right" }),
};
