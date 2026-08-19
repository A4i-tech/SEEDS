/**
 * DTO for GET /teacher/me (UserPublicResponse — snake_case end-to-end).
 */

export class TeacherDto {
  constructor(raw) {
    this.id = raw.id;
    this.name = raw.name;
    this.email = raw.email;
    this.phone_number = raw.phone_number;
    this.tenant_id = raw.tenant_id;
    this.school_id = raw.school_id;
    this.tenant_name = raw.tenant_name;
  }

  static fromApi(raw) {
    return new TeacherDto(raw);
  }
}
