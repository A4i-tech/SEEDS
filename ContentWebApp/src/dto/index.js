// dto/index.js — re-exports all DTO parse functions and request builders

export {
  parseLoginResponse,
  parseTenantProfileResponse,
  parseMessageResponse,
  buildTenantLoginRequest,
  buildTenantRegisterRequest,
  buildTenantAnalyticsRequest,
} from "./auth.dto.js";

export {
  parseUserPublicResponse,
  parseTeacherTransferResponse,
  buildStudentCreateRequest,
  buildStudentUpdateRequest,
  buildTeacherUpdateRequest,
  buildTeacherRegisterRequest,
} from "./user.dto.js";

export {
  parseSchoolResponse,
  parseSchoolListResponse,
  parseClassroomResponse,
  buildSchoolCreateRequest,
  buildSchoolUpdateRequest,
  buildTeacherTransferRequest,
  buildSchoolAnalyticsRequest,
} from "./school.dto.js";

export {
  parseContentResponse,
  parseContentListResponse,
  parseSasUrlResponse,
  parseSasTokenResponse,
  parseJobScheduledResponse,
  parseJobStatusResponse,
  parseDeleteMatchedResponse,
  buildContentCreateRequest,
  buildContentUpdateRequest,
  buildQuizCreateRequest,
} from "./content.dto.js";

export {
  parseAnalyticsResponse,
} from "./analytics.dto.js";
