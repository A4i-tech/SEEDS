const toProjectRequest = ({ name, description, sourceLanguage, status }) => ({
  name,
  description,
  source_language: sourceLanguage,
  status,
});
export const toProjectCreateRequest = toProjectRequest;
export const toProjectUpdateRequest = toProjectRequest;

export const toSiteCreateRequest = ({ projectId, domain, name, status }) => ({
  project_id: projectId,
  domain,
  name,
  status,
});

const toLanguageRequest = ({ name, code, direction, enabled }) => ({ name, code, direction, enabled });
export const toLanguageCreateRequest = toLanguageRequest;
export const toLanguageUpdateRequest = toLanguageRequest;

export const toSiteUpdateRequest = ({ name, domain, status }) => ({ name, domain, status });

export const toTranslationUpdateRequest = ({ lang, text }) => ({ lang, text });

export const toTranslationApproveRequest = ({ lang }) => ({ lang });

export const toTranslationRejectRequest = ({ lang, reason = "" }) => ({ lang, reason });

export const toExtractRequest = ({ siteId, items }) => ({ site_id: siteId, items });

export const toBulkApproveRequest = ({ route, lang }) => ({ route, lang });
