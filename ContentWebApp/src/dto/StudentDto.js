/**
 * DTO for /student — StudentResponse (student_controller.py): id, name,
 * phone_number, school_id, all snake_case. school_id is present on
 * create/update responses but absent (excluded, null) on the list response.
 */

export class StudentDto {
  constructor(raw) {
    this.id = raw.id;
    this.name = raw.name;
    this.phone_number = raw.phone_number;
    this.school_id = raw.school_id;
  }

  static fromApi(raw) {
    return new StudentDto(raw);
  }

  static listFromApi(rawList) {
    return rawList.map(StudentDto.fromApi);
  }
}
