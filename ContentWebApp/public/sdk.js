(function () {
  "use strict";

  // Idempotency guard: if the snippet is injected more than once (e.g. pasted
  // twice, or present in HTML and re-added), do nothing on later loads. Without
  // this, a second instance re-scans the DOM and re-applies translations,
  // producing duplicate widgets and duplicated/re-translated content.
  if (window.__translationSdkInitialized) return;
  window.__translationSdkInitialized = true;

  // Fallback list, used only if GET /languages fails (offline/demo resilience).
  var FALLBACK_LANGUAGES = {
    en: "English",
    hi: "Hindi",
    kn: "Kannada",
    te: "Telugu",
    ta: "Tamil",
    ml: "Malayalam",
    mr: "Marathi",
    bn: "Bengali",
    gu: "Gujarati",
    pa: "Punjabi",
    or: "Odia",
  };
  var LANGUAGES = FALLBACK_LANGUAGES;
  var DEFAULT_LANG = "en";
  var LANG_STORAGE_KEY = "translationSdk.lang";
  var EXTRACT_DEBOUNCE_MS = 800;
  var EXTRACT_CHUNK_SIZE = 500; // backend caps ExtractRequest.items at max_length=500; larger pages must be split
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TITLE: 1 };
  var ATTR_NAMES = ["placeholder", "aria-label", "title", "alt", "aria-placeholder", "value"];

  var CURRENT_SCRIPT = document.currentScript;
  var SITE_ID = (CURRENT_SCRIPT && CURRENT_SCRIPT.getAttribute("data-site-id")) || "";
  var API_BASE = (CURRENT_SCRIPT && CURRENT_SCRIPT.getAttribute("data-api-base")) || "";

  if (!SITE_ID) {
    console.warn("translation-sdk: missing data-site-id attribute on script tag");
  }

  // key -> [{kind:"text",node} | {kind:"attr",el,attr}, ...] for direct swap-back without re-querying the DOM
  var registry = new Map();
  var pendingKeys = new Map(); // key -> text, flushed to /extract on a debounce
  var extractTimer = null;

  // In-memory translation cache: (route + "." + lang) -> { key: text }.
  // Deliberately NOT sessionStorage: a persistent cache poisoned this SDK.
  // Before a route's phrases were reviewer-approved, GET /translations returned
  // the English source text as a non-empty fallback; the old code cached that
  // and short-circuited every later fetch, so real translations approved later
  // never rendered (looked like "language X doesn't translate"). An in-memory
  // cache is cleared on every reload, so the network — cheap thanks to the
  // proxy's content-based ETag/304 — always revalidates against current data.
  var memCache = new Map();

  // Persistent (localStorage) mirror of memCache, so a language already fetched
  // in an earlier page-load or route applies INSTANTLY on switch instead of
  // blocking on the network. This is safe against the stale-fallback bug
  // described above because — unlike the old persistent cache — a hit here
  // NEVER short-circuits the fetch: runApplyTranslations still revalidates in
  // the background and swaps in the fresh, gate-filtered result. The cache only
  // ever holds what the approval-gated GET returned, so it can never serve
  // unapproved data the server itself wouldn't. A short TTL bounds staleness in
  // the rare case a revalidation never runs (e.g. offline right after a switch).
  var PERSIST_PREFIX = "translationSdk.cache.";
  var PERSIST_TTL_MS = 6 * 60 * 60 * 1000; // 6h; background revalidate keeps live sessions fresh

  function persistKey(cacheKey) {
    return PERSIST_PREFIX + SITE_ID + "." + cacheKey;
  }

  function readPersist(cacheKey) {
    try {
      var raw = localStorage.getItem(persistKey(cacheKey));
      if (!raw) return null;
      var rec = JSON.parse(raw);
      if (!rec || typeof rec.t !== "number" || !rec.m) return null;
      if (Date.now() - rec.t > PERSIST_TTL_MS) {
        localStorage.removeItem(persistKey(cacheKey));
        return null;
      }
      // A hit must be a usable, non-empty set to be worth an immediate swap;
      // empty maps are never written, but guard defensively regardless.
      return Object.keys(rec.m).length > 0 ? rec.m : null;
    } catch (e) {
      return null;
    }
  }

  // Persist only entries whose key is registered for the current page. memCache
  // keeps the FULL server response untouched — the persistent mirror is purely an
  // optimization, so trimming it to on-page keys shrinks each entry from the whole
  // route map (663KB-1.5MB on large routes) to just the visible text, without
  // affecting correctness: a revalidate always refills from the full, gate-filtered
  // server response. Before any node is registered we store as-is rather than drop.
  function trimToRegistry(map) {
    if (!registry || registry.size === 0) return map;
    var out = {};
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key) && registry.has(key)) out[key] = map[key];
    }
    return out;
  }

  // Oldest SDK cache entry by its stored write-timestamp (for LRU eviction),
  // skipping `exclude` (the entry currently being written).
  function oldestPersistKey(exclude) {
    var oldestK = null, oldestT = Infinity;
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf(PERSIST_PREFIX) !== 0 || k === exclude) continue;
      var t = Infinity;
      try { var rec = JSON.parse(localStorage.getItem(k)); if (rec && typeof rec.t === "number") t = rec.t; } catch (e) {}
      if (t < oldestT) { oldestT = t; oldestK = k; }
    }
    return oldestK;
  }

  function writePersist(cacheKey, map) {
    if (!map || Object.keys(map).length === 0) return; // never cache empty/invalid
    var trimmed = trimToRegistry(map);
    if (Object.keys(trimmed).length === 0) return; // nothing on-page to persist
    var target = persistKey(cacheKey);
    var payload = JSON.stringify({ t: Date.now(), m: trimmed });
    try {
      localStorage.setItem(target, payload);
      return;
    } catch (e) {
      // Quota exceeded. Evict the OLDEST SDK cache entry (LRU) and retry, one at a
      // time, instead of purging the whole namespace — that mass purge made every
      // previously-warm language cold again. Never touch non-SDK localStorage keys.
      for (var guard = 0; guard < 64; guard++) {
        var victim = oldestPersistKey(target);
        if (!victim) break; // nothing older left to evict
        localStorage.removeItem(victim);
        try { localStorage.setItem(target, payload); return; } catch (e2) { /* keep evicting */ }
      }
      // Still no room — give up quietly; memCache keeps this session correct.
    }
  }

  function currentRoute() {
    return window.location.pathname;
  }

  function currentLang() {
    return localStorage.getItem(LANG_STORAGE_KEY) || DEFAULT_LANG;
  }

  function setCurrentLang(lang) {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  }

  function hashText(text) {
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return "t" + Math.abs(hash).toString(36);
  }

  function isTranslatable(text) {
    var trimmed = text.trim();
    if (!trimmed) return false;
    if (/^[\d\s.,%$₹-]+$/.test(trimmed)) return false;
    return true;
  }

  function isSkippableElement(el) {
    if (!el) return false;
    if (SKIP_TAGS[el.tagName]) return true;
    if (el.closest && el.closest("[data-no-translate]")) return true;
    if (el.id === "translation-sdk-widget" || (el.closest && el.closest("#translation-sdk-widget"))) return true;
    return false;
  }

  function isValueAttrTranslatable(el) {
    if (el.tagName !== "INPUT") return false;
    var t = (el.getAttribute("type") || "text").toLowerCase();
    return t === "button" || t === "submit" || t === "reset";
  }

  function registerNode(node) {
    var text = node.textContent;
    if (!isTranslatable(text)) return;
    if (isSkippableElement(node.parentElement)) return;

    // Skip nodes we already manage whose current text is a translation we
    // applied (textContent differs from the stored original). Re-registering
    // would hash the translated string as a bogus new source phrase, extract
    // it, and risk double-applying — the root cause of duplicated content.
    if (
      node.__translationOriginal !== undefined &&
      node.textContent !== node.__translationOriginal
    ) {
      return;
    }
    // __translationSelfWrite is cleared by the characterData mutation handler
    // before it ever reaches here for our own writes (swapText / revert-to-
    // English) -- if it's still true, something wrote to this node without
    // going through that path; be conservative and skip rather than risk
    // treating our own output as new source text.
    if (node.__translationSelfWrite) return;

    var key = hashText(text.trim());
    if (!node.__translationOriginal) {
      node.__translationOriginal = text;
    }

    var descriptors = registry.get(key);
    if (!descriptors) {
      descriptors = [];
      registry.set(key, descriptors);
    }
    var alreadyRegistered = descriptors.some(function (d) {
      return d.kind === "text" && d.node === node;
    });
    if (!alreadyRegistered) {
      descriptors.push({ kind: "text", node: node });
      pendingKeys.set(key, text.trim());
      scheduleExtractFlush();
    }
  }

  function registerAttr(el, attr) {
    var text = el.getAttribute(attr);
    if (!isTranslatable(text)) return;
    if (isSkippableElement(el)) return;

    el.__translationRegisteredAttrs = el.__translationRegisteredAttrs || {};
    if (el.__translationRegisteredAttrs[attr]) return; // already registered, avoid duplicate extraction

    var trimmed = text.trim();
    var key = hashText(trimmed);

    el.__translationAttrOriginal = el.__translationAttrOriginal || {};
    el.__translationAttrOriginal[attr] = text;
    el.__translationRegisteredAttrs[attr] = true;

    var descriptors = registry.get(key);
    if (!descriptors) {
      descriptors = [];
      registry.set(key, descriptors);
    }
    descriptors.push({ kind: "attr", el: el, attr: attr });
    pendingKeys.set(key, trimmed);
    scheduleExtractFlush();
  }

  function walkAttributes(root) {
    var elements = root.nodeType === Node.ELEMENT_NODE ? [root] : [];
    if (root.querySelectorAll) {
      elements = elements.concat(Array.prototype.slice.call(root.querySelectorAll("*")));
    }
    elements.forEach(function (el) {
      if (isSkippableElement(el)) return;
      ATTR_NAMES.forEach(function (attr) {
        if (!el.hasAttribute(attr)) return;
        if (attr === "value" && !isValueAttrTranslatable(el)) return;
        registerAttr(el, attr);
      });
    });
  }

  function walk(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      registerNode(node);
    }
    walkAttributes(root);
  }

  function scheduleExtractFlush() {
    if (extractTimer) clearTimeout(extractTimer);
    extractTimer = setTimeout(flushExtracted, EXTRACT_DEBOUNCE_MS);
  }

  function flushExtracted() {
    if (extractTimer) { clearTimeout(extractTimer); extractTimer = null; }
    if (pendingKeys.size === 0) return Promise.resolve();
    var route = currentRoute();
    var items = [];
    pendingKeys.forEach(function (text, key) {
      items.push({ key: key, text: text, route: route });
    });
    pendingKeys.clear();

    var requests = [];
    for (var i = 0; i < items.length; i += EXTRACT_CHUNK_SIZE) {
      var chunk = items.slice(i, i + EXTRACT_CHUNK_SIZE);
      requests.push(
        fetch(API_BASE + "/translations/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId: SITE_ID, items: chunk }),
        }).catch(function (err) {
          console.warn("translation-sdk: extract failed", err);
        })
      );
    }
    return Promise.all(requests);
  }

  // Re-entrancy / coalescing guard. Mutation-driven re-translation (dynamic
  // content, SPA route changes) can call applyTranslations many times in a
  // burst; without this, overlapping async passes could stack and — combined
  // with any DOM write that re-triggers the observer — amplify into a
  // main-thread-saturating loop. At most one pass runs at a time; the latest
  // language requested while a pass is in flight is run exactly once afterward.
  var applyInFlight = false;
  var applyPendingLang = null;

  function applyTranslations(lang) {
    if (applyInFlight) {
      applyPendingLang = lang; // coalesce burst: last request wins
      return;
    }
    applyInFlight = true;
    var release = function () {
      applyInFlight = false;
      if (applyPendingLang !== null) {
        var next = applyPendingLang;
        applyPendingLang = null;
        applyTranslations(next);
      }
    };
    var result;
    try {
      result = runApplyTranslations(lang);
    } catch (e) {
      release();
      throw e;
    }
    if (result && typeof result.then === "function") {
      result.then(release, release);
    } else {
      release();
    }
  }

  function runApplyTranslations(lang) {
    var route = currentRoute();
    if (lang === DEFAULT_LANG) {
      registry.forEach(function (descriptors) {
        descriptors.forEach(function (d) {
          if (d.kind === "attr") {
            if (d.el.__translationAttrOriginal && d.el.__translationAttrOriginal[d.attr] !== undefined) {
              var av = d.el.__translationAttrOriginal[d.attr];
              if (d.el.getAttribute(d.attr) !== av) d.el.setAttribute(d.attr, av);
            }
          } else if (d.node.__translationOriginal !== undefined) {
            var orig = d.node.__translationOriginal;
            // Remember the value we last put on this node so the observer
            // recognises (and ignores) our own write; skip the write entirely
            // when the text already matches, avoiding a needless mutation.
            d.node.__translationApplied = orig;
            if (d.node.textContent !== orig) {
              d.node.__translationSelfWrite = true;
              d.node.textContent = orig;
            }
          }
        });
      });
      return;
    }

    var cacheKey = route + "." + lang;
    var cached = memCache.get(cacheKey);
    if (cached) {
      swapText(cached);
      return;
    }

    // Persistent-cache hit: apply immediately so the switch feels instant, then
    // fall through to revalidate. We deliberately do NOT return here — the fetch
    // below still runs and overwrites with fresh, gate-filtered data. That
    // always-revalidate behavior is what makes persisting safe: a stale
    // source-text fallback can only survive until the background GET resolves.
    // Note: the persisted map is trimmed to on-page keys, so it is NOT seeded into
    // memCache here — memCache is only ever populated from the full server response
    // below, keeping the in-memory cache complete. The revalidate fetch runs
    // regardless, so correctness never depends on this immediate paint.
    var persisted = readPersist(cacheKey);
    if (persisted) {
      swapText(persisted);
    }

    // Force any pending extraction out immediately instead of waiting on the
    // debounce timer — otherwise a switch made right after page load races
    // the extractor and the runtime-translate GET below finds no source text
    // for this route yet, returning {} (looks like the switcher "does nothing").
    return flushExtracted().then(function () {
      var url =
        API_BASE +
        "/translations?siteId=" + encodeURIComponent(SITE_ID) +
        "&route=" + encodeURIComponent(route) +
        "&lang=" + encodeURIComponent(lang);
      return fetch(url)
        .then(function (r) {
          return r.json();
        })
        .then(function (translations) {
          // Only cache non-empty results. An empty {} usually means the phrase
          // hasn't been translated yet — caching it would skip refetching for
          // this route+lang for the rest of the page's life. The cache is
          // in-memory, so a reload always revalidates against current data.
          if (Object.keys(translations).length > 0) {
            memCache.set(cacheKey, translations);
            writePersist(cacheKey, translations);
          }
          swapText(translations);
        });
    }).catch(function (err) {
      console.warn("translation-sdk: fetch translations failed", err);
    });
  }

  function swapText(translations) {
    Object.keys(translations).forEach(function (key) {
      var descriptors = registry.get(key);
      if (!descriptors) return;
      var value = translations[key];
      descriptors.forEach(function (d) {
        if (d.kind === "attr") {
          if (d.el.getAttribute(d.attr) === value) return; // already applied, skip needless mutation
          d.el.setAttribute(d.attr, value);
        } else {
          // Record the value we're applying so the characterData observer can
          // recognise this write — and any later app re-assert of the same
          // value — as ours and ignore it, breaking the write -> observe ->
          // re-translate feedback loop. Skip the write when the text already
          // equals the translation: an identical textContent assignment still
          // fires a mutation, which is what fed the loop.
          d.node.__translationApplied = value;
          if (d.node.textContent === value) return;
          d.node.__translationSelfWrite = true;
          d.node.textContent = value;
        }
      });
    });
  }

  function createWidget() {
    var widget = document.createElement("div");
    widget.id = "translation-sdk-widget";
    widget.setAttribute("data-no-translate", "true");
    widget.style.cssText =
      "position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:sans-serif;";

    var select = document.createElement("select");
    select.style.cssText =
      "padding:8px 12px;border-radius:6px;border:1px solid #ccc;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15);cursor:pointer;";
    Object.keys(LANGUAGES).forEach(function (code) {
      var opt = document.createElement("option");
      opt.value = code;
      opt.textContent = LANGUAGES[code];
      select.appendChild(opt);
    });
    select.value = currentLang();
    select.addEventListener("change", function () {
      var lang = select.value;
      setCurrentLang(lang);
      applyTranslations(lang);
    });

    widget.appendChild(select);
    document.body.appendChild(widget);
  }

  function observeMutations() {
    var observer = new MutationObserver(function (mutations) {
      var newRoots = [];
      var changedTextNodes = [];

      mutations.forEach(function (m) {
        if (m.type === "childList") {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType === Node.TEXT_NODE) {
              registerNode(n);
            } else if (n.nodeType === Node.ELEMENT_NODE) {
              newRoots.push(n);
            }
          });
        } else if (m.type === "characterData") {
          // React-style reconciliation reuses a text node and assigns new
          // content in place, which childList/subtree never sees. target is
          // the CharacterData node itself here (not an added node).
          var node = m.target;
          // Ignore mutations whose resulting text is exactly what the SDK last
          // wrote to this node. Covers our own swap/revert writes AND a host
          // framework (e.g. React) re-asserting the value we applied during an
          // idempotent re-render. This is the primary guard against the
          // write -> observe -> re-translate loop; the boolean flag below is a
          // one-shot fallback that a coalesced burst of records could slip.
          if (
            node.__translationApplied !== undefined &&
            node.textContent === node.__translationApplied
          ) {
            node.__translationSelfWrite = false;
            return;
          }
          if (node.__translationSelfWrite) {
            node.__translationSelfWrite = false; // our own swap/revert write, not app content
            return;
          }
          // App-driven change: this node no longer represents whatever
          // phrase it was tracking (if any) -- treat as fresh source text
          // so it gets (re-)registered, (re-)extracted, and (re-)translated.
          node.__translationOriginal = undefined;
          changedTextNodes.push(node);
        }
      });

      newRoots.forEach(walk);
      changedTextNodes.forEach(registerNode);

      var lang = currentLang();
      if (lang !== DEFAULT_LANG && (newRoots.length > 0 || changedTextNodes.length > 0)) {
        applyTranslations(lang);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true,
    });
  }

  // --- SPA route-change support -------------------------------------------
  // Open edX (and other SPA/MFE) routers navigate via history.pushState/
  // replaceState without a full page load, so window.location.pathname can
  // change with no accompanying DOM mutation our MutationObserver would
  // catch (e.g. a route that briefly renders nothing, or whose diff the
  // observer callback hasn't processed yet). Patching history + listening
  // for popstate/hashchange lets us react to the route itself changing,
  // independent of what (if anything) the framework mutates in the DOM.
  var lastRoute = null;
  var routeChangeTimer = null;

  function checkRouteChange() {
    routeChangeTimer = null;
    var route = currentRoute();
    if (route === lastRoute) return;
    lastRoute = route;

    // Full re-walk for the new route. Safe/idempotent: registerNode and
    // registerAttr already skip nodes/attrs that are already registered, so
    // this only extracts phrases genuinely new to this route.
    walk(document.body);

    var lang = currentLang();
    if (lang !== DEFAULT_LANG) {
      applyTranslations(lang);
    }
  }

  function scheduleRouteChangeCheck() {
    // Coalesce bursts (e.g. a router calling replaceState then pushState
    // for one navigation) into a single check; checkRouteChange reads the
    // pathname at execution time, so the last event before the timer fires
    // always wins.
    if (routeChangeTimer) return;
    routeChangeTimer = setTimeout(checkRouteChange, 50);
  }

  function observeRouteChanges() {
    lastRoute = currentRoute();

    var originalPushState = window.history.pushState;
    var originalReplaceState = window.history.replaceState;

    window.history.pushState = function () {
      var result = originalPushState.apply(this, arguments);
      scheduleRouteChangeCheck();
      return result;
    };
    window.history.replaceState = function () {
      var result = originalReplaceState.apply(this, arguments);
      scheduleRouteChangeCheck();
      return result;
    };
    window.addEventListener("popstate", scheduleRouteChangeCheck);
    window.addEventListener("hashchange", scheduleRouteChangeCheck);
  }

  function loadLanguages() {
    return fetch(API_BASE + "/languages?enabledOnly=true")
      .then(function (r) {
        return r.json();
      })
      .then(function (list) {
        if (!Array.isArray(list) || list.length === 0) return FALLBACK_LANGUAGES;
        var map = {};
        list.forEach(function (lang) {
          if (lang && lang.code) map[lang.code] = lang.name || lang.code;
        });
        return Object.keys(map).length > 0 ? map : FALLBACK_LANGUAGES;
      })
      .catch(function (err) {
        console.warn("translation-sdk: fetch languages failed, using fallback list", err);
        return FALLBACK_LANGUAGES;
      });
  }

  function init() {
    walk(document.body);
    observeMutations();
    observeRouteChanges();

    loadLanguages().then(function (languages) {
      LANGUAGES = languages;
      createWidget();

      var lang = currentLang();
      if (lang !== DEFAULT_LANG) {
        applyTranslations(lang);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
