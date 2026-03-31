export const ROUTES = {
  LOGIN: "/",
  CLASSROOMS: "/classrooms",
  CLASSROOM_NEW: "/classrooms/new",
  CLASSROOM_EDIT: (classroomId) => `/classrooms/edit/${classroomId}`,
  CLASSROOM_DETAIL: (classroomId) => `/classrooms/detail/${classroomId}`,
  CONTENT: "/content",
  CONTENT_PLAYBACK: (classroomId) => `/classrooms/${classroomId}/content`,
  CONTENT_DETAILS: (contentId) => `/content/${contentId}`,
};
