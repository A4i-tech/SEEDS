export function extractDomain(url) {
  const withProtocol = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    return new URL(withProtocol).hostname;
  } catch {
    return url;
  }
}
