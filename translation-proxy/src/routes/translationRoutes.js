"use strict";

const express = require("express");
const store = require("../translationStore");

const router = express.Router();

// POST /api/translations/extract  { items: [{ key, text, route }] }
router.post("/extract", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  for (const item of items) {
    if (!item?.key || !item?.text || !item?.route) continue;
    store.upsertExtracted(item.route, item.key, item.text);
  }
  res.status(202).json({ received: items.length });
});

// GET /api/translations?route=&lang= -> { key: translatedText }
router.get("/", (req, res) => {
  const { route, lang } = req.query;
  if (!route || !lang) {
    return res.status(400).json({ error: "route and lang are required" });
  }
  res.json(store.getTranslationsForRoute(route, lang));
});

// POST /api/translations/seed  { route, key, lang, translatedText } - manual seeding for demo/testing
router.post("/seed", (req, res) => {
  const { route, key, lang, translatedText } = req.body || {};
  if (!route || !key || !lang || !translatedText) {
    return res.status(400).json({ error: "route, key, lang, translatedText are required" });
  }
  store.setTranslation(route, key, lang, translatedText);
  res.status(200).json({ ok: true });
});

module.exports = router;
