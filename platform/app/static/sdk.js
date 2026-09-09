(function () {
  "use strict";

  var script = document.currentScript;
  var siteId = script.getAttribute("data-site-id");
  var apiBase = script.getAttribute("data-api-base");
  var lang = script.getAttribute("data-lang") || navigator.language || "en";
  var route = window.location.pathname;

  function hashText(text) {
    var hash = 0;
    for (var i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0;
    }
    return "t" + (hash >>> 0).toString(16);
  }

  function textNodes() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var text = node.nodeValue.trim();
        if (!text || node.parentElement.closest("script,style")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    var node;
    while ((node = walker.nextNode())) {
      nodes.push(node);
    }
    return nodes;
  }

  function apply(translations) {
    textNodes().forEach(function (node) {
      var key = hashText(node.nodeValue.trim());
      var translated = translations[key];
      if (translated) {
        node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), translated);
      }
    });
  }

  function fetchTranslations() {
    var url =
      apiBase +
      "/translations?site_id=" +
      encodeURIComponent(siteId) +
      "&route=" +
      encodeURIComponent(route) +
      "&lang=" +
      encodeURIComponent(lang);
    fetch(url)
      .then(function (res) {
        return res.json();
      })
      .then(apply);
  }

  function extract() {
    var items = textNodes().map(function (node) {
      var text = node.nodeValue.trim();
      return { key: hashText(text), text: text, route: route, source_lang: "en" };
    });
    if (!items.length) {
      return;
    }
    fetch(apiBase + "/translations/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, items: items }),
    }).then(fetchTranslations);
  }

  if (siteId && apiBase) {
    extract();
  }
})();
