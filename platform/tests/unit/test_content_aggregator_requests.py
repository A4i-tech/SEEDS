from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.requests.content_aggregator_requests import ContentAggregatorRegisterRequest


def _valid(**overrides):
    data = {"name": "Acme", "tenant_ids": ["t1"], "scopes": ["content:read"]}
    data.update(overrides)
    return data


def test_register_request_accepts_valid_payload():
    req = ContentAggregatorRegisterRequest(**_valid())
    assert req.name == "Acme"


def test_register_request_rejects_blank_name():
    with pytest.raises(ValidationError):
        ContentAggregatorRegisterRequest(**_valid(name="   "))


def test_register_request_rejects_empty_name():
    with pytest.raises(ValidationError):
        ContentAggregatorRegisterRequest(**_valid(name=""))


def test_register_request_rejects_blank_tenant_id():
    with pytest.raises(ValidationError):
        ContentAggregatorRegisterRequest(**_valid(tenant_ids=["t1", "   "]))


def test_register_request_rejects_empty_tenant_ids_list():
    with pytest.raises(ValidationError):
        ContentAggregatorRegisterRequest(**_valid(tenant_ids=[]))


def test_register_request_rejects_empty_scope_string():
    with pytest.raises(ValidationError):
        ContentAggregatorRegisterRequest(**_valid(scopes=[""]))


def test_register_request_rejects_whitespace_containing_scope():
    with pytest.raises(ValidationError):
        ContentAggregatorRegisterRequest(**_valid(scopes=["content read"]))


def test_register_request_rejects_whitespace_only_scope():
    with pytest.raises(ValidationError):
        ContentAggregatorRegisterRequest(**_valid(scopes=["   "]))


def test_register_request_rejects_empty_scopes_list():
    with pytest.raises(ValidationError):
        ContentAggregatorRegisterRequest(**_valid(scopes=[]))
