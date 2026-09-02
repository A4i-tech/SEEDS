(function () {
  "use strict";

  if (window.__translationSdkInitialized) return;
  window.__translationSdkInitialized = true;

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
  var EXTRACT_CHUNK_SIZE = 500;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TITLE: 1 };
  var ATTR_NAMES = ["placeholder", "aria-label", "title", "alt", "aria-placeholder", "value"];

  var CURRENT_SCRIPT = document.currentScript;
  var SITE_ID = (CURRENT_SCRIPT && CURRENT_SCRIPT.getAttribute("data-site-id")) || "";
  var API_BASE = (CURRENT_SCRIPT && CURRENT_SCRIPT.getAttribute("data-api-base")) || "";

  if (!SITE_ID) {
    console.warn("translation-sdk: missing data-site-id attribute on script tag");
  }

  var registry = new Map();
  var pendingKeys = new Map();
  var extractTimer = null;

  var memCache = new Map();

  var PERSIST_PREFIX = "translationSdk.cache.";
  var PERSIST_TTL_MS = 6 * 60 * 60 * 1000;

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
      return Object.keys(rec.m).length > 0 ? rec.m : null;
    } catch (e) {
      return null;
    }
  }

  function trimToRegistry(map) {
    if (!registry || registry.size === 0) return map;
    var out = {};
    for (var key in map) {
      if (Object.prototype.hasOwnProperty.call(map, key) && registry.has(key)) out[key] = map[key];
    }
    return out;
  }

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
    if (!map || Object.keys(map).length === 0) return;
    var trimmed = trimToRegistry(map);
    if (Object.keys(trimmed).length === 0) return;
    var target = persistKey(cacheKey);
    var payload = JSON.stringify({ t: Date.now(), m: trimmed });
    try {
      localStorage.setItem(target, payload);
      return;
    } catch (e) {
      for (var guard = 0; guard < 64; guard++) {
        var victim = oldestPersistKey(target);
        if (!victim) break;
        localStorage.removeItem(victim);
        try { localStorage.setItem(target, payload); return; } catch (e2) { }
      }
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

    if (
      node.__translationOriginal !== undefined &&
      node.textContent !== node.__translationOriginal
    ) {
      return;
    }
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
    if (el.__translationRegisteredAttrs[attr]) return;

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

  var applyInFlight = false;
  var applyPendingLang = null;

  function applyTranslations(lang) {
    if (applyInFlight) {
      applyPendingLang = lang;
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

    var persisted = readPersist(cacheKey);
    if (persisted) {
      swapText(persisted);
    }

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
          if (d.el.getAttribute(d.attr) === value) return;
          d.el.setAttribute(d.attr, value);
        } else {
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
          var node = m.target;
          if (
            node.__translationApplied !== undefined &&
            node.textContent === node.__translationApplied
          ) {
            node.__translationSelfWrite = false;
            return;
          }
          if (node.__translationSelfWrite) {
            node.__translationSelfWrite = false;
            return;
          }
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

  var lastRoute = null;
  var routeChangeTimer = null;

  function checkRouteChange() {
    routeChangeTimer = null;
    var route = currentRoute();
    if (route === lastRoute) return;
    lastRoute = route;

    walk(document.body);

    var lang = currentLang();
    if (lang !== DEFAULT_LANG) {
      applyTranslations(lang);
    }
  }

  function scheduleRouteChangeCheck() {
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
