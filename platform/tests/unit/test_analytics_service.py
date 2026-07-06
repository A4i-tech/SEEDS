"""
Unit tests for the pure helpers in analytics_service.

Ported from backend-server/tests/unit/analyticsService.test.js.
"""

from __future__ import annotations

from datetime import datetime

from app.services import analytics_service as a


class TestNormalizePhone:
    def test_strips_formatting_and_country_code(self):
        assert a.normalize_phone("+91 98765-43210") == "9876543210"
        assert a.normalize_phone("919876543210") == "9876543210"
        assert a.normalize_phone("09876543210") == "9876543210"

    def test_empty(self):
        assert a.normalize_phone(None) == ""
        assert a.normalize_phone("") == ""


class TestPhoneCandidates:
    def test_variants_for_ten_digits(self):
        cands = a.phone_candidates("9876543210")
        assert "9876543210" in cands
        assert "919876543210" in cands
        assert "+919876543210" in cands

    def test_empty_for_blank(self):
        assert a.phone_candidates("") == []
        assert a.phone_candidates(None) == []


class TestMedianAverage:
    def test_median_odd_even(self):
        assert a.median([3, 1, 2]) == 2
        assert a.median([4, 1, 2, 3]) == 2.5

    def test_median_empty(self):
        assert a.median([]) is None

    def test_average(self):
        assert a.average([2, 4]) == 3
        assert a.average([]) is None


class TestParseDate:
    def test_iso_with_t(self):
        assert a.parse_date("2026-06-01T10:00:00") == datetime(2026, 6, 1, 10, 0, 0)

    def test_iso_with_space(self):
        assert a.parse_date("2026-06-01 10:00:00") == datetime(2026, 6, 1, 10, 0, 0)

    def test_datetime_passthrough(self):
        dt = datetime(2026, 6, 1)
        assert a.parse_date(dt) is dt

    def test_invalid_and_empty(self):
        assert a.parse_date("not-a-date") is None
        assert a.parse_date(None) is None
        assert a.parse_date("") is None


class TestFinalCallStatus:
    def test_picks_last_chronologically(self):
        updates = {
            "2026-06-01T10:00:00": "started",
            "2026-06-01T10:05:00": "completed",
            "2026-06-01T10:02:00": "answered",
        }
        assert a.final_call_status(updates) == "completed"

    def test_flattens_nested_dotted_paths(self):
        updates = {
            "2026-06-01T10:00:00": "started",
            "2026-06-01T10:02:36": {"173000+00:00": "completed"},
        }
        assert a.final_call_status(updates) == "completed"

    def test_empty(self):
        assert a.final_call_status({}) is None
        assert a.final_call_status(None) is None


class TestClassifyCall:
    def test_completed(self):
        assert a.classify_call("completed") == "completed"

    def test_failed(self):
        for s in ("failed", "busy", "unanswered", "rejected", "cancelled", "timeout"):
            assert a.classify_call(s) == "failed"

    def test_dropped_for_unknown(self):
        assert a.classify_call("weird") == "dropped"
        assert a.classify_call("unknown") == "dropped"


class TestSessionSeconds:
    def test_uses_reported_duration(self):
        assert a.session_seconds({"duration": "42"}) == 42.0

    def test_falls_back_to_timestamps(self):
        log = {
            "duration": "0",
            "created_at": "2026-06-01T10:00:00",
            "stopped_at": "2026-06-01T10:01:30",
        }
        assert a.session_seconds(log) == 90.0

    def test_none_when_unresolvable(self):
        assert a.session_seconds({"duration": ""}) is None
        assert a.session_seconds({"duration": None, "created_at": "x"}) is None


class TestBucketClassSize:
    def test_buckets(self):
        assert a.bucket_class_size(3) == "1-5"
        assert a.bucket_class_size(10) == "6-10"
        assert a.bucket_class_size(15) == "11-20"
        assert a.bucket_class_size(40) == "21-50"
        assert a.bucket_class_size(120) == "50+"

    def test_zero_unbucketed(self):
        assert a.bucket_class_size(0) is None


class TestExtractConferenceMetrics:
    def test_full_lifecycle(self):
        doc = {
            "_id": "conf1",
            "is_running": False,
            "action_history": [
                {"action_type": "Conference-Start", "timestamp": "2026-06-01T10:00:00", "metadata": {}},
                {
                    "action_type": "Student-RaiseHandStateChange",
                    "timestamp": "2026-06-01T10:01:00",
                    "metadata": {"raised_hand": True},
                },
                {"action_type": "Conference-End", "timestamp": "2026-06-01T10:30:00", "metadata": {}},
            ],
            "participants": {
                "+919000000001": {"role": "Teacher", "name": "T"},
                "+919000000002": {"role": "Student", "name": "S1"},
                "+919000000003": {"role": "Student", "name": "S2"},
            },
        }
        m = a.extract_conference_metrics(doc)
        assert m["conferenceId"] == "conf1"
        assert m["durationSeconds"] == 1800.0
        assert m["studentCount"] == 2
        assert m["raisedHandEvents"] == 1
        assert m["isRunning"] is False
        assert m["neverStarted"] is False

    def test_never_started(self):
        doc = {"_id": "c2", "action_history": [], "participants": {}}
        m = a.extract_conference_metrics(doc)
        assert m["neverStarted"] is True
        assert m["durationSeconds"] is None
        assert m["studentCount"] == 0


class TestMatchContent:
    def test_exact_then_prefix(self):
        index = [
            {"url": "https://cdn/a.mp3", "contentId": "c1", "title": "A"},
            {"url": "https://cdn/b", "contentId": "c2", "title": "B"},
        ]
        assert a.match_content("https://cdn/a.mp3", index)["contentId"] == "c1"
        assert a.match_content("https://cdn/b/segment.mp3", index)["contentId"] == "c2"
        assert a.match_content("https://cdn/z.mp3", index) is None


class TestRoundOrNull:
    def test_rounds(self):
        assert a.round_or_null(1.23456) == 1.2
        assert a.round_or_null(1.23456, 4) == 1.2346
        assert a.round_or_null(None) is None
