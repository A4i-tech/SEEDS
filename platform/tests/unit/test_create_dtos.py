"""Unit tests for camelCase create DTOs — verifies model_dump() produces correct DB keys."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.requests.content_requests import ContentCreate, QuizCreate
from app.models.requests.school_requests import ClassroomCreate, SchoolCreate

# ---------------------------------------------------------------------------
# ClassroomCreate
# ---------------------------------------------------------------------------


class TestClassroomCreate:
    def test_dump_keys_are_camel_case(self):
        dto = ClassroomCreate(schoolId="s1", name="Class A", teacher="t1")
        d = dto.model_dump()
        assert set(d.keys()) == {"schoolId", "name", "teacher", "students", "leaders", "contentIds"}

    def test_no_snake_case_keys_leak(self):
        dto = ClassroomCreate(schoolId="s1", name="X", teacher="t1")
        d = dto.model_dump()
        assert "school_id" not in d
        assert "content_ids" not in d

    def test_defaults(self):
        dto = ClassroomCreate(schoolId="s1", name="X", teacher="t1")
        assert dto.students == []
        assert dto.leaders == []
        assert dto.contentIds == []

    def test_missing_required_school_id_raises(self):
        with pytest.raises(ValidationError):
            ClassroomCreate(name="X", teacher="t1")  # schoolId missing

    def test_missing_required_teacher_raises(self):
        with pytest.raises(ValidationError):
            ClassroomCreate(schoolId="s1", name="X")  # teacher missing


# ---------------------------------------------------------------------------
# SchoolCreate
# ---------------------------------------------------------------------------


class TestSchoolCreate:
    def test_dump_keys_are_camel_case(self):
        dto = SchoolCreate(tenantId="t1", name="S", email="s@s.com")
        d = dto.model_dump()
        assert set(d.keys()) == {"tenantId", "name", "email", "password", "isActive"}

    def test_no_snake_case_keys_leak(self):
        dto = SchoolCreate(tenantId="t1", name="S", email="s@s.com")
        d = dto.model_dump()
        assert "tenant_id" not in d
        assert "is_active" not in d
        assert "hashed_password" not in d

    def test_defaults(self):
        dto = SchoolCreate(tenantId="t1", name="S", email="s@s.com")
        assert dto.isActive is True
        assert dto.password is None

    def test_missing_required_tenant_id_raises(self):
        with pytest.raises(ValidationError):
            SchoolCreate(name="S", email="s@s.com")

    def test_password_round_trips(self):
        dto = SchoolCreate(tenantId="t1", name="S", email="s@s.com", password="hashed")
        assert dto.model_dump()["password"] == "hashed"


# ---------------------------------------------------------------------------
# ContentCreate
# ---------------------------------------------------------------------------


class TestContentCreate:
    def _minimal(self, **kwargs) -> ContentCreate:
        return ContentCreate(tenantId="t1", type="Story", language="english", **kwargs)

    def test_dump_keys_are_camel_case(self):
        d = self._minimal().model_dump()
        camel_expected = {
            "tenantId", "type", "language", "createdBy", "schoolId",
            "title", "theme", "audioContent", "description",
            "isPullModel", "isTeacherApp", "isDeleted", "isProcessed",
            "creation_time", "version",
        }
        assert set(d.keys()) == camel_expected

    def test_no_snake_case_keys_leak(self):
        d = self._minimal().model_dump()
        assert "tenant_id" not in d
        assert "is_deleted" not in d
        assert "is_processed" not in d
        assert "audio_content" not in d
        assert "is_pull_model" not in d
        assert "is_teacher_app" not in d

    def test_creation_time_stays_snake_case(self):
        # DB stores this field as snake_case — intentional exception
        d = self._minimal().model_dump()
        assert "creation_time" in d
        assert "creationTime" not in d

    def test_defaults(self):
        dto = self._minimal()
        assert dto.createdBy == ""
        assert dto.schoolId is None
        assert dto.isDeleted is False
        assert dto.isProcessed is False
        assert dto.isPullModel is False
        assert dto.isTeacherApp is False
        assert dto.audioContent == []
        assert dto.version == "v3"

    def test_missing_tenant_id_raises(self):
        with pytest.raises(ValidationError):
            ContentCreate(type="Story", language="english")

    def test_missing_type_raises(self):
        with pytest.raises(ValidationError):
            ContentCreate(tenantId="t1", language="english")


# ---------------------------------------------------------------------------
# QuizCreate
# ---------------------------------------------------------------------------


class TestQuizCreate:
    def _minimal(self, **kwargs) -> QuizCreate:
        return QuizCreate(tenantId="t1", type="quiz", language="english", **kwargs)

    def test_dump_keys_are_camel_case(self):
        d = self._minimal().model_dump()
        camel_expected = {
            "tenantId", "type", "language", "createdBy", "schoolId",
            "title", "localTitle", "theme", "localTheme",
            "positiveMarks", "negativeMarks",
            "questions", "options", "correctAnswers",
            "isDeleted", "creation_time",
        }
        assert set(d.keys()) == camel_expected

    def test_no_snake_case_keys_leak(self):
        d = self._minimal().model_dump()
        assert "tenant_id" not in d
        assert "positive_marks" not in d
        assert "negative_marks" not in d
        assert "is_deleted" not in d
        assert "correct_answers" not in d
        assert "local_title" not in d

    def test_marks_use_plural_form(self):
        # UI sends positiveMark (singular) but backend stores positiveMarks (plural)
        dto = self._minimal(positiveMarks=2.0, negativeMarks=0.5)
        d = dto.model_dump()
        assert d["positiveMarks"] == 2.0
        assert d["negativeMarks"] == 0.5
        assert "positiveMark" not in d
        assert "negativeMark" not in d

    def test_defaults(self):
        dto = self._minimal()
        assert dto.positiveMarks == 1.0
        assert dto.negativeMarks == 0.0
        assert dto.questions == []
        assert dto.options == []
        assert dto.correctAnswers == []
        assert dto.isDeleted is False

    def test_missing_tenant_id_raises(self):
        with pytest.raises(ValidationError):
            QuizCreate(type="quiz", language="english")
