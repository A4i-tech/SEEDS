/**
 * DTOs for the /content API. Normalizes to snake_case regardless of wire casing.
 *
 * Audio content (story/song/poem/snippet) and quizzes are different shapes —
 * mirrors the backend's AudioContent/QuizContent split instead of cramming both
 * into one object and silently dropping whichever fields don't fit.
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

class ContentBase {
  constructor(raw) {
    this.id = raw.id;
    this.type = raw.type;
    this.language = raw.language;
    this.title = new TitleText(raw.title);
    this.theme = new TitleText(raw.theme);
    this.is_pull_model = raw.is_pull_model;
    this.is_teacher_app = raw.is_teacher_app;
    this.is_deleted = raw.is_deleted;
    this.created_by = raw.created_by;
    this.school_id = raw.school_id;
  }

  get display_title() {
    return this.title.english || this.title.local || "Untitled";
  }
}

export class AudioContentDto extends ContentBase {
  constructor(raw) {
    super(raw);
    this.description = raw.description;
    this.audio_content = raw.audio_content.map((a) => new AudioTrack(a));
    this.is_processed = raw.is_processed;
    this.braille_url = raw.braille_url;
    this.braille_grade = raw.braille_grade;
  }

  /** Priority: dedicated audio track > title narration > theme narration. */
  get primary_audio_url() {
    return this.audio_content[0]?.audio_url ?? this.title.audio_url ?? this.theme.audio_url ?? null;
  }

  get duration_seconds() {
    return this.audio_content[0]?.duration_seconds ?? null;
  }
}

export class QuizContentDto extends ContentBase {
  constructor(raw) {
    super(raw);
    this.positive_marks = raw.positive_marks;
    this.negative_marks = raw.negative_marks;
    this.questions = raw.questions;
  }
}

export class ContentDto {
  static fromApi(raw) {
    return raw.type === "quiz" ? new QuizContentDto(raw) : new AudioContentDto(raw);
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
