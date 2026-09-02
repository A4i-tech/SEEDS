/**
 * Radix primitives portal to document.body by default — which is OUTSIDE the
 * .loca-ui token scope, so CSS custom properties (--surface, --line, …) and the
 * theme (data-theme on .loca-ui) don't resolve there. Portalling into the
 * .loca-ui root instead keeps overlays fully styled and theme-aware.
 * The root has no transform/filter, so fixed-positioned content still anchors
 * to the viewport.
 */
export function portalContainer() {
  if (typeof document === "undefined") return undefined;
  return document.querySelector(".loca-ui") || undefined;
}
