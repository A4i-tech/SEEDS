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
    if (pendingKeys.size === 0) return;
    var route = currentRoute();
    var items = [];
    pendingKeys.forEach(function (text, key) {
      items.push({ key: key, text: text, route: route });
    });
    pendingKeys.clear();

    fetch(API_BASE + "/translations/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: SITE_ID, items: items }),
    }).catch(function (err) {
      console.warn("translation-sdk: extract failed", err);
    });
  }

  function applyTranslations(lang) {
    var route = currentRoute();
    if (lang === DEFAULT_LANG) {
      registry.forEach(function (descriptors) {
        descriptors.forEach(function (d) {
          if (d.kind === "attr") {
            if (d.el.__translationAttrOriginal && d.el.__translationAttrOriginal[d.attr] !== undefined) {
              d.el.setAttribute(d.attr, d.el.__translationAttrOriginal[d.attr]);
            }
          } else if (d.node.__translationOriginal !== undefined) {
            d.node.textContent = d.node.__translationOriginal;
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

    var url =
      API_BASE +
      "/translations?siteId=" + encodeURIComponent(SITE_ID) +
      "&route=" + encodeURIComponent(route) +
      "&lang=" + encodeURIComponent(lang);
    fetch(url)
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
        }
        swapText(translations);
      })
      .catch(function (err) {
        console.warn("translation-sdk: fetch translations failed", err);
      });
  }

  function swapText(translations) {
    Object.keys(translations).forEach(function (key) {
      var descriptors = registry.get(key);
      if (!descriptors) return;
      descriptors.forEach(function (d) {
        if (d.kind === "attr") {
          d.el.setAttribute(d.attr, translations[key]);
        } else {
          d.node.textContent = translations[key];
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
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (n) {
          if (n.nodeType === Node.TEXT_NODE) {
            registerNode(n);
          } else if (n.nodeType === Node.ELEMENT_NODE) {
            newRoots.push(n);
          }
        });
      });
      newRoots.forEach(walk);

      var lang = currentLang();
      if (lang !== DEFAULT_LANG && newRoots.length > 0) {
        applyTranslations(lang);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
