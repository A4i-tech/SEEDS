"use strict";

// In-memory translation store: `${route}|${key}` -> { sourceText, translations: { [lang]: text } }
const store = new Map();

function storeKey(route, key) {
  return `${route}|${key}`;
}

function upsertExtracted(route, key, text) {
  const k = storeKey(route, key);
  const existing = store.get(k);
  if (existing) {
    existing.sourceText = text;
    return;
  }
  store.set(k, { sourceText: text, translations: {} });
}

function setTranslation(route, key, lang, translatedText) {
  const k = storeKey(route, key);
  const entry = store.get(k) || { sourceText: "", translations: {} };
  entry.translations[lang] = translatedText;
  store.set(k, entry);
}

function getTranslationsForRoute(route, lang) {
  const result = {};
  for (const [k, entry] of store.entries()) {
    const [entryRoute, key] = k.split("|");
    if (entryRoute !== route) continue;
    const translated = entry.translations[lang];
    if (translated) {
      result[key] = translated;
    }
  }
  return result;
}

module.exports = {
  upsertExtracted,
  setTranslation,
  getTranslationsForRoute,
};
