/**
 * DTO for UserPublicResponse payloads (snake_case): GET /tenant/me,
 * GET /school/admin/me, GET /teacher/me, PATCH /teacher/{id}, and the nested
 * `teacher` object in POST /school/transfer's response.
 */

export class TeacherDto {
  constructor(raw) {
    this.id = raw.id;
    this.role = raw.role;
    this.name = raw.name;
    this.email = raw.email;
    this.phone_number = raw.phone_number;
    this.tenant_id = raw.tenant_id;
    this.school_id = raw.school_id;
    this.tenant_name = raw.tenant_name;
    this.is_active = raw.is_active !== false;
    this.created_at = raw.created_at;
    this.updated_at = raw.updated_at;
  }

  static fromApi(raw) {
    return new TeacherDto(raw);
  }

  static listFromApi(rawList) {
    return rawList.map(TeacherDto.fromApi);
  }
}

/**
 * DTO for GET /school/teachers — a raw dict shape ({id, name, phone_number, role})
 * from school_service.list_teachers_by_school, distinct from UserPublicResponse.
 */
export class SchoolTeacherDto {
  constructor(raw) {
    this.id = raw.id;
    this.name = raw.name;
    this.phone_number = raw.phone_number;
    this.role = raw.role;
  }

  static fromApi(raw) {
    return new SchoolTeacherDto(raw);
  }

  static listFromApi(rawList) {
    return rawList.map(SchoolTeacherDto.fromApi);
  }
}
