from __future__ import annotations

from app.providers.subodha_client import _MATHTYPE_ANNOTATION_RE, _extract_html, _strip_staff_debug


def test_strip_staff_debug_removes_all_known_panels():
    raw = (
        '<div class="xblock xblock-student_view" data-usage-id="x">'
        "<p>Real lesson content</p>"
        '<div class="wrap-instructor-info">'
        '<a class="instructor-info-action" href="#x_debug">Staff Debug Info</a>'
        "</div>"
        '<div aria-hidden="true" role="dialog" class="modal xqa-modal" id="x_xqa-modal">'
        "<h2>Subodha Content Quality Assessment</h2>"
        "</div>"
        '<div aria-hidden="true" role="dialog" class="modal staff-modal" id="x_debug">'
        "<h2>Staff Debug: Real lesson content</h2>"
        "<div>nested actions block</div>"
        "</div>"
        '<div aria-hidden="true" role="dialog" class="modal history-modal" id="x_history">'
        "<h2>Submission History Viewer</h2>"
        "</div>"
        "</div>"
    )

    cleaned = _strip_staff_debug(_extract_html(raw))

    assert "Real lesson content" in cleaned
    assert "Staff Debug" not in cleaned
    assert "wrap-instructor-info" not in cleaned
    assert "Subodha Content Quality Assessment" not in cleaned
    assert "Submission History Viewer" not in cleaned


def test_mathtype_annotation_regex_strips_dangling_mtef_garbage():
    heading = (
        "<h4>Activity 9: Proving irrationality of numbers like 2 "
        "MathType@MTEF@5@5@+=\n"
        "  feaahqart1ev3aaatCvAUfeBSjuyZL2yd9gzLbvyNv2CaerbuLwBLn\n"
        "  aaaeaacaaIYaaaleqaaaaa@38E5@</h4>"
    )

    cleaned = _MATHTYPE_ANNOTATION_RE.sub("", heading)

    assert "MathType@MTEF" not in cleaned
    assert "Activity 9: Proving irrationality of numbers like 2" in cleaned


def test_mathtype_annotation_regex_leaves_normal_text_untouched():
    text = "<p>No equations here, just plain text with an @ sign.</p>"

    assert _MATHTYPE_ANNOTATION_RE.sub("", text) == text
