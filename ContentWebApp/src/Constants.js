export const SEEDS_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";
export const STORAGE_ACCOUNT_NAME =
  process.env.REACT_APP_STORAGE_ACCOUNT_NAME ||
  "";
export const AUDIO_BASE_URL = `https://${STORAGE_ACCOUNT_NAME}.blob.core.windows.net/output-original`;
export const USER_ROLES = {
  TEACHER: "teacher",
  CONTENT_CREATOR: "content_creator",
  TENANT: "tenant",
  SCHOOL_ADMIN: "school_admin",
  TEXTBOOK_REMEDIATION_VOLUNTEER: "textbook_remediation_volunteer",
};
export const TAB_ROLES = {
  content: [USER_ROLES.TEACHER, USER_ROLES.CONTENT_CREATOR, USER_ROLES.TENANT, USER_ROLES.SCHOOL_ADMIN],
  remediation: [
    USER_ROLES.TENANT,
    USER_ROLES.SCHOOL_ADMIN,
    USER_ROLES.CONTENT_CREATOR,
    USER_ROLES.TEXTBOOK_REMEDIATION_VOLUNTEER,
  ],
  registration: [USER_ROLES.TENANT, USER_ROLES.SCHOOL_ADMIN],
  analytics: [USER_ROLES.TENANT, USER_ROLES.SCHOOL_ADMIN],
  localization: [USER_ROLES.TENANT],
};
export const ME_URL_BY_ROLE = {
  [USER_ROLES.SCHOOL_ADMIN]: `${SEEDS_URL}/school/admin/me`,
  [USER_ROLES.TEACHER]: `${SEEDS_URL}/teacher/me`,
  [USER_ROLES.CONTENT_CREATOR]: `${SEEDS_URL}/teacher/me`,
  [USER_ROLES.TEXTBOOK_REMEDIATION_VOLUNTEER]: `${SEEDS_URL}/textbook-remediation/me`,
  [USER_ROLES.TENANT]: `${SEEDS_URL}/tenant/me`,
};
