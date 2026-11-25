from __future__ import annotations

import gc
import tracemalloc

import pytest

from app.providers.subodha_client import _extract_html, _extract_video_data, _strip_staff_debug

PAGE = '<html><body><div class="xblock">' + "<p>lesson text</p>" * 10_000 + "</div></body></html>"


@pytest.mark.parametrize(
    "parse", [lambda raw: _strip_staff_debug(_extract_html(raw)), _extract_video_data]
)
def test_parse_frees_its_tree_without_the_cycle_collector(parse):
    gc.collect()
    gc.disable()
    tracemalloc.start()
    try:
        parse(PAGE)
        retained = tracemalloc.get_traced_memory()[0]
    finally:
        tracemalloc.stop()
        gc.enable()

    assert retained < 1_000_000
