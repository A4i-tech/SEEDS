(function () {
  "use strict";

  if (window.__translationSdkInitialized) return;
  window.__translationSdkInitialized = true;

  var LANGUAGES = {};
  var DEFAULT_LANG = "en";
  var LANG_STORAGE_KEY = "translationSdk.lang";
  var EXTRACT_DEBOUNCE_MS = 800;
  var EXTRACT_CHUNK_SIZE = 500;
  var FETCH_TIMEOUT_MS = 8000;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TITLE: 1 };
  var ATTR_NAMES = ["placeholder", "aria-label", "title", "alt", "aria-placeholder", "value"];
  var STAFF_PANELS = ".wrap-instructor-info, .xqa-modal, .staff-modal, .history-modal, .instructor-info-action";
  var BULLET_ONLY = /^[\s·•*–—-]+$/;
  var LABEL_END = /:\s*$/;
  var MATH_TOKEN = /\{m\d+\}/g;
  var MATH_DELIMITER = /\[\/?mathjaxinline\]/i;
  var MESSAGE_SOURCE = "translation-sdk";
  var PARENT_REPLY_TIMEOUT_MS = 2000;
  var PARENT_REQUEST_RETRY_MS = 250;

  var CURRENT_SCRIPT = document.currentScript;
  var SITE_ID = CURRENT_SCRIPT.getAttribute("data-site-id");
  var API_BASE = CURRENT_SCRIPT.getAttribute("data-api-base");

  var registry = new Map();
  var pendingKeys = new Map();
  var extractTimer = null;

  function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, Object.assign({}, options, { signal: controller.signal })).finally(function () {
      clearTimeout(timer);
    });
  }

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
    if (el.closest(STAFF_PANELS)) return true;
    return false;
  }

  function isValueAttrTranslatable(el) {
    if (el.tagName !== "INPUT") return false;
    var t = (el.getAttribute("type") || "text").toLowerCase();
    return t === "button" || t === "submit" || t === "reset";
  }

  function registerNode(node) {
    var text = node.textContent;
    if (!isTranslatable(text)) return false;
    if (isSkippableElement(node.parentElement)) return false;
    if (node.__translationOriginal !== undefined && node.textContent !== node.__translationOriginal) return false;
    if (node.__translationSelfWrite) return false;

    var key = hashText(text.trim());
    if (node.__translationOriginal === undefined) node.__translationOriginal = text;

    var descriptors = getDescriptors(key);
    var alreadyRegistered = descriptors.some(function (d) {
      return d.kind === "text" && d.node === node;
    });
    if (alreadyRegistered) return false;
    descriptors.push({ kind: "text", node: node });
    pendingKeys.set(key, text.trim());
    scheduleExtractFlush();
    return true;
  }

  function hasTextChild(el) {
    return Array.prototype.some.call(el.childNodes, function (node) {
      return node.nodeType === Node.TEXT_NODE;
    });
  }

  function isMathElement(el) {
    var name = el.tagName.toUpperCase();
    return name === "MATH" || name === "MJX-CONTAINER";
  }

  function joinerKind(el) {
    if (hasTextChild(el) && !el.textContent.trim()) return "blank";
    if (BULLET_ONLY.test(el.textContent) && el.textContent.trim()) return "bullet";
    if (!el.firstElementChild && LABEL_END.test(el.textContent.trim())) return "label";
    return "";
  }

  function pushInline(el, parts) {
    Array.prototype.forEach.call(el.childNodes, function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!MATH_DELIMITER.test(child.textContent)) parts.push({ kind: "text", node: child });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (isMathElement(child)) parts.push({ kind: "math", el: child });
        else if (!isSkippableElement(child)) pushInline(child, parts);
      }
    });
  }

  function collectRuns(el, runs) {
    var parts = [];
    function flush() {
      if (parts.some(function (part) { return part.kind === "text"; })) runs.push(parts.slice());
      parts = [];
    }
    Array.prototype.forEach.call(el.childNodes, function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (!MATH_DELIMITER.test(child.textContent)) parts.push({ kind: "text", node: child });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (isSkippableElement(child)) return;
        if (isMathElement(child)) {
          parts.push({ kind: "math", el: child });
        } else if (joinerKind(child)) {
          pushInline(child, parts);
        } else {
          flush();
          collectRuns(child, runs);
        }
      }
    });
    flush();
  }

  function runText(parts) {
    var text = "";
    var index = 0;
    parts.forEach(function (part) {
      if (part.kind === "math") {
        text += "{m" + index++ + "}";
      } else {
        text += part.node.textContent;
      }
    });
    return text;
  }

  function sameRun(left, right) {
    return left.length === right.length && left.every(function (part, i) {
      if (part.kind !== right[i].kind) return false;
      return part.kind === "text" ? part.node === right[i].node : part.el === right[i].el;
    });
  }

  function registerRun(parts) {
    var text = runText(parts);
    var words = text.replace(MATH_TOKEN, " ");
    if (!isTranslatable(words)) return;
    var clean = parts.every(function (part) {
      if (part.kind !== "text") return true;
      if (part.node.__translationSelfWrite) return false;
      return part.node.__translationOriginal === undefined || part.node.textContent === part.node.__translationOriginal;
    });
    if (!clean) return;
    if (parts.length === 1) {
      registerNode(parts[0].node);
      return;
    }
    parts.forEach(function (part) {
      if (part.kind === "text" && part.node.__translationOriginal === undefined) {
        part.node.__translationOriginal = part.node.textContent;
      }
    });
    var key = hashText(text.trim());
    var descriptors = getDescriptors(key);
    var registered = descriptors.some(function (d) {
      return d.kind === "run" && sameRun(d.parts, parts);
    });
    if (registered) return;
    descriptors.push({ kind: "run", parts: parts });
    pendingKeys.set(key, text.trim());
    scheduleExtractFlush();
  }

  function setText(node, text) {
    node.__translationSelfWrite = true;
    if (node.textContent !== text) node.textContent = text;
  }

  function removeInserted(d) {
    (d.inserted || []).forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    d.inserted = [];
  }

  function insertText(d, gap, text) {
    var math = d.parts.filter(function (part) { return part.kind === "math"; });
    var anchor = gap < math.length ? math[gap].el : math[math.length - 1].el.nextSibling;
    var node = document.createTextNode(text);
    node.__translationOriginal = "";
    anchor.parentNode.insertBefore(node, anchor);
    d.inserted.push(node);
  }

  function translateRun(d, value) {
    removeInserted(d);
    var math = d.parts.filter(function (part) { return part.kind === "math"; });
    var segments = String(value).split(MATH_TOKEN);
    if (segments.length !== math.length + 1) return false;
    var gaps = [];
    for (var i = 0; i <= math.length; i++) gaps.push([]);
    var seen = 0;
    d.parts.forEach(function (part) {
      if (part.kind === "math") {
        seen++;
      } else {
        gaps[seen].push(part.node);
      }
    });
    gaps.forEach(function (nodes, gap) {
      if (nodes.length) {
        setText(nodes[0], segments[gap]);
        nodes.slice(1).forEach(function (node) { setText(node, ""); });
      } else if (segments[gap].trim()) {
        insertText(d, gap, segments[gap]);
      }
    });
    return true;
  }

  function restoreRun(d) {
    removeInserted(d);
    d.parts.forEach(function (part) {
      if (part.kind === "text" && part.node.__translationOriginal !== undefined) {
        setText(part.node, part.node.__translationOriginal);
      }
    });
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
      if (isSkippableElement(el) || el.closest("math")) return;
      ATTR_NAMES.forEach(function (attr) {
        if (!el.hasAttribute(attr)) return;
        if (attr === "value" && !isValueAttrTranslatable(el)) return;
        registerAttr(el, attr);
      });
    });
  }

  function walk(root) {
    var runs = [];
    collectRuns(root, runs);
    runs.forEach(registerRun);
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
      requests.push(extractChunk(items.slice(i, i + EXTRACT_CHUNK_SIZE)));
    }
    await Promise.all(requests);
  }

  function restorePending(chunk) {
    chunk.forEach(function (item) {
      pendingKeys.set(item.key, item.text);
    });
  }

  function extractChunk(chunk) {
    return fetchWithTimeout(API_BASE + "/translations/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: SITE_ID, items: chunk }),
    }).then(function (response) {
      if (!response.ok) {
        restorePending(chunk);
        console.warn("translation-sdk: extract request rejected with status " + response.status);
      }
    }).catch(function (err) {
      restorePending(chunk);
      console.warn("translation-sdk: extract request failed, will retry on next change", err);
    });
  }

  var applyInFlight = false;
  var applyPendingLang = null;

  async function applyTranslations(lang) {
    if (applyInFlight) {
      applyPendingLang = lang;
      return;
    }
    applyInFlight = true;
    try {
      await runApplyTranslations(lang);
    } finally {
      applyInFlight = false;
    }
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
        descriptors.forEach(function (d) {
          if (d.kind === "run") {
            restoreRun(d);
          } else {
            applyValues([d], function () {
              return d.kind === "attr" ? d.el.__translationRegisteredAttrs[d.attr] : d.node.__translationOriginal;
            });
          }
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
    try {
      var r = await fetchWithTimeout(url, {});
      var translations = await r.json();
      swapText(translations);
    } catch (err) {
      console.warn("translation-sdk: /translations request errored, skipping apply", err);
    }
  }

  function applyValues(descriptors, getValue) {
    descriptors.forEach(function (d) {
      var value = getValue(d);
      if (value === undefined) return;
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
      descriptors.forEach(function (d) {
        if (d.kind === "run") {
          var applied = translateRun(d, translations[key]);
          if (!applied) console.warn("translation-sdk: math token mismatch, keeping English for " + key);
        } else {
          applyValues([d], function () {
            return translations[key];
          });
        }
      });
    });
  }

  function isFramed() {
    return window.parent !== window;
  }

  function parentOrigin() {
    var ancestors = window.location.ancestorOrigins;
    if (ancestors && ancestors.length) return ancestors[0];
    return document.referrer ? new URL(document.referrer).origin : "";
  }

  var childOrigins = new Map();

  function childFrames() {
    return Array.prototype.filter.call(document.querySelectorAll("iframe"), function (frame) {
      return frame.contentWindow;
    });
  }

  function sendLang(target, origin) {
    target.postMessage({ source: MESSAGE_SOURCE, type: "lang", lang: currentLang() }, origin);
  }

  function broadcastLang() {
    childOrigins.forEach(function (origin, target) {
      sendLang(target, origin);
    });
  }

  function answerChildRequests() {
    window.addEventListener("message", function (event) {
      var data = event.data;
      if (!data || data.source !== MESSAGE_SOURCE || data.type !== "request-lang") return;
      childFrames().forEach(function (frame) {
        if (frame.contentWindow === event.source) {
          childOrigins.set(event.source, event.origin);
          sendLang(event.source, event.origin);
        }
      });
    });
  }

  function followParentLang() {
    return handshakeWithParent(parentOrigin());
  }

  function handshakeWithParent(origin) {
    return new Promise(function (resolve) {
      var retry = null;
      var timeout = null;
      function cleanup() {
        clearInterval(retry);
        clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
      }
      function onMessage(event) {
        var data = event.data;
        if (event.source === window.parent && event.origin === origin && data.type === "lang") {
          cleanup();
          setCurrentLang(data.lang);
          applyTranslations(data.lang);
          broadcastLang();
          resolve(true);
        }
      }
      function ask() {
        window.parent.postMessage({ source: MESSAGE_SOURCE, type: "request-lang" }, origin);
      }
      window.addEventListener("message", onMessage);
      ask();
      retry = setInterval(ask, PARENT_REQUEST_RETRY_MS);
      timeout = setTimeout(function () {
        cleanup();
        console.warn("translation-sdk: parent did not answer the language request, using its own selector");
        resolve(false);
      }, PARENT_REPLY_TIMEOUT_MS);
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
      broadcastLang();
    });

    widget.appendChild(select);
    document.body.appendChild(widget);
  }

  function observeMutations() {
    var observer = new MutationObserver(function (mutations) {
      var newRoots = [];
      var changedTextNodes = [];
      var reappliedBareText = false;

      mutations.forEach(function (m) {
        if (m.type === "childList") {
          m.addedNodes.forEach(function (n) {
            if (n.nodeType === Node.TEXT_NODE) {
              if (registerNode(n)) reappliedBareText = true;
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
      if (lang !== DEFAULT_LANG && (newRoots.length > 0 || changedTextNodes.length > 0 || reappliedBareText)) {
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
    try {
      var r = await fetchWithTimeout(
        API_BASE + "/v1/languages?site_id=" + encodeURIComponent(SITE_ID),
        {}
      );
      var body = await r.json();
      var map = {};
      body.languages.forEach(function (lang) {
        map[lang.code] = lang.name;
      });
      return map;
    } catch (err) {
      console.warn("translation-sdk: failed to load languages, widget will be hidden", err);
      return {};
    }
  }

  async function init() {
    walk(document.body);
    observeMutations();
    observeRouteChanges();
    answerChildRequests();

    if (isFramed() && (await followParentLang())) return;

    LANGUAGES = await loadLanguages();
    if (Object.keys(LANGUAGES).length > 0) {
      createWidget();
      applyCurrentLangIfNeeded();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
