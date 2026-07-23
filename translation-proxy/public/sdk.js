(function () {
  "use strict";

  var LANGUAGES = {
    en: "English",
    kn: "Kannada",
    hi: "Hindi",
    bn: "Bengali",
    ta: "Tamil",
    mr: "Marathi",
    or: "Odia",
  };
  var DEFAULT_LANG = "en";
  var LANG_STORAGE_KEY = "translationSdk.lang";
  var EXTRACT_DEBOUNCE_MS = 800;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TITLE: 1 };

  // key -> [Node, ...] for direct swap-back without re-querying the DOM
  var registry = new Map();
  var pendingKeys = new Map(); // key -> text, flushed to /extract on a debounce
  var extractTimer = null;

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

  function registerNode(node) {
    var text = node.textContent;
    if (!isTranslatable(text)) return;
    if (isSkippableElement(node.parentElement)) return;

    var key = hashText(text.trim());
    if (!node.__translationOriginal) {
      node.__translationOriginal = text;
    }

    var nodes = registry.get(key);
    if (!nodes) {
      nodes = [];
      registry.set(key, nodes);
    }
    if (nodes.indexOf(node) === -1) {
      nodes.push(node);
      pendingKeys.set(key, text.trim());
      scheduleExtractFlush();
    }
  }

  function walk(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      registerNode(node);
    }
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

    fetch("/api/translations/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items }),
    }).catch(function (err) {
      console.warn("translation-sdk: extract failed", err);
    });
  }

  function applyTranslations(lang) {
    var route = currentRoute();
    if (lang === DEFAULT_LANG) {
      registry.forEach(function (nodes) {
        nodes.forEach(function (node) {
          if (node.__translationOriginal !== undefined) {
            node.textContent = node.__translationOriginal;
          }
        });
      });
      return;
    }

    var cacheKey = "translationSdk.cache." + route + "." + lang;
    var cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      swapText(JSON.parse(cached));
      return;
    }

    var url = "/api/translations?route=" + encodeURIComponent(route) + "&lang=" + encodeURIComponent(lang);
    fetch(url)
      .then(function (r) {
        return r.json();
      })
      .then(function (translations) {
        // Only cache non-empty results. An empty {} usually means the
        // phrase hasn't been translated yet - caching that would permanently
        // skip refetching for this route+lang even after a real translation
        // becomes available later in the same browser session.
        if (Object.keys(translations).length > 0) {
          sessionStorage.setItem(cacheKey, JSON.stringify(translations));
        }
        swapText(translations);
      })
      .catch(function (err) {
        console.warn("translation-sdk: fetch translations failed", err);
      });
  }

  function swapText(translations) {
    Object.keys(translations).forEach(function (key) {
      var nodes = registry.get(key);
      if (!nodes) return;
      nodes.forEach(function (node) {
        node.textContent = translations[key];
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

  function init() {
    walk(document.body);
    createWidget();
    observeMutations();

    var lang = currentLang();
    if (lang !== DEFAULT_LANG) {
      applyTranslations(lang);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
