const formatCreated = (createdAt) => {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  return date.toLocaleDateString();
};

export const fromSiteResponse = (doc) => {
  return {
    ...doc,
    id: doc.id,
    siteId: doc.site_id,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    created: formatCreated(doc.created_at),
    url: doc.domain ? `https://${doc.domain}` : "",
  };
};

export const fromTranslationResponse = (doc) => {
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

export const toSiteCreateRequest = ({ domain, name, status, languages }) => ({
  domain,
  name,
  status,
  languages,
});

export const toSiteUpdateRequest = ({ name, domain, status, languages }) => ({
  name,
  domain,
  status,
  languages,
});

export const toTranslationUpdateRequest = ({ lang, text }) => ({ lang, text });

export const toTranslationApproveRequest = ({ lang }) => ({ lang });

export const toTranslationRejectRequest = ({ lang, reason = "" }) => ({ lang, reason });

export const toExtractRequest = ({ siteId, items }) => ({ site_id: siteId, items });

export const toBulkApproveRequest = ({ route, lang }) => ({ route, lang });
