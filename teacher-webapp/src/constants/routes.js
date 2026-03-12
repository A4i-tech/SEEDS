export const ROUTES = {
  LOGIN: "/",
  REGISTER: "/register",
  CLASSROOMS: "/classrooms",
  CLASSROOM_NEW: "/classrooms/new",
  CLASSROOM_EDIT: (classroomId) => `/classrooms/edit/${classroomId}`,
  CLASSROOM_DETAIL: (classroomId) => `/classrooms/detail/${classroomId}`,
  CONTENT: "/content",
  CONTENT_DETAILS: (contentId) => `/content/${contentId}`,
};
