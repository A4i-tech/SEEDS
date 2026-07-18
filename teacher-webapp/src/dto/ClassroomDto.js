/**
 * DTOs for the /class API. Normalizes to snake_case regardless of wire casing.
 */

export class ClassMemberDto {
  constructor({ id, name, phone_number }) {
    this.id = id;
    this.name = name;
    this.phone_number = phone_number;
  }

  static fromApi(raw) {
    return new ClassMemberDto(raw);
  }
}

export class ClassroomDto {
  constructor(raw) {
    this.id = raw.id;
    this.school_id = raw.school_id;
    this.name = raw.name;
    this.teacher = raw.teacher;
    this.students = raw.students; // list view: plain student ids
    this.leaders = raw.leaders; // list view: plain leader ids
    this.content_ids = raw.content_ids;
    this.created_at = raw.created_at;
    this.updated_at = raw.updated_at;
  }

  static fromApi(raw) {
    return new ClassroomDto(raw);
  }

  static listFromApi(rawList) {
    return rawList.map(ClassroomDto.fromApi);
  }
}

export class ClassroomDetailDto extends ClassroomDto {
  constructor(raw) {
    super(raw);
    this.students = raw.students.map(ClassMemberDto.fromApi); // detail view: hydrated members
    this.leaders = raw.leaders.map(ClassMemberDto.fromApi);
  }

  static fromApi(raw) {
    return new ClassroomDetailDto(raw);
  }
}
