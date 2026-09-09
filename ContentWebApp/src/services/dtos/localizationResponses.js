const formatCreated = (createdAt) => {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  return date.toLocaleDateString();
};

export const fromProjectResponse = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc.id,
    sourceLanguage: doc.source_language,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    created: formatCreated(doc.created_at),
  };
};

export const fromSiteResponse = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc.id,
    projectId: doc.project_id,
    siteId: doc.site_id,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    created: formatCreated(doc.created_at),
    url: doc.domain ? `https://${doc.domain}` : "",
  };
};

export const fromLanguageResponse = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc.id,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
};

export const fromTranslationResponse = (doc) => {
  if (!doc) return doc;
  return {
    ...doc,
    id: doc.id,
    siteId: doc.site_id,
    sourceText: doc.source_text,
    lowConfidence: doc.low_confidence,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
  };
};
