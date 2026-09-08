"""Unit tests for snake_case create DTOs — verifies model_dump() produces correct DB keys."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.requests.content_requests import ContentCreate, QuizCreate
from app.models.requests.school_requests import ClassroomCreate, SchoolCreate

# ---------------------------------------------------------------------------
# ClassroomCreate
# ---------------------------------------------------------------------------


class TestClassroomCreate:
    def test_dump_keys_are_snake_case(self):
        dto = ClassroomCreate(school_id="s1", name="Class A", teacher="t1")
        d = dto.model_dump()
        assert set(d.keys()) == {"school_id", "name", "teacher", "students", "leaders", "content_ids"}

    def test_no_camel_case_keys_leak(self):
        dto = ClassroomCreate(school_id="s1", name="X", teacher="t1")
        d = dto.model_dump()
        assert "schoolId" not in d
        assert "contentIds" not in d

    def test_defaults(self):
        dto = ClassroomCreate(school_id="s1", name="X", teacher="t1")
        assert dto.students == []
        assert dto.leaders == []
        assert dto.content_ids == []

    def test_missing_required_school_id_raises(self):
        with pytest.raises(ValidationError):
            ClassroomCreate(name="X", teacher="t1")  # school_id missing

    def test_missing_required_teacher_raises(self):
        with pytest.raises(ValidationError):
            ClassroomCreate(school_id="s1", name="X")  # teacher missing


# ---------------------------------------------------------------------------
# SchoolCreate
# ---------------------------------------------------------------------------


class TestSchoolCreate:
    def test_dump_keys_are_snake_case(self):
        dto = SchoolCreate(tenant_id="t1", name="S", email="s@s.com")
        d = dto.model_dump()
        assert set(d.keys()) == {"tenant_id", "name", "email", "password", "is_active"}

    def test_no_camel_case_keys_leak(self):
        dto = SchoolCreate(tenant_id="t1", name="S", email="s@s.com")
        d = dto.model_dump()
        assert "tenantId" not in d
        assert "isActive" not in d
        assert "hashedPassword" not in d

    def test_defaults(self):
        dto = SchoolCreate(tenant_id="t1", name="S", email="s@s.com")
        assert dto.is_active is True
        assert dto.password is None

    def test_missing_required_tenant_id_raises(self):
        with pytest.raises(ValidationError):
            SchoolCreate(name="S", email="s@s.com")

    def test_password_round_trips(self):
        dto = SchoolCreate(tenant_id="t1", name="S", email="s@s.com", password="hashed")
        assert dto.model_dump()["password"] == "hashed"


# ---------------------------------------------------------------------------
# ContentCreate
# ---------------------------------------------------------------------------


class TestContentCreate:
    def _minimal(self, **kwargs) -> ContentCreate:
        return ContentCreate(tenant_id="t1", type="Story", language="english", **kwargs)

    def test_dump_keys_are_snake_case(self):
        d = self._minimal().model_dump()
        snake_expected = {
            "tenant_id", "type", "language", "created_by", "school_id",
            "title", "theme", "audio_content", "description",
            "braille_url", "braille_grade",
            "is_pull_model", "is_teacher_app", "is_deleted", "is_processed",
            "creation_time", "version",
        }
        assert set(d.keys()) == snake_expected

    def test_no_camel_case_keys_leak(self):
        d = self._minimal().model_dump()
        assert "tenantId" not in d
        assert "isDeleted" not in d
        assert "isProcessed" not in d
        assert "audioContent" not in d
        assert "isPullModel" not in d
        assert "isTeacherApp" not in d

    def test_creation_time_stays_snake_case(self):
        d = self._minimal().model_dump()
        assert "creation_time" in d
        assert "creationTime" not in d

    def test_defaults(self):
        dto = self._minimal()
        assert dto.created_by == ""
        assert dto.school_id is None
        assert dto.is_deleted is False
        assert dto.is_processed is False
        assert dto.is_pull_model is False
        assert dto.is_teacher_app is False
        assert dto.audio_content == []
        assert dto.version == "v3"

    def test_missing_tenant_id_raises(self):
        with pytest.raises(ValidationError):
            ContentCreate(type="Story", language="english")

    def test_missing_type_raises(self):
        with pytest.raises(ValidationError):
            ContentCreate(tenant_id="t1", language="english")


# ---------------------------------------------------------------------------
# QuizCreate
# ---------------------------------------------------------------------------


class TestQuizCreate:
    def _minimal(self, **kwargs) -> QuizCreate:
        return QuizCreate(tenant_id="t1", type="quiz", language="english", **kwargs)

    def test_dump_keys_are_snake_case(self):
        d = self._minimal().model_dump()
        snake_expected = {
            "tenant_id", "type", "language", "created_by", "school_id",
            "title", "theme",
            "is_pull_model", "is_teacher_app",
            "positive_marks", "negative_marks",
            "questions",
            "is_deleted", "creation_time",
        }
        assert set(d.keys()) == snake_expected

    def test_no_camel_case_keys_leak(self):
        d = self._minimal().model_dump()
        assert "tenantId" not in d
        assert "positiveMarks" not in d
        assert "negativeMarks" not in d
        assert "isDeleted" not in d

    def test_marks_use_plural_form(self):
        # UI sends positiveMark (singular) but backend stores positive_marks (plural)
        dto = self._minimal(positive_marks=2.0, negative_marks=0.5)
        d = dto.model_dump()
        assert d["positive_marks"] == 2.0
        assert d["negative_marks"] == 0.5
        assert "positiveMark" not in d
        assert "negativeMark" not in d

    def test_defaults(self):
        dto = self._minimal()
        assert dto.positive_marks == 1.0
        assert dto.negative_marks == 0.0
        assert dto.questions == []
        assert dto.is_deleted is False

    def test_missing_tenant_id_raises(self):
        with pytest.raises(ValidationError):
            QuizCreate(type="quiz", language="english")
