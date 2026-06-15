export const ROUTES = {
  LOGIN: "/",
  CLASSROOMS: "/classrooms",
  CLASSROOM_NEW: "/classrooms/new",
  CLASSROOM_EDIT: (classroomId) => `/classrooms/edit/${classroomId}`,
  CLASSROOM_DETAIL: (classroomId) => `/classrooms/detail/${classroomId}`,
  CONTENT_DETAILS: (contentId) => `/content/${contentId}`,
};
