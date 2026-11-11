const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const SDK_PATH = path.resolve(__dirname, "../public/sdk.js");
const API_BASE = "https://api.example.com";
const SITE_ID = "site-1";
const FRAME_ORIGIN = "https://lms.example.com";
const PARENT_ORIGIN = "https://apps.example.com";

function flush(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(fn, timeout = 3000) {
  const start = Date.now();
  for (;;) {
    const value = fn();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await flush(50);
  }
}

function defaultFetch(url) {
  const u = String(url);
  if (u.includes("/languages")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          languages: [{ code: "en", name: "English" }, { code: "hi", name: "Hindi" }],
        }),
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
}

async function makeFramed({
  bodyHtml = "<p>Hello World</p>",
  parentOrigin = PARENT_ORIGIN,
  ancestorOrigins,
  referrer = `${PARENT_ORIGIN}/learning/page`,
  attrs = { "data-follow-parent": "" },
  fetch,
} = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head></head><body>${bodyHtml}</body></html>`,
    Object.assign(
      { url: `${FRAME_ORIGIN}/xblock/v`, runScripts: "dangerously", pretendToBeVisual: true },
      referrer ? { referrer } : {}
    )
  );

  const parent = new JSDOM("<!doctype html><body></body>", { url: `${parentOrigin}/` }).window;
  parent.postMessage = jest.fn();
  Object.defineProperty(dom.window, "parent", { value: parent, configurable: true });
  if (ancestorOrigins !== undefined) {
    Object.defineProperty(dom.window.location, "ancestorOrigins", {
      value: ancestorOrigins,
      configurable: true,
    });
  }

  const fetchMock = fetch || jest.fn(defaultFetch);
  dom.window.fetch = fetchMock;

  const script = dom.window.document.createElement("script");
  script.setAttribute("data-site-id", SITE_ID);
  script.setAttribute("data-api-base", API_BASE);
  Object.keys(attrs).forEach((name) => script.setAttribute(name, attrs[name]));
  script.textContent = fs.readFileSync(SDK_PATH, "utf8");
  dom.window.document.head.appendChild(script);
  await flush(10);

  return { dom, fetchMock, parent };
}

function sendMessage(dom, { data, origin, source }) {
  dom.window.dispatchEvent(
    new dom.window.MessageEvent("message", { data, origin, source })
  );
}

afterEach(() => {
  jest.clearAllMocks();
});

test("a parent that never answers still gets a selector after the timeout", async () => {
  const { dom, parent } = await makeFramed({});

  await waitFor(() => dom.window.document.getElementById("translation-sdk-widget"), 4000);
  expect(parent.postMessage).toHaveBeenCalledWith(
    { source: "translation-sdk", type: "request-lang" },
    PARENT_ORIGIN
  );
}, 10000);

test("a message from a wrong origin or wrong source is ignored", async () => {
  const { dom, parent } = await makeFramed({});

  sendMessage(dom, {
    data: { source: "translation-sdk", type: "lang", lang: "hi" },
    origin: "https://evil.example",
    source: parent,
  });
  sendMessage(dom, {
    data: { source: "translation-sdk", type: "lang", lang: "hi" },
    origin: PARENT_ORIGIN,
    source: {},
  });
  await flush(100);

  expect(dom.window.localStorage.getItem("translationSdk.lang")).toBeNull();
});

test("a correct parent message is applied and broadcast to child frames", async () => {
  const { dom, parent } = await makeFramed({
    bodyHtml: "<p>Hello World</p>",
  });

  sendMessage(dom, {
    data: { source: "translation-sdk", type: "lang", lang: "hi" },
    origin: PARENT_ORIGIN,
    source: parent,
  });
  await flush(100);

  expect(dom.window.localStorage.getItem("translationSdk.lang")).toBe("hi");
  expect(dom.window.document.getElementById("translation-sdk-widget")).toBeNull();
});

test("a 503 extract response re-queues the chunk on the next DOM change", async () => {
  const calls = [];
  const fetchMock = jest.fn((url, opts) => {
    if (String(url).includes("/translations/extract")) {
      calls.push(JSON.parse(opts.body).items);
      return Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) });
    }
    return defaultFetch(url);
  });
  const { dom } = await makeFramed({ bodyHtml: "<p>Retry me</p>", fetch: fetchMock });
  await flush(1100);

  expect(calls.length).toBeGreaterThan(0);
  const firstKeys = calls[0].map((item) => item.key).sort();

  const p = dom.window.document.createElement("p");
  p.textContent = "Another phrase";
  dom.window.document.body.appendChild(p);
  await flush(1100);

  const resent = calls.slice(1).flat().map((item) => item.key);
  firstKeys.forEach((key) => expect(resent).toContain(key));
});

test("a 422 extract response drops the chunk instead of re-queuing it", async () => {
  const calls = [];
  const fetchMock = jest.fn((url, opts) => {
    if (String(url).includes("/translations/extract")) {
      calls.push(JSON.parse(opts.body).items);
      return Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({}) });
    }
    return defaultFetch(url);
  });
  const { dom } = await makeFramed({ bodyHtml: "<p>Drop me</p>", fetch: fetchMock });
  await flush(1100);

  expect(calls.length).toBeGreaterThan(0);
  const firstKeys = calls[0].map((item) => item.key).sort();

  const p = dom.window.document.createElement("p");
  p.textContent = "Another phrase";
  dom.window.document.body.appendChild(p);
  await flush(1100);

  const resent = calls.slice(1).flat().map((item) => item.key);
  firstKeys.forEach((key) => expect(resent).not.toContain(key));
  expect(resent.length).toBeGreaterThan(0);
});

test("staff panels are skipped only when listed in data-skip-selectors", async () => {
  const html = "<div class=\"staff-modal\"><span>Debug Data</span></div><p>Lesson Text</p>";
  const seen = [];
  const fetchMock = jest.fn((url, opts) => {
    if (String(url).includes("/translations/extract")) {
      seen.push(JSON.parse(opts.body).items.map((item) => item.text));
    }
    return defaultFetch(url);
  });

  await makeFramed({ bodyHtml: html, attrs: {}, fetch: fetchMock });
  await flush(1100);
  expect(seen.flat()).toContain("Debug Data");

  seen.length = 0;
  const fetchMock2 = jest.fn((url, opts) => {
    if (String(url).includes("/translations/extract")) {
      seen.push(JSON.parse(opts.body).items.map((item) => item.text));
    }
    return defaultFetch(url);
  });
  await makeFramed({ bodyHtml: html, attrs: { "data-skip-selectors": ".staff-modal" }, fetch: fetchMock2 });
  await flush(1100);
  expect(seen.flat()).toContain("Lesson Text");
  expect(seen.flat()).not.toContain("Debug Data");
});

test("a title attribute inside math is not extracted", async () => {
  const seen = [];
  const fetchMock = jest.fn((url, opts) => {
    if (String(url).includes("/translations/extract")) {
      seen.push(JSON.parse(opts.body).items.map((item) => item.text));
    }
    return defaultFetch(url);
  });
  await makeFramed({
    bodyHtml: "<p><math title=\"formula\"><mo>x</mo></math> visible</p>",
    fetch: fetchMock,
  });
  await flush(1100);

  expect(seen.flat()).toContain("{m0} visible");
  expect(seen.flat().join(" ")).not.toContain("formula");
});

test("trailing math gets an inserted node after the element", async () => {
  let items = [];
  const fetchMock = jest.fn((url, opts) => {
    if (String(url).includes("/translations/extract")) {
      items = JSON.parse(opts.body).items;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    }
    if (String(url).includes("/translations?")) {
      const out = {};
      items.forEach((item) => {
        if (item.text === "Answer {m0}") out[item.key] = "उत्तर {m0} है";
      });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(out) });
    }
    return defaultFetch(url);
  });
  const { dom } = await makeFramed({
    bodyHtml: "<p>Answer <math><mo>x</mo></math></p>",
    attrs: {},
    fetch: fetchMock,
  });
  await flush(1100);
  expect(items.map((item) => item.text)).toContain("Answer {m0}");

  const select = dom.window.document.querySelector("#translation-sdk-widget select");
  select.value = "hi";
  select.dispatchEvent(new dom.window.Event("change"));
  await flush(200);

  const p = dom.window.document.querySelector("p");
  const math = p.querySelector("math");
  expect(math).not.toBeNull();
  expect(p.textContent).toBe("उत्तर " + math.textContent + " है");
});
