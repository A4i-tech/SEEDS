export function portalContainer() {
  if (typeof document === "undefined") return undefined;
  return document.querySelector(".loca-ui") || undefined;
}
