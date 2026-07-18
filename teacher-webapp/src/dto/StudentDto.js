/**
 * DTO for GET /student (StudentResponse — snake_case end-to-end).
 */

export class StudentDto {
  constructor(raw) {
    this.id = raw.id;
    this.name = raw.name;
    this.phone_number = raw.phone_number;
  }

  static fromApi(raw) {
    return new StudentDto(raw);
  }

  static listFromApi(rawList) {
    return rawList.map(StudentDto.fromApi);
  }
}
