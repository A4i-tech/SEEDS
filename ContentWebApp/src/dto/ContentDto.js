/**
 * DTOs for the /content API. Normalizes to snake_case regardless of wire casing.
 */

export class TitleText {
  constructor({ english, local, audio_url } = {}) {
    this.english = english;
    this.local = local;
    this.audio_url = audio_url;
  }
}

export class AudioTrack {
  constructor({ audio_url, description, duration_seconds } = {}) {
    this.audio_url = audio_url;
    this.description = description;
    this.duration_seconds = duration_seconds;
  }
}

export class ContentDto {
  constructor(raw) {
    this.id = raw.id;
    this.type = raw.type;
    this.language = raw.language;
    this.description = raw.description;
    this.title = new TitleText(raw.title);
    this.theme = new TitleText(raw.theme);
    this.audio_content = (raw.audio_content ?? []).map((a) => new AudioTrack(a));
    this.is_deleted = raw.is_deleted;
    this.is_pull_model = raw.is_pull_model;
    this.is_teacher_app = raw.is_teacher_app;
    // quiz docs (quizData) don't have is_processed at all — false is correct for them
    this.is_processed = raw.is_processed === true;
    this.created_by = raw.created_by;
  }

  get display_title() {
    return this.title.english || this.title.local || "Untitled";
  }

  /** Priority: dedicated audio track > title narration > theme narration. */
  get primary_audio_url() {
    return this.audio_content[0]?.audio_url ?? this.title.audio_url ?? this.theme.audio_url ?? null;
  }

  get duration_seconds() {
    return this.audio_content[0]?.duration_seconds ?? null;
  }

  static fromApi(raw) {
    return new ContentDto(raw);
  }

  static listFromApi(rawList) {
    return rawList.map(ContentDto.fromApi);
  }
}

export class ContentPageDto {
  constructor({ data, pagination }) {
    this.items = ContentDto.listFromApi(data);
    this.next_cursor = pagination.next_cursor;
    this.has_more = pagination.has_more;
  }

  static fromApi(raw) {
    return new ContentPageDto(raw);
  }
}
