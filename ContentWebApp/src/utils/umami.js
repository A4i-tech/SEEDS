export function initUmami() {
  const src = process.env.REACT_APP_UMAMI_SCRIPT_URL;
  const websiteId = process.env.REACT_APP_UMAMI_WEBSITE_ID;
  if (!src || !websiteId) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = src;
  script.dataset.websiteId = websiteId;
  document.head.appendChild(script);
}
