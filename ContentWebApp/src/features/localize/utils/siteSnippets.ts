import { API_BASE_URL } from '@/config/env';

export function sdkSnippet(siteId: string, apiBase: string, origin: string): string {
  return [
    '<script',
    `  src="${origin}/sdk.js"`,
    `  data-site-id="${siteId}"`,
    `  data-api-base="${apiBase || API_BASE_URL}"`,
    '  defer>',
    '</script>',
  ].join('\n');
}

export function devToolsSnippet(siteId: string, apiBase: string, origin: string): string {
  return [
    'const s = document.createElement("script");',
    `s.src = "${origin}/sdk.js";`,
    `s.dataset.siteId = "${siteId}";`,
    `s.dataset.apiBase = "${apiBase || API_BASE_URL}";`,
    'document.body.appendChild(s);',
  ].join('\n');
}
