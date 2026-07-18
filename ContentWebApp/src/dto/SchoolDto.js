/**
 * DTO for /school. GET/POST/PATCH /school use `_id`; the same SchoolResponse
 * nested inside GET /tenant/dashboard and GET /school/dashboard is dumped
 * without aliasing and uses `id` instead (platform/app/services/auth_service.py,
 * school_service.py — a real, confirmed backend inconsistency, not a guess).
 */

export class SchoolDto {
  constructor(raw) {
    this.id = raw.id;
    this.tenant_id = raw.tenant_id;
    this.name = raw.name;
    this.email = raw.email;
    this.is_active = raw.is_active !== false;
    this.created_at = raw.created_at;
    this.updated_at = raw.updated_at;
  }

  static fromApi(raw) {
    return new SchoolDto(raw);
  }

  static listFromApi(rawList) {
    return rawList.map(SchoolDto.fromApi);
  }
}
