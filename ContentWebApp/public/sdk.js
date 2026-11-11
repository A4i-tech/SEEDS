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
  var BULLET_ONLY = /^[\s·•*–—-]+$/;
  var MATHJAX_INLINE = /(\[mathjaxinline\][\s\S]*?\[\/mathjaxinline\])/i;
  var LABEL_END = /:\s*$/;
  var MATH_TOKEN = /\{m\d+\}/g;
  var MESSAGE_SOURCE = "translation-sdk";
  var PARENT_REPLY_TIMEOUT_MS = 2000;
  var PARENT_REQUEST_RETRY_MS = 250;

  var CURRENT_SCRIPT = document.currentScript;
  var SITE_ID = CURRENT_SCRIPT.getAttribute("data-site-id");
  var API_BASE = CURRENT_SCRIPT.getAttribute("data-api-base");
  var SKIP_SELECTORS = (CURRENT_SCRIPT.getAttribute("data-skip-selectors") || "").split(",").map(function (s) {
    return s.trim();
  }).filter(Boolean).join(",");
  var FOLLOW_PARENT = CURRENT_SCRIPT.getAttribute("data-follow-parent");

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
    if (SKIP_SELECTORS && el.closest(SKIP_SELECTORS)) return true;
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

  function pushText(node, parts) {
    var chunks = node.textContent.split(MATHJAX_INLINE);
    for (var i = 0; i < chunks.length; i++) {
      if (!chunks[i]) continue;
      if (i % 2 === 1) {
        parts.push({ kind: "math", lit: chunks[i] });
      } else {
        parts.push({ kind: "text", node: node, text: chunks[i] });
      }
    }
  }

  function pushInline(el, parts) {
    Array.prototype.forEach.call(el.childNodes, function (child) {
      if (child.nodeType === Node.TEXT_NODE) {
        pushText(child, parts);
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
        pushText(child, parts);
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
        text += "{m" + index + "}";
        index++;
      } else {
        text += part.text;
      }
    });
    return text;
  }

  function samePart(a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === "math") return a.el === b.el && a.lit === b.lit;
    return a.node === b.node && a.text === b.text;
  }

  function sameRun(left, right) {
    return left.length === right.length && left.every(function (part, i) {
      return samePart(part, right[i]);
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
    descriptors.push({ kind: "run", parts: parts, inserted: [] });
    pendingKeys.set(key, text.trim());
    scheduleExtractFlush();
  }

  function setText(node, text) {
    node.__translationSelfWrite = true;
    if (node.textContent !== text) node.textContent = text;
  }

  function removeInserted(d) {
    d.inserted.forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    d.inserted = [];
  }

  function insertText(d, gap, text) {
    var els = [];
    d.parts.forEach(function (part) {
      if (part.kind === "math" && part.el) els.push(part.el);
    });
    var target = gap < els.length ? els[gap] : els[els.length - 1];
    var node = document.createTextNode(text);
    node.__translationOriginal = "";
    target.parentNode.insertBefore(node, gap < els.length ? target : target.nextSibling);
    d.inserted.push(node);
  }

  function translateRun(d, value) {
    var tokens = [];
    d.parts.forEach(function (part) {
      if (part.kind === "math") tokens.push(part);
    });
    var found = value.match(/\{m\d+\}/g) || [];
    var expected = [];
    for (var t = 0; t < tokens.length; t++) expected.push("{m" + t + "}");
    if (found.join("|") !== expected.join("|")) {
      restoreRun(d);
      return false;
    }
    var segments = value.split(MATH_TOKEN);
    removeInserted(d);
    var elIdx = [];
    tokens.forEach(function (tok, i) {
      if (tok.el) elIdx.push(i);
    });
    function rangeText(from, to) {
      var out = "";
      for (var i = from; i <= to; i++) {
        out += segments[i];
        if (i < tokens.length && tokens[i].lit !== undefined) out += tokens[i].lit;
      }
      return out;
    }
    function elGapIndex(part) {
      var gap = 0;
      for (var i = 0; i < d.parts.length; i++) {
        if (d.parts[i] === part) return gap;
        if (d.parts[i].kind === "math" && d.parts[i].el) gap++;
      }
      return gap;
    }
    var gaps = [];
    var E = elIdx.length;
    for (var g = 0; g <= E; g++) gaps.push([]);
    d.parts.forEach(function (part) {
      if (part.kind === "text") gaps[elGapIndex(part)].push(part.node);
    });
    gaps.forEach(function (nodes, g) {
      var uniq = [];
      nodes.forEach(function (node) {
        if (uniq.indexOf(node) === -1) uniq.push(node);
      });
      var L = g === 0 ? 0 : elIdx[g - 1] + 1;
      var R = g < E ? elIdx[g] : tokens.length;
      var text = rangeText(L, R);
      if (uniq.length) {
        setText(uniq[0], text);
        uniq.slice(1).forEach(function (node) { setText(node, ""); });
      } else if (text.trim()) {
        insertText(d, g, text);
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
        if (response.status >= 500 || response.status === 429) {
          restorePending(chunk);
          console.warn("translation-sdk: extract request failed with status " + response.status + ", will retry on next change");
        } else {
          console.warn("translation-sdk: extract request rejected with status " + response.status + " (dropping chunk)");
        }
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

    if (window.parent !== window && FOLLOW_PARENT !== null && (await handshakeWithParent(parentOrigin()))) return;

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
