export const toProjectCreateRequest = ({ name, description, sourceLanguage, status }) => ({
  name,
  description,
  source_language: sourceLanguage,
  status,
});

export const toProjectUpdateRequest = ({ name, description, sourceLanguage, status }) => ({
  name,
  description,
  source_language: sourceLanguage,
  status,
});

export const toSiteCreateRequest = ({ projectId, domain, name, status }) => ({
  project_id: projectId,
  domain,
  name,
  status,
});

export const toLanguageCreateRequest = ({ name, code, direction, enabled }) => ({
  name,
  code,
  direction,
  enabled,
});

export const toSiteUpdateRequest = ({ name, domain, status }) => ({ name, domain, status });

export const toLanguageUpdateRequest = ({ name, code, direction, enabled }) => ({ name, code, direction, enabled });

export const toTranslationUpdateRequest = ({ lang, text }) => ({ lang, text });

export const toTranslationApproveRequest = ({ lang }) => ({ lang });

export const toTranslationRejectRequest = ({ lang, reason = "" }) => ({ lang, reason });

export const toExtractRequest = ({ siteId, items }) => ({ site_id: siteId, items });

export const toBulkApproveRequest = ({ route, lang }) => ({ route, lang });
