import { useEffect, useState } from "react";

// fetchFn(signal) -> Blob; pass null to skip. Returns { url, error }.
export function useBlobObjectUrl(fetchFn, deps) {
  const [state, setState] = useState({ url: null, error: null });
  useEffect(() => {
    setState({ url: null, error: null });
    if (!fetchFn) return undefined;
    const controller = new AbortController();
    let url;
    fetchFn(controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
        setState({ url, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ url: null, error });
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
