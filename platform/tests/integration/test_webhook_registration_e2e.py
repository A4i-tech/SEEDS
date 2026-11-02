from __future__ import annotations

from tests.integration.conftest import _tenant_headers


async def _register_and_token(client, *, scopes=("content:write", "content:read"), tenant_ids=("tenant-1",)):
    reg = await client.post(
        "/v1/auth/register",
        json={"name": "Partner", "tenant_ids": list(tenant_ids), "scopes": list(scopes)},
        headers=_tenant_headers(tenant_ids[0]),
    )
    assert reg.status_code == 200, reg.text
    body = reg.json()
    tok = await client.post(
        "/v1/auth/token",
        json={"client_id": body["client_id"], "client_secret": body["client_secret"], "scope": " ".join(scopes)},
    )
    assert tok.status_code == 200, tok.text
    return body, tok.json()["access_token"]


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_register_webhook_returns_secret_once(client, mock_db):
    creds, token = await _register_and_token(client)
    resp = await client.post(
        "/v1/webhooks",
        json={"url": "https://example.com/hook", "events": ["job.completed"]},
        headers=_auth(token),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert "secret" in body and body["secret"]
    client_doc = await mock_db["integrationClients"].find_one({"client_id": creds["client_id"]})
    assert client_doc is not None
    return body


async def test_get_webhooks_hides_secret(client):
    _, token = await _register_and_token(client)
    await client.post(
        "/v1/webhooks", json={"url": "https://example.com/hook", "events": ["job.completed"]}, headers=_auth(token)
    )
    resp = await client.get("/v1/webhooks", headers=_auth(token))
    assert resp.status_code == 200
    for wh in resp.json()["webhooks"]:
        assert "secret" not in wh


async def test_patch_updates_webhook(client):
    _, token = await _register_and_token(client)
    created = (
        await client.post(
            "/v1/webhooks",
            json={"url": "https://example.com/hook", "events": ["job.completed"]},
            headers=_auth(token),
        )
    ).json()
    resp = await client.patch(
        f"/v1/webhooks/{created['id']}",
        json={"url": "https://example.com/hook2"},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["url"] == "https://example.com/hook2"


async def test_patch_updates_events(client):
    _, token = await _register_and_token(client)
    created = (
        await client.post(
            "/v1/webhooks",
            json={"url": "https://example.com/hook", "events": ["job.completed"]},
            headers=_auth(token),
        )
    ).json()
    resp = await client.patch(
        f"/v1/webhooks/{created['id']}",
        json={"events": ["job.failed"]},
        headers=_auth(token),
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["events"] == ["job.failed"]
    listed = await client.get("/v1/webhooks", headers=_auth(token))
    updated = next(wh for wh in listed.json()["webhooks"] if wh["id"] == created["id"])
    assert updated["events"] == ["job.failed"]


async def test_patch_secret_rotation_returns_new_secret(client):
    _, token = await _register_and_token(client)
    created = (
        await client.post(
            "/v1/webhooks",
            json={"url": "https://example.com/hook", "events": ["job.completed"]},
            headers=_auth(token),
        )
    ).json()
    resp = await client.patch(
        f"/v1/webhooks/{created['id']}", json={"rotate_secret": True}, headers=_auth(token)
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["secret"] != created["secret"]


async def test_delete_webhook(client):
    _, token = await _register_and_token(client)
    created = (
        await client.post(
            "/v1/webhooks",
            json={"url": "https://example.com/hook", "events": ["job.completed"]},
            headers=_auth(token),
        )
    ).json()
    resp = await client.delete(f"/v1/webhooks/{created['id']}", headers=_auth(token))
    assert resp.status_code == 204
    listed = await client.get("/v1/webhooks", headers=_auth(token))
    assert all(wh["id"] != created["id"] for wh in listed.json()["webhooks"])


async def test_register_rejects_non_https_url(client):
    _, token = await _register_and_token(client)
    resp = await client.post(
        "/v1/webhooks", json={"url": "http://example.com/hook", "events": ["job.completed"]}, headers=_auth(token)
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "URL_NOT_HTTPS"


async def test_register_rejects_invalid_event_type(client):
    _, token = await _register_and_token(client)
    resp = await client.post(
        "/v1/webhooks", json={"url": "https://example.com/hook", "events": ["not.a.real.event"]}, headers=_auth(token)
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "INVALID_EVENT_TYPE"


async def test_register_enforces_exact_five_webhook_limit(client):
    _, token = await _register_and_token(client)
    for i in range(5):
        resp = await client.post(
            "/v1/webhooks",
            json={"url": f"https://example.com/hook{i}", "events": ["job.completed"]},
            headers=_auth(token),
        )
        assert resp.status_code == 201, resp.text
    sixth = await client.post(
        "/v1/webhooks", json={"url": "https://example.com/hook5", "events": ["job.completed"]}, headers=_auth(token)
    )
    assert sixth.status_code == 403
    assert sixth.json()["code"] == "WEBHOOK_LIMIT_REACHED"


async def test_register_enforces_scope_validation(client):
    _, token = await _register_and_token(client, scopes=("content:read",))
    resp = await client.post(
        "/v1/webhooks", json={"url": "https://example.com/hook", "events": ["job.completed"]}, headers=_auth(token)
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "SCOPE_INSUFFICIENT"


async def test_client_isolation_between_partners(client):
    _, token_a = await _register_and_token(client, tenant_ids=("tenant-a",))
    _, token_b = await _register_and_token(client, tenant_ids=("tenant-b",))
    created = (
        await client.post(
            "/v1/webhooks",
            json={"url": "https://example.com/hook", "events": ["job.completed"]},
            headers=_auth(token_a),
        )
    ).json()
    resp = await client.get("/v1/webhooks", headers=_auth(token_b))
    assert all(wh["id"] != created["id"] for wh in resp.json()["webhooks"])
    patch_resp = await client.patch(
        f"/v1/webhooks/{created['id']}", json={"url": "https://example.com/other"}, headers=_auth(token_b)
    )
    assert patch_resp.status_code == 404


async def test_webhook_error_envelope_is_flat_top_level_error(client):
    _, token = await _register_and_token(client)
    resp = await client.post(
        "/v1/webhooks", json={"url": "http://example.com/hook", "events": ["job.completed"]}, headers=_auth(token)
    )
    assert resp.status_code == 400
    body = resp.json()
    assert isinstance(body["error"], str)
    assert body["code"] == "URL_NOT_HTTPS"
