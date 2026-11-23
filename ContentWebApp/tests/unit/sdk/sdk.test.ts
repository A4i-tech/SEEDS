import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SDK_PATH = path.resolve(TEST_DIR, '../../../public/sdk.js');
const SDK_SOURCE = () => fs.readFileSync(SDK_PATH, 'utf8');
const API_BASE = 'https://api.example.com';
const SITE_ID = 'site-1';

function flush(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type FetchMock = ReturnType<typeof vi.fn>;

async function makeDom({
  url = 'https://app.example.com/authn/login',
  bodyHtml = '<p>Hello World</p>',
}: { url?: string; bodyHtml?: string } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${bodyHtml}</body></html>`,
    { url, runScripts: 'dangerously', pretendToBeVisual: true },
  );

  const fetchMock = vi.fn((url: unknown) => {
    const u = String(url);
    if (u.includes('/languages')) {
      return Promise.resolve({
        json: () =>
          Promise.resolve({
            languages: [
              { code: 'en', name: 'English' },
              { code: 'hi', name: 'Hindi' },
            ],
          }),
      });
    }
    if (u.includes('/translations/extract')) {
      return Promise.resolve({ json: () => Promise.resolve({}) });
    }
    if (u.includes('/translations?')) {
      return Promise.resolve({ json: () => Promise.resolve({}) });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
  (dom.window as unknown as Record<string, unknown>).fetch = fetchMock;

  const script = dom.window.document.createElement('script');
  script.setAttribute('data-site-id', SITE_ID);
  script.setAttribute('data-api-base', API_BASE);
  script.textContent = SDK_SOURCE();
  dom.window.document.head.appendChild(script);

  await flush(10);

  return { dom, fetchMock };
}

afterEach(() => {
  vi.clearAllMocks();
});

function sdkHash(dom: JSDOM, text: string): string {
  return dom.window.eval(
    `(function hashText(t){var h=0;for(var i=0;i<t.length;i++){h=(h<<5)-h+t.charCodeAt(i);h|=0;}return "t"+Math.abs(h).toString(36);})(${JSON.stringify(text)})`,
  ) as string;
}

function countExtract(fetchMock: FetchMock) {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes('/translations/extract')).length;
}
function countTranslationGets(fetchMock: FetchMock) {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes('/translations?')).length;
}
function extractedTexts(fetchMock: FetchMock): string[] {
  const out: string[] = [];
  for (const c of fetchMock.mock.calls) {
    if (!String(c[0]).includes('/translations/extract')) continue;
    try {
      JSON.parse((c[1] as { body: string }).body).items.forEach((i: { text: string }) =>
        out.push(i.text),
      );
    } catch {
    }
  }
  return out;
}

async function applyHindi(dom: JSDOM, fetchMock: FetchMock, source: string, translated: string) {
  const hashed = sdkHash(dom, source);
  fetchMock.mockImplementation((url: unknown) => {
    const u = String(url);
    if (u.includes('/translations?')) {
      const r: Record<string, string> = {};
      r[hashed] = translated;
      return Promise.resolve({ json: () => Promise.resolve(r) });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
  dom.window.localStorage.setItem('translationSdk.lang', 'hi');
  const select = dom.window.document.querySelector(
    '#translation-sdk-widget select',
  ) as HTMLSelectElement;
  select.value = 'hi';
  select.dispatchEvent(new dom.window.Event('change'));
  await flush(60);
}

describe('translation SDK (public/sdk.js)', () => {
  it('initializes: walks the DOM and sets the init guard', async () => {
    const { dom } = await makeDom();
    expect((dom.window as unknown as Record<string, unknown>).__translationSdkInitialized).toBe(
      true,
    );
    expect(dom.window.document.getElementById('translation-sdk-widget')).not.toBeNull();
  });

  it('duplicate SDK initialization is a no-op (idempotency guard)', async () => {
    const { dom, fetchMock } = await makeDom();
    const callsAfterFirstInit = fetchMock.mock.calls.length;

    const script2 = dom.window.document.createElement('script');
    script2.setAttribute('data-site-id', SITE_ID);
    script2.setAttribute('data-api-base', API_BASE);
    script2.textContent = SDK_SOURCE();
    dom.window.document.head.appendChild(script2);
    await flush(10);

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirstInit);
    expect(dom.window.document.querySelectorAll('#translation-sdk-widget').length).toBe(1);
  });

  it('history.pushState navigation triggers a route re-scan using the new route', async () => {
    const { dom, fetchMock } = await makeDom({ url: 'https://app.example.com/authn/login' });
    dom.window.localStorage.setItem('translationSdk.lang', 'hi');
    fetchMock.mockClear();

    dom.window.document.body.innerHTML = '<p>Dashboard content</p>';
    dom.window.history.pushState({}, '', '/dashboard');
    await flush(80);

    expect(dom.window.location.pathname).toBe('/dashboard');
    const translationsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/translations?'),
    );
    expect(translationsCalls.length).toBeGreaterThan(0);
    expect(String(translationsCalls[translationsCalls.length - 1][0])).toContain(
      'route=%2Fdashboard',
    );
  });

  it('history.replaceState navigation triggers a route re-scan', async () => {
    const { dom, fetchMock } = await makeDom({ url: 'https://app.example.com/authn/login' });
    dom.window.localStorage.setItem('translationSdk.lang', 'hi');
    fetchMock.mockClear();

    dom.window.document.body.innerHTML = '<p>Profile content</p>';
    dom.window.history.replaceState({}, '', '/profile');
    await flush(80);

    const translationsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/translations?'),
    );
    expect(translationsCalls.length).toBeGreaterThan(0);
    expect(String(translationsCalls[translationsCalls.length - 1][0])).toContain(
      'route=%2Fprofile',
    );
  });

  it('browser back/forward (popstate) on the same route does not re-scan', async () => {
    const { dom, fetchMock } = await makeDom({ url: 'https://app.example.com/authn/login' });
    dom.window.localStorage.setItem('translationSdk.lang', 'hi');

    dom.window.history.pushState({}, '', '/courses');
    await flush(80);
    fetchMock.mockClear();

    dom.window.history.pushState({}, '', '/authn/login');
    await flush(80);
    fetchMock.mockClear();
    dom.window.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    await flush(80);

    const translationsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/translations?'),
    );
    expect(translationsCalls.length).toBe(0);
  });

  it('popstate to a genuinely different route re-scans', async () => {
    const { dom, fetchMock } = await makeDom({ url: 'https://app.example.com/authn/login' });
    dom.window.localStorage.setItem('translationSdk.lang', 'hi');
    fetchMock.mockClear();

    dom.window.history.pushState({}, '', '/dashboard');
    await flush(10);
    dom.reconfigure({ url: 'https://app.example.com/courses' });
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
    await flush(80);

    const translationsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/translations?'),
    );
    expect(translationsCalls.length).toBeGreaterThan(0);
  });

  it('dynamic DOM insertion (new nodes) is picked up by the MutationObserver', async () => {
    const { dom, fetchMock } = await makeDom();
    dom.window.localStorage.setItem('translationSdk.lang', 'hi');
    fetchMock.mockClear();

    const p = dom.window.document.createElement('p');
    p.textContent = 'Dynamically added content';
    dom.window.document.body.appendChild(p);
    await flush(20);

    const extractCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/translations/extract'),
    );
    expect(extractCalls.length).toBeGreaterThan(0);
    const body = JSON.parse((extractCalls[extractCalls.length - 1][1] as { body: string }).body);
    expect(body.items.some((i: { text: string }) => i.text === 'Dynamically added content')).toBe(
      true,
    );
  });

  it('characterData mutation (in-place text change) is detected and re-extracted', async () => {
    const { dom, fetchMock } = await makeDom({ bodyHtml: '<p>Original text</p>' });
    await flush(10);
    fetchMock.mockClear();

    const textNode = dom.window.document.querySelector('p')!.firstChild!;
    textNode.textContent = 'Mutated text';
    await flush(850);

    const extractCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/translations/extract'),
    );
    expect(extractCalls.length).toBeGreaterThan(0);
    const body = JSON.parse((extractCalls[extractCalls.length - 1][1] as { body: string }).body);
    expect(body.items.some((i: { text: string }) => i.text === 'Mutated text')).toBe(true);
  });

  it('characterData mutation does not create an infinite loop from our own translation writes', async () => {
    const { dom, fetchMock } = await makeDom({ bodyHtml: '<p>Hello</p>' });
    fetchMock.mockClear();
    fetchMock.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/translations/extract'))
        return Promise.resolve({ json: () => Promise.resolve({}) });
      if (u.includes('/translations?')) {
        return Promise.resolve({ json: () => Promise.resolve({ t3hchgd: 'नमस्ते' }) });
      }
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    dom.window.localStorage.setItem('translationSdk.lang', 'hi');
    const select = dom.window.document.querySelector(
      '#translation-sdk-widget select',
    ) as HTMLSelectElement;
    select.value = 'hi';
    select.dispatchEvent(new dom.window.Event('change'));
    await flush(50);

    const extractCallsAfterSettle = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/translations/extract'),
    ).length;
    await flush(100);
    const extractCallsLater = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/translations/extract'),
    ).length;

    expect(extractCallsLater).toBe(extractCallsAfterSettle);
  });

  it('language selection persists across route changes (localStorage, origin-scoped)', async () => {
    const { dom } = await makeDom({ url: 'https://app.example.com/authn/login' });
    dom.window.localStorage.setItem('translationSdk.lang', 'hi');

    dom.window.history.pushState({}, '', '/dashboard');
    await flush(80);
    dom.window.history.pushState({}, '', '/courses');
    await flush(80);
    dom.window.history.pushState({}, '', '/profile');
    await flush(80);

    expect(dom.window.localStorage.getItem('translationSdk.lang')).toBe('hi');
  });

  it('each route navigation requests translations for that route only', async () => {
    const { dom, fetchMock } = await makeDom({ url: 'https://app.example.com/authn/login' });
    dom.window.localStorage.setItem('translationSdk.lang', 'hi');

    const routes = ['/dashboard', '/courses', '/profile'];
    for (const route of routes) {
      fetchMock.mockClear();
      dom.window.document.body.innerHTML = `<p>Content for ${route}</p>`;
      dom.window.history.pushState({}, '', route);
      await flush(80);

      const translationsCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes('/translations?'),
      );
      expect(translationsCalls.length).toBeGreaterThan(0);
      expect(String(translationsCalls[translationsCalls.length - 1][0])).toContain(
        'route=' + encodeURIComponent(route),
      );
    }
  });

  it('pending (not-yet-approved) translations fall back to source text, not an empty swap', async () => {
    const { dom, fetchMock } = await makeDom({ bodyHtml: '<p>Pending Phrase</p>' });
    fetchMock.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/translations?'))
        return Promise.resolve({ json: () => Promise.resolve({}) });
      if (u.includes('/translations/extract'))
        return Promise.resolve({ json: () => Promise.resolve({}) });
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    dom.window.localStorage.setItem('translationSdk.lang', 'hi');
    dom.window.history.pushState({}, '', '/pending-route');
    await flush(80);

    expect(dom.window.document.querySelector('p')!.textContent).toBe('Pending Phrase');
  });

  it('approved translations are rendered via swapText', async () => {
    const { dom, fetchMock } = await makeDom({ bodyHtml: '<p>Approved Phrase</p>' });
    await flush(10);

    const hashed = sdkHash(dom, 'Approved Phrase');
    fetchMock.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/translations?')) {
        const result: Record<string, string> = {};
        result[hashed] = 'अनुमोदित वाक्यांश';
        return Promise.resolve({ json: () => Promise.resolve(result) });
      }
      if (u.includes('/translations/extract'))
        return Promise.resolve({ json: () => Promise.resolve({}) });
      return Promise.resolve({ json: () => Promise.resolve({}) });
    });

    dom.window.localStorage.setItem('translationSdk.lang', 'hi');
    dom.window.history.pushState({}, '', '/approved-route');
    await flush(80);

    expect(dom.window.document.querySelector('p')!.textContent).toBe('अनुमोदित वाक्यांश');
  });

  it("guard: SDK's own translated write does not trigger another extraction or translation pass", async () => {
    const { dom, fetchMock } = await makeDom({ bodyHtml: '<p>Approved Phrase</p>' });
    await flush(10);
    fetchMock.mockClear();

    await applyHindi(dom, fetchMock, 'Approved Phrase', 'अनुवादित वाक्यांश');
    expect(dom.window.document.querySelector('p')!.textContent).toBe('अनुवादित वाक्यांश');

    const extractAtSettle = countExtract(fetchMock);
    const getsAtSettle = countTranslationGets(fetchMock);
    await flush(1000);
    expect(countExtract(fetchMock)).toBe(extractAtSettle);
    expect(countTranslationGets(fetchMock)).toBe(getsAtSettle);
    expect(extractedTexts(fetchMock)).not.toContain('अनुवादित वाक्यांश');
  });

  it('guard: re-asserting the already-applied translated value is ignored (no re-extraction)', async () => {
    const { dom, fetchMock } = await makeDom({ bodyHtml: '<p>Approved Phrase</p>' });
    await flush(10);
    fetchMock.mockClear();
    await applyHindi(dom, fetchMock, 'Approved Phrase', 'अनुवादित वाक्यांश');

    const node = dom.window.document.querySelector('p')!.firstChild!;
    const extractBefore = countExtract(fetchMock);
    node.textContent = 'अनुवादित वाक्यांश';
    await flush(1000);

    expect(countExtract(fetchMock)).toBe(extractBefore);
    expect(extractedTexts(fetchMock)).not.toContain('अनुवादित वाक्यांश');
  });

  it('guard: React-style revert-to-source burst re-applies translation and converges (no infinite loop)', async () => {
    const { dom, fetchMock } = await makeDom({ bodyHtml: '<p>Approved Phrase</p>' });
    await flush(10);
    fetchMock.mockClear();
    await applyHindi(dom, fetchMock, 'Approved Phrase', 'अनुवादित वाक्यांश');

    const node = dom.window.document.querySelector('p')!.firstChild!;
    for (let i = 0; i < 6; i++) {
      node.textContent = 'Approved Phrase';
      await flush(20);
    }
    await flush(1000);

    expect(dom.window.document.querySelector('p')!.textContent).toBe('अनुवादित वाक्यांश');
    const extractAtSettle = countExtract(fetchMock);
    const getsAtSettle = countTranslationGets(fetchMock);
    await flush(1000);
    expect(countExtract(fetchMock)).toBe(extractAtSettle);
    expect(countTranslationGets(fetchMock)).toBe(getsAtSettle);
  });

  it('guard: switching back to English reverts text and does not loop', async () => {
    const { dom, fetchMock } = await makeDom({ bodyHtml: '<p>Approved Phrase</p>' });
    await flush(10);
    fetchMock.mockClear();
    await applyHindi(dom, fetchMock, 'Approved Phrase', 'अनुवादित वाक्यांश');
    expect(dom.window.document.querySelector('p')!.textContent).toBe('अनुवादित वाक्यांश');

    const select = dom.window.document.querySelector(
      '#translation-sdk-widget select',
    ) as HTMLSelectElement;
    select.value = 'en';
    select.dispatchEvent(new dom.window.Event('change'));
    await flush(60);
    expect(dom.window.document.querySelector('p')!.textContent).toBe('Approved Phrase');

    const extractAtSettle = countExtract(fetchMock);
    const getsAtSettle = countTranslationGets(fetchMock);
    await flush(1000);
    expect(countExtract(fetchMock)).toBe(extractAtSettle);
    expect(countTranslationGets(fetchMock)).toBe(getsAtSettle);
  });

  it('guard: a genuine app change to a NEW phrase is still extracted (guards do not block real changes)', async () => {
    const { dom, fetchMock } = await makeDom({ bodyHtml: '<p>Approved Phrase</p>' });
    await flush(10);
    fetchMock.mockClear();
    await applyHindi(dom, fetchMock, 'Approved Phrase', 'अनुवादित वाक्यांश');

    const node = dom.window.document.querySelector('p')!.firstChild!;
    node.textContent = 'Brand New Phrase';
    await flush(1000);

    expect(extractedTexts(fetchMock)).toContain('Brand New Phrase');
  });

  it('multiple sequential route navigations each re-scan without duplicating the widget or listeners', async () => {
    const { dom } = await makeDom({ url: 'https://app.example.com/authn/login' });
    dom.window.localStorage.setItem('translationSdk.lang', 'hi');

    for (const route of ['/a', '/b', '/c', '/d']) {
      dom.window.document.body.innerHTML = `<p>Page ${route}</p><div id="translation-sdk-widget-holder"></div>`;
      dom.window.history.pushState({}, '', route);
      await flush(80);
    }

    expect(dom.window.location.pathname).toBe('/d');
    expect(dom.window.document.querySelectorAll('#translation-sdk-widget').length).toBeLessThanOrEqual(
      1,
    );
  });

  it('a long text node (well over 1109 chars) is extracted whole and never truncated', async () => {
    const long = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(40).trim();
    const { fetchMock } = await makeDom({ bodyHtml: `<p>${long}</p>` });
    await flush(900);

    expect(long.length).toBeGreaterThan(2000);
    expect(extractedTexts(fetchMock)).toContain(long);
  });
});
