const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SDK_PATH = path.resolve(__dirname, "../public/sdk.js");
const API_BASE = "https://api.example.com";
const SITE_ID = "site-1";

function flush(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeDom({ url = "https://app.example.com/authn/login", bodyHtml = "<p>Hello World</p>" } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${bodyHtml}</body></html>`,
    { url, runScripts: "dangerously", pretendToBeVisual: true }
  );

  const fetchMock = jest.fn((url) => {
    const u = String(url);
    if (u.includes("/languages")) {
      return Promise.resolve({
        json: () => Promise.resolve([{ code: "en", name: "English" }, { code: "hi", name: "Hindi" }]),
      });
    }
    if (u.includes("/translations/extract")) {
      return Promise.resolve({ json: () => Promise.resolve({}) });
    }
    if (u.includes("/translations?")) {
      return Promise.resolve({ json: () => Promise.resolve({}) });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
  dom.window.fetch = fetchMock;

  const script = dom.window.document.createElement("script");
  script.setAttribute("data-site-id", SITE_ID);
  script.setAttribute("data-api-base", API_BASE);
  script.textContent = fs.readFileSync(SDK_PATH, "utf8");
  dom.window.document.head.appendChild(script);

  await flush(10);

  return { dom, fetchMock };
}

afterEach(() => {
  jest.clearAllMocks();
});

test("initial SDK initialization walks the DOM and sets the init guard", async () => {
  const { dom } = await makeDom();
  expect(dom.window.__translationSdkInitialized).toBe(true);
  expect(dom.window.document.getElementById("translation-sdk-widget")).not.toBeNull();
});

test("duplicate SDK initialization is a no-op (idempotency guard)", async () => {
  const { dom, fetchMock } = await makeDom();
  const callsAfterFirstInit = fetchMock.mock.calls.length;

  const script2 = dom.window.document.createElement("script");
  script2.setAttribute("data-site-id", SITE_ID);
  script2.setAttribute("data-api-base", API_BASE);
  script2.textContent = fs.readFileSync(SDK_PATH, "utf8");
  dom.window.document.head.appendChild(script2);
  await flush(10);

  expect(fetchMock.mock.calls.length).toBe(callsAfterFirstInit);
  expect(dom.window.document.querySelectorAll("#translation-sdk-widget").length).toBe(1);
});

test("history.pushState navigation triggers a route re-scan using the new route", async () => {
  const { dom, fetchMock } = await makeDom({ url: "https://app.example.com/authn/login" });
  dom.window.localStorage.setItem("translationSdk.lang", "hi");
  fetchMock.mockClear();

  dom.window.document.body.innerHTML = "<p>Dashboard content</p>";
  dom.window.history.pushState({}, "", "/dashboard");
  await flush(80);

  expect(dom.window.location.pathname).toBe("/dashboard");
  const translationsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/translations?"));
  expect(translationsCalls.length).toBeGreaterThan(0);
  expect(String(translationsCalls[translationsCalls.length - 1][0])).toContain("route=%2Fdashboard");
});

test("history.replaceState navigation triggers a route re-scan", async () => {
  const { dom, fetchMock } = await makeDom({ url: "https://app.example.com/authn/login" });
  dom.window.localStorage.setItem("translationSdk.lang", "hi");
  fetchMock.mockClear();

  dom.window.document.body.innerHTML = "<p>Profile content</p>";
  dom.window.history.replaceState({}, "", "/profile");
  await flush(80);

  const translationsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/translations?"));
  expect(translationsCalls.length).toBeGreaterThan(0);
  expect(String(translationsCalls[translationsCalls.length - 1][0])).toContain("route=%2Fprofile");
});

test("browser back/forward (popstate) triggers a route re-scan", async () => {
  const { dom, fetchMock } = await makeDom({ url: "https://app.example.com/authn/login" });
  dom.window.localStorage.setItem("translationSdk.lang", "hi");

  dom.window.history.pushState({}, "", "/courses");
  await flush(80);
  fetchMock.mockClear();

  dom.window.history.pushState({}, "", "/authn/login");
  await flush(80);
  fetchMock.mockClear();
  dom.window.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
  await flush(80);

  const translationsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/translations?"));
  expect(translationsCalls.length).toBe(0);
});

test("popstate to a genuinely different route re-scans", async () => {
  const { dom, fetchMock } = await makeDom({ url: "https://app.example.com/authn/login" });
  dom.window.localStorage.setItem("translationSdk.lang", "hi");
  fetchMock.mockClear();

  dom.window.history.pushState({}, "", "/dashboard");
  await flush(10);
  Object.defineProperty(dom.window, "location", {
    value: new dom.window.URL("https://app.example.com/courses"),
    writable: true,
  });
  dom.window.dispatchEvent(new dom.window.PopStateEvent("popstate"));
  await flush(80);

  const translationsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/translations?"));
  expect(translationsCalls.length).toBeGreaterThan(0);
});

test("dynamic DOM insertion (new nodes) is picked up by the MutationObserver", async () => {
  const { dom, fetchMock } = await makeDom();
  dom.window.localStorage.setItem("translationSdk.lang", "hi");
  fetchMock.mockClear();

  const p = dom.window.document.createElement("p");
  p.textContent = "Dynamically added content";
  dom.window.document.body.appendChild(p);
  await flush(20);

  const extractCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/translations/extract"));
  expect(extractCalls.length).toBeGreaterThan(0);
  const body = JSON.parse(extractCalls[extractCalls.length - 1][1].body);
  expect(body.items.some((i) => i.text === "Dynamically added content")).toBe(true);
});

test("characterData mutation (in-place text change) is detected and re-extracted", async () => {
  const { dom, fetchMock } = await makeDom({ bodyHtml: "<p>Original text</p>" });
  await flush(10);
  fetchMock.mockClear();

  const textNode = dom.window.document.querySelector("p").firstChild;
  textNode.textContent = "Mutated text";
  await flush(850);

  const extractCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/translations/extract"));
  expect(extractCalls.length).toBeGreaterThan(0);
  const body = JSON.parse(extractCalls[extractCalls.length - 1][1].body);
  expect(body.items.some((i) => i.text === "Mutated text")).toBe(true);
});

test("characterData mutation does not create an infinite loop from our own translation writes", async () => {
  const { dom, fetchMock } = await makeDom({ bodyHtml: "<p>Hello</p>" });
  fetchMock.mockClear();
  fetchMock.mockImplementation((url) => {
    const u = String(url);
    if (u.includes("/translations/extract")) return Promise.resolve({ json: () => Promise.resolve({}) });
    if (u.includes("/translations?")) {
      return Promise.resolve({ json: () => Promise.resolve({ t3hchgd: "नमस्ते" }) });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });

  dom.window.localStorage.setItem("translationSdk.lang", "hi");
  const select = dom.window.document.querySelector("#translation-sdk-widget select");
  select.value = "hi";
  select.dispatchEvent(new dom.window.Event("change"));
  await flush(50);

  const extractCallsAfterSettle = fetchMock.mock.calls.filter((c) =>
    String(c[0]).includes("/translations/extract")
  ).length;
  await flush(100);
  const extractCallsLater = fetchMock.mock.calls.filter((c) =>
    String(c[0]).includes("/translations/extract")
  ).length;

  expect(extractCallsLater).toBe(extractCallsAfterSettle);
});

test("language selection persists across route changes (localStorage, origin-scoped)", async () => {
  const { dom } = await makeDom({ url: "https://app.example.com/authn/login" });
  dom.window.localStorage.setItem("translationSdk.lang", "hi");

  dom.window.history.pushState({}, "", "/dashboard");
  await flush(80);
  dom.window.history.pushState({}, "", "/courses");
  await flush(80);
  dom.window.history.pushState({}, "", "/profile");
  await flush(80);

  expect(dom.window.localStorage.getItem("translationSdk.lang")).toBe("hi");
});

test("each route navigation requests translations for that route only", async () => {
  const { dom, fetchMock } = await makeDom({ url: "https://app.example.com/authn/login" });
  dom.window.localStorage.setItem("translationSdk.lang", "hi");

  const routes = ["/dashboard", "/courses", "/profile"];
  for (const route of routes) {
    fetchMock.mockClear();
    dom.window.document.body.innerHTML = `<p>Content for ${route}</p>`;
    dom.window.history.pushState({}, "", route);
    await flush(80);

    const translationsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/translations?"));
    expect(translationsCalls.length).toBeGreaterThan(0);
    expect(String(translationsCalls[translationsCalls.length - 1][0])).toContain(
      "route=" + encodeURIComponent(route)
    );
  }
});

test("pending (not-yet-approved) translations fall back to source text, not an empty swap", async () => {
  const { dom, fetchMock } = await makeDom({ bodyHtml: "<p>Pending Phrase</p>" });
  fetchMock.mockImplementation((url) => {
    const u = String(url);
    if (u.includes("/translations?")) return Promise.resolve({ json: () => Promise.resolve({}) });
    if (u.includes("/translations/extract")) return Promise.resolve({ json: () => Promise.resolve({}) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });

  dom.window.localStorage.setItem("translationSdk.lang", "hi");
  dom.window.history.pushState({}, "", "/pending-route");
  await flush(80);

  expect(dom.window.document.querySelector("p").textContent).toBe("Pending Phrase");
});

test("approved translations are rendered via swapText", async () => {
  const { dom, fetchMock } = await makeDom({ bodyHtml: "<p>Approved Phrase</p>" });
  await flush(10);

  const hashed = dom.window.eval(`
    (function hashText(text) {
      var hash = 0;
      for (var i = 0; i < text.length; i++) {
        hash = (hash << 5) - hash + text.charCodeAt(i);
        hash |= 0;
      }
      return "t" + Math.abs(hash).toString(36);
    })("Approved Phrase")
  `);
  fetchMock.mockImplementation((url) => {
    const u = String(url);
    if (u.includes("/translations?")) {
      const result = {};
      result[hashed] = "अनुमोदित वाक्यांश";
      return Promise.resolve({ json: () => Promise.resolve(result) });
    }
    if (u.includes("/translations/extract")) return Promise.resolve({ json: () => Promise.resolve({}) });
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });

  dom.window.localStorage.setItem("translationSdk.lang", "hi");
  dom.window.history.pushState({}, "", "/approved-route");
  await flush(80);

  expect(dom.window.document.querySelector("p").textContent).toBe("अनुमोदित वाक्यांश");
});

function sdkHash(dom, text) {
  return dom.window.eval(`
    (function hashText(t){var h=0;for(var i=0;i<t.length;i++){h=(h<<5)-h+t.charCodeAt(i);h|=0;}return "t"+Math.abs(h).toString(36);})(${JSON.stringify(text)})
  `);
}

function countExtract(fetchMock) {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes("/translations/extract")).length;
}
function countTranslationGets(fetchMock) {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes("/translations?")).length;
}
function extractedTexts(fetchMock) {
  const out = [];
  for (const c of fetchMock.mock.calls) {
    if (!String(c[0]).includes("/translations/extract")) continue;
    try {
      JSON.parse(c[1].body).items.forEach((i) => out.push(i.text));
    } catch (e) {
    }
  }
  return out;
}

async function applyHindi(dom, fetchMock, source, translated) {
  const hashed = sdkHash(dom, source);
  fetchMock.mockImplementation((url) => {
    const u = String(url);
    if (u.includes("/translations?")) {
      const r = {};
      r[hashed] = translated;
      return Promise.resolve({ json: () => Promise.resolve(r) });
    }
    return Promise.resolve({ json: () => Promise.resolve({}) });
  });
  dom.window.localStorage.setItem("translationSdk.lang", "hi");
  const select = dom.window.document.querySelector("#translation-sdk-widget select");
  select.value = "hi";
  select.dispatchEvent(new dom.window.Event("change"));
  await flush(60);
}

test("guard: SDK's own translated write does not trigger another extraction or translation pass", async () => {
  const { dom, fetchMock } = await makeDom({ bodyHtml: "<p>Approved Phrase</p>" });
  await flush(10);
  fetchMock.mockClear();

  await applyHindi(dom, fetchMock, "Approved Phrase", "अनुवादित वाक्यांश");
  expect(dom.window.document.querySelector("p").textContent).toBe("अनुवादित वाक्यांश");

  const extractAtSettle = countExtract(fetchMock);
  const getsAtSettle = countTranslationGets(fetchMock);
  await flush(1000);
  expect(countExtract(fetchMock)).toBe(extractAtSettle);
  expect(countTranslationGets(fetchMock)).toBe(getsAtSettle);
  expect(extractedTexts(fetchMock)).not.toContain("अनुवादित वाक्यांश");
});

test("guard: re-asserting the already-applied translated value is ignored (no re-extraction)", async () => {
  const { dom, fetchMock } = await makeDom({ bodyHtml: "<p>Approved Phrase</p>" });
  await flush(10);
  fetchMock.mockClear();
  await applyHindi(dom, fetchMock, "Approved Phrase", "अनुवादित वाक्यांश");

  const node = dom.window.document.querySelector("p").firstChild;
  const extractBefore = countExtract(fetchMock);
  node.textContent = "अनुवादित वाक्यांश";
  await flush(1000);

  expect(countExtract(fetchMock)).toBe(extractBefore);
  expect(extractedTexts(fetchMock)).not.toContain("अनुवादित वाक्यांश");
});

test("guard: React-style revert-to-source burst re-applies translation and converges (no infinite loop)", async () => {
  const { dom, fetchMock } = await makeDom({ bodyHtml: "<p>Approved Phrase</p>" });
  await flush(10);
  fetchMock.mockClear();
  await applyHindi(dom, fetchMock, "Approved Phrase", "अनुवादित वाक्यांश");

  const node = dom.window.document.querySelector("p").firstChild;
  for (let i = 0; i < 6; i++) {
    node.textContent = "Approved Phrase";
    await flush(20);
  }
  await flush(1000);

  expect(dom.window.document.querySelector("p").textContent).toBe("अनुवादित वाक्यांश");
  const extractAtSettle = countExtract(fetchMock);
  const getsAtSettle = countTranslationGets(fetchMock);
  await flush(1000);
  expect(countExtract(fetchMock)).toBe(extractAtSettle);
  expect(countTranslationGets(fetchMock)).toBe(getsAtSettle);
});

test("guard: switching back to English reverts text and does not loop", async () => {
  const { dom, fetchMock } = await makeDom({ bodyHtml: "<p>Approved Phrase</p>" });
  await flush(10);
  fetchMock.mockClear();
  await applyHindi(dom, fetchMock, "Approved Phrase", "अनुवादित वाक्यांश");
  expect(dom.window.document.querySelector("p").textContent).toBe("अनुवादित वाक्यांश");

  const select = dom.window.document.querySelector("#translation-sdk-widget select");
  select.value = "en";
  select.dispatchEvent(new dom.window.Event("change"));
  await flush(60);
  expect(dom.window.document.querySelector("p").textContent).toBe("Approved Phrase");

  const extractAtSettle = countExtract(fetchMock);
  const getsAtSettle = countTranslationGets(fetchMock);
  await flush(1000);
  expect(countExtract(fetchMock)).toBe(extractAtSettle);
  expect(countTranslationGets(fetchMock)).toBe(getsAtSettle);
});

test("guard: a genuine app change to a NEW phrase is still extracted (guards do not block real changes)", async () => {
  const { dom, fetchMock } = await makeDom({ bodyHtml: "<p>Approved Phrase</p>" });
  await flush(10);
  fetchMock.mockClear();
  await applyHindi(dom, fetchMock, "Approved Phrase", "अनुवादित वाक्यांश");

  const node = dom.window.document.querySelector("p").firstChild;
  node.textContent = "Brand New Phrase";
  await flush(1000);

  expect(extractedTexts(fetchMock)).toContain("Brand New Phrase");
});

test("multiple sequential route navigations each re-scan without duplicating the widget or listeners", async () => {
  const { dom } = await makeDom({ url: "https://app.example.com/authn/login" });
  dom.window.localStorage.setItem("translationSdk.lang", "hi");

  for (const route of ["/a", "/b", "/c", "/d"]) {
    dom.window.document.body.innerHTML = `<p>Page ${route}</p><div id="translation-sdk-widget-holder"></div>`;
    dom.window.history.pushState({}, "", route);
    await flush(80);
  }

  expect(dom.window.location.pathname).toBe("/d");
  expect(dom.window.document.querySelectorAll("#translation-sdk-widget").length).toBeLessThanOrEqual(1);
});
