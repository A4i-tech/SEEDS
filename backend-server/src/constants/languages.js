"use strict";

const CANONICAL_LANGUAGES = [
  "english",
  "hindi",
  "kannada",
  "tamil",
  "telugu",
  "oriya",
  "bengali",
  "gujarati",
  "malayalam",
  "marathi",
];

const EDX_CODE_TO_SEEDS = {
  en: "english",
  "en-us": "english",
  hi: "hindi",
  "hi-in": "hindi",
  kn: "kannada",
  "kn-in": "kannada",
  ta: "tamil",
  "ta-in": "tamil",
  te: "telugu",
  "te-in": "telugu",
  or: "oriya",
  "or-in": "oriya",
  bn: "bengali",
  "bn-in": "bengali",
  gu: "gujarati",
  "gu-in": "gujarati",
  ml: "malayalam",
  "ml-in": "malayalam",
  mr: "marathi",
  "mr-in": "marathi",
};

function mapEdxCodeToSeeds(code) {
  if (!code) return null;
  return EDX_CODE_TO_SEEDS[String(code).toLowerCase()] || null;
}

const SCRIPT_RANGES = [
  { name: "latin", re: /[A-Za-z]/ },
  { name: "devanagari", re: /[ऀ-ॿ]/ },
  { name: "bengali", re: /[ঀ-৿]/ },
  { name: "gurmukhi", re: /[਀-੿]/ },
  { name: "gujarati", re: /[઀-૿]/ },
  { name: "oriya", re: /[଀-୿]/ },
  { name: "tamil", re: /[஀-௿]/ },
  { name: "telugu", re: /[ఀ-౿]/ },
  { name: "kannada", re: /[ಀ-೿]/ },
  { name: "malayalam", re: /[ഀ-ൿ]/ },
];

function detectScripts(text) {
  if (!text || typeof text !== "string") return [];
  const found = [];
  for (const s of SCRIPT_RANGES) {
    if (s.re.test(text)) found.push(s.name);
  }
  return found;
}

const SCRIPT_TO_LANG = {
  devanagari: "hindi",
  bengali: "bengali",
  gujarati: "gujarati",
  oriya: "oriya",
  tamil: "tamil",
  telugu: "telugu",
  kannada: "kannada",
  malayalam: "malayalam",
};

function inferLanguageFromScripts(scripts) {
  for (const s of scripts) {
    if (SCRIPT_TO_LANG[s]) return SCRIPT_TO_LANG[s];
  }
  return scripts.includes("latin") ? "english" : null;
}

module.exports = {
  CANONICAL_LANGUAGES,
  mapEdxCodeToSeeds,
  detectScripts,
  inferLanguageFromScripts,
};
