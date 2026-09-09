(function () {
  "use strict";

  if (window.__translationSdkInitialized) return;
  window.__translationSdkInitialized = true;

  var LANGUAGES = {};
  var DEFAULT_LANG = "en";
  var LANG_STORAGE_KEY = "translationSdk.lang";
  var EXTRACT_DEBOUNCE_MS = 800;
  var EXTRACT_CHUNK_SIZE = 500;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TITLE: 1 };
  var ATTR_NAMES = ["placeholder", "aria-label", "title", "alt", "aria-placeholder", "value"];

  var CURRENT_SCRIPT = document.currentScript;
  var SITE_ID = CURRENT_SCRIPT.getAttribute("data-site-id");
  var API_BASE = CURRENT_SCRIPT.getAttribute("data-api-base");

  var registry = new Map();
  var pendingKeys = new Map();
  var extractTimer = null;

  function getDescriptors(key) {
    var descriptors = registry.get(key);
    if (!descriptors) {
      descriptors = [];
      registry.set(key, descriptors);
    }
    return descriptors;
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
    return !/^[\d\s.,%$₹-]+$/.test(trimmed);
  }

  function isSkippableElement(el) {
    if (!el) return false;
    if (SKIP_TAGS[el.tagName]) return true;
    if (el.closest("[data-no-translate]")) return true;
    if (el.closest("#translation-sdk-widget")) return true;
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
    if (node.__translationOriginal !== undefined && node.textContent !== node.__translationOriginal) return;
    if (node.__translationSelfWrite) return;

    var key = hashText(text.trim());
    if (!node.__translationOriginal) node.__translationOriginal = text;

    var descriptors = getDescriptors(key);
    var alreadyRegistered = descriptors.some(function (d) {
      return d.kind === "text" && d.node === node;
    });
    if (alreadyRegistered) return;
    descriptors.push({ kind: "text", node: node });
    pendingKeys.set(key, text.trim());
    scheduleExtractFlush();
  }

  function registerAttr(el, attr) {
    var text = el.getAttribute(attr);
    if (!isTranslatable(text)) return;
    if (isSkippableElement(el)) return;

    if (!el.__translationRegisteredAttrs) el.__translationRegisteredAttrs = {};
    if (el.__translationRegisteredAttrs[attr] !== undefined) return;

    var trimmed = text.trim();
    var key = hashText(trimmed);

    el.__translationRegisteredAttrs[attr] = text;

    var descriptors = getDescriptors(key);
    descriptors.push({ kind: "attr", el: el, attr: attr });
    pendingKeys.set(key, trimmed);
    scheduleExtractFlush();
  }

  function walkAttributes(root) {
    var elements = root.nodeType === Node.ELEMENT_NODE ? [root] : [];
    elements = elements.concat(Array.prototype.slice.call(root.querySelectorAll("*")));
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
    while ((node = walker.nextNode())) registerNode(node);
    walkAttributes(root);
  }

  function scheduleExtractFlush() {
    clearTimeout(extractTimer);
    extractTimer = setTimeout(flushExtracted, EXTRACT_DEBOUNCE_MS);
  }

  async function flushExtracted() {
    clearTimeout(extractTimer);
    extractTimer = null;
    if (pendingKeys.size === 0) return;

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
          body: JSON.stringify({ site_id: SITE_ID, items: chunk }),
        })
      );
    }
    await Promise.all(requests);
  }

  var applyInFlight = false;
  var applyPendingLang = null;

  async function applyTranslations(lang) {
    if (applyInFlight) {
      applyPendingLang = lang;
      return;
    }
    applyInFlight = true;
    await runApplyTranslations(lang);
    applyInFlight = false;
    if (applyPendingLang !== null) {
      var next = applyPendingLang;
      applyPendingLang = null;
      applyTranslations(next);
    }
  }

  async function runApplyTranslations(lang) {
    var route = currentRoute();
    if (lang === DEFAULT_LANG) {
      registry.forEach(function (descriptors) {
        applyValues(descriptors, function (d) {
          return d.kind === "attr" ? d.el.__translationRegisteredAttrs[d.attr] : d.node.__translationOriginal;
        });
      });
      return;
    }

    await flushExtracted();
    var url =
      API_BASE +
      "/translations?site_id=" + encodeURIComponent(SITE_ID) +
      "&route=" + encodeURIComponent(route) +
      "&lang=" + encodeURIComponent(lang);
    var r = await fetch(url);
    var translations = await r.json();
    swapText(translations);
  }

  function applyValues(descriptors, getValue) {
    descriptors.forEach(function (d) {
      var value = getValue(d);
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
  }

  function swapText(translations) {
    Object.keys(translations).forEach(function (key) {
      var descriptors = registry.get(key);
      if (!descriptors) return;
      applyValues(descriptors, function () {
        return translations[key];
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

  function applyCurrentLangIfNeeded() {
    var lang = currentLang();
    if (lang !== DEFAULT_LANG) applyTranslations(lang);
  }

  function checkRouteChange() {
    routeChangeTimer = null;
    var route = currentRoute();
    if (route === lastRoute) return;
    lastRoute = route;

    walk(document.body);
    applyCurrentLangIfNeeded();
  }

  function scheduleRouteChangeCheck() {
    if (routeChangeTimer) return;
    routeChangeTimer = setTimeout(checkRouteChange, 50);
  }

  function patchHistoryMethod(name) {
    var original = window.history[name];
    window.history[name] = function () {
      var result = original.apply(this, arguments);
      scheduleRouteChangeCheck();
      return result;
    };
  }

  function observeRouteChanges() {
    lastRoute = currentRoute();

    patchHistoryMethod("pushState");
    patchHistoryMethod("replaceState");
    window.addEventListener("popstate", scheduleRouteChangeCheck);
    window.addEventListener("hashchange", scheduleRouteChangeCheck);
  }

  async function loadLanguages() {
    var r = await fetch(API_BASE + "/languages?enabledOnly=true");
    var list = await r.json();
    var map = {};
    list.forEach(function (lang) {
      map[lang.code] = lang.name;
    });
    return map;
  }

  async function init() {
    walk(document.body);
    observeMutations();
    observeRouteChanges();

    LANGUAGES = await loadLanguages();
    createWidget();
    applyCurrentLangIfNeeded();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
