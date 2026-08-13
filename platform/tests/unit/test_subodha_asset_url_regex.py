from __future__ import annotations

from app.services.subodha_service import _ASSET_URL_RE


def test_matches_courseware_v1_hash_prefixed_asset_url():
    html = (
        '<img src="/assets/courseware/v1/8c25008b98de1c618181b4beff1f65b4'
        "/asset-v1:VisionEmpower+VE_TIK_TN_MAT_G9_02+2021+type@asset+block@Image_68.png\">"
    )

    matches = _ASSET_URL_RE.findall(html)

    assert matches == [
        "/assets/courseware/v1/8c25008b98de1c618181b4beff1f65b4"
        "/asset-v1:VisionEmpower+VE_TIK_TN_MAT_G9_02+2021+type@asset+block@Image_68.png"
    ]


def test_matches_legacy_bare_asset_v1_url():
    html = '<img src="/asset-v1:VisionEmpower+VE_TIK_TN_MAT_G9_02+2021+type@asset+block@Image_68.png">'

    matches = _ASSET_URL_RE.findall(html)

    assert matches == ["/asset-v1:VisionEmpower+VE_TIK_TN_MAT_G9_02+2021+type@asset+block@Image_68.png"]
