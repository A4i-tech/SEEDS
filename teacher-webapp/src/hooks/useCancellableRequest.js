import { useEffect, useRef } from "react";

/**
 * Custom hook to manage AbortController for cancellable axios requests
 * Automatically cancels requests when component unmounts
 *
 * @returns {AbortSignal} signal - Pass this to axios requests
 *
 * @example
 * const signal = useCancellableRequest();
 * const response = await axiosInstance.get('/endpoint', { signal });
 */
export const useCancellableRequest = () => {
  const controllerRef = useRef(null);

  useEffect(() => {
    // Create controller on mount
    controllerRef.current = new AbortController();

    // Cleanup: abort on unmount
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  return controllerRef.current?.signal;
};

/**
 * Helper function to check if error is a cancellation error
 * @param {Error} error - The error to check
 * @returns {boolean} - True if error is from request cancellation
 */
export const isCancelError = (error) => {
  return error?.name === "CanceledError" || error?.code === "ERR_CANCELED";
};
