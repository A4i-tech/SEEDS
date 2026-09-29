"""Outbound content-aggregator webhook delivery (ticket #464).

Dispatches job.completed / job.failed events to tenant-registered webhooks
when a content_jobs document reaches a terminal state (hooked directly into
content_job_consumer.py — no parallel pipeline).

``dispatch_terminal_event`` only persists durable pending-delivery work
(contentAggregatorWebhookDeliveries) and returns; it does not perform any
HTTP delivery itself. Delivery is performed by WebhookDeliveryConsumer,
which polls for due attempts and executes exactly one HTTP attempt per
claimed record. This means retry state survives a process restart.

Retry / dead-letter policy (spec §5.6, NFR-11):
  1 initial attempt + up to 5 retries = 6 total delivery attempts, with
  delays 30s -> 5min -> 30min -> 2h -> 24h between attempts. After the 6th
  (final) attempt fails, the webhook is auto-disabled (status="disabled")
  via the existing webhook status field -- no separate delivery-status
  field is introduced.

Signature: X-SEEDS-Signature: sha256=<HMAC-SHA256(secret, raw_body)-hex>
(spec §13). This is unrelated to verify_vonage_signature (JWT, inbound).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.platform.auth.webhook_secret import decrypt_secret
from app.repositories.content_aggregator_webhook_delivery_repository import (
    ContentAggregatorWebhookDeliveryRepository,
)
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from app.repositories.content_repository import ContentRepository
from app.repositories.integration_client_repository import IntegrationClientRepository

logger = logging.getLogger(__name__)

WEBHOOK_HTTP_TIMEOUT_SECONDS = 10.0
WEBHOOK_MAX_ATTEMPTS = 6
WEBHOOK_RETRY_DELAYS_SECONDS = (30, 300, 1800, 7200, 86400)

JOB_NAME = "processNewContent"


def build_payload(event: str, webhook_id: Any, tenant_id: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "event": event,
        "webhookId": str(webhook_id),
        "tenantId": tenant_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "data": data,
    }


def serialize_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def sign_payload(secret: str, raw_body: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


async def attempt_delivery(
    attempt_doc: dict[str, Any],
    webhook_repo: ContentAggregatorWebhookRepository,
    delivery_repo: ContentAggregatorWebhookDeliveryRepository,
) -> None:
    """Perform exactly one HTTP delivery attempt for a claimed pending record.

    Schedules the next attempt (new pending record) on transient failure, or
    disables the webhook once WEBHOOK_MAX_ATTEMPTS is exhausted.
    """
    attempt_id = attempt_doc["_id"]
    webhook_id = attempt_doc["webhookId"]
    client_id = attempt_doc["clientId"]
    attempt_number = attempt_doc["attemptNumber"]

    current = await webhook_repo.get_for_client(client_id, webhook_id)
    if current is None or current.get("status") != "active":
        logger.info(
            "webhook_delivery: webhookId=%s no longer active — skipping attempt %d",
            webhook_id, attempt_number,
        )
        await delivery_repo.record_attempt_result(
            attempt_id, status="skipped", response_code=None, succeeded=None, error=None,
        )
        return

    payload = build_payload(attempt_doc["event"], webhook_id, attempt_doc["tenantId"], attempt_doc["payloadData"])
    raw_body = serialize_payload(payload)

    response_code: int | None = None
    error: str | None = None
    succeeded = False
    try:
        secret = decrypt_secret(current["secret_encrypted"])
        signature = sign_payload(secret, raw_body)
        async with httpx.AsyncClient(timeout=WEBHOOK_HTTP_TIMEOUT_SECONDS) as client:
            response = await client.post(
                current["url"],
                content=raw_body,
                headers={
                    "Content-Type": "application/json",
                    "X-SEEDS-Signature": signature,
                },
            )
        response_code = response.status_code
        succeeded = 200 <= response.status_code < 300
        if not succeeded:
            error = f"non-2xx response: {response.status_code}"
    except httpx.TimeoutException as exc:
        error = f"timeout: {exc}"
    except httpx.HTTPError as exc:
        error = f"http error: {exc}"
    except Exception:  # noqa: BLE001 — secret unreadable must not crash delivery
        logger.exception(
            "webhook_delivery: webhookId=%s failed to decrypt secret or sign payload", webhook_id,
        )
        error = "secret unreadable"

    await delivery_repo.record_attempt_result(
        attempt_id, status="succeeded" if succeeded else "failed",
        response_code=response_code, succeeded=succeeded, error=error,
    )

    if succeeded:
        return

    logger.warning(
        "webhook_delivery: webhookId=%s attempt=%d/%d failed — %s",
        webhook_id, attempt_number, WEBHOOK_MAX_ATTEMPTS, error,
    )

    if attempt_number < WEBHOOK_MAX_ATTEMPTS:
        delay = WEBHOOK_RETRY_DELAYS_SECONDS[attempt_number - 1]
        next_attempt_at = datetime.now(UTC) + timedelta(seconds=delay)
        await delivery_repo.create_pending(
            webhook_id=webhook_id,
            content_id=attempt_doc["contentId"],
            event=attempt_doc["event"],
            tenant_id=attempt_doc["tenantId"],
            client_id=client_id,
            payload_data=attempt_doc["payloadData"],
            attempt_number=attempt_number + 1,
            next_attempt_at=next_attempt_at.isoformat(),
        )
        return

    logger.error(
        "webhook_delivery: webhookId=%s exhausted %d attempts — disabling",
        webhook_id, WEBHOOK_MAX_ATTEMPTS,
    )
    await webhook_repo.disable(current["_id"])


async def dispatch_terminal_event(
    db: Any,
    content_id: str,
    event: str,
    *,
    job_id: str,
    error: str | None = None,
) -> None:
    """Best-effort webhook fan-out for a content_jobs terminal state.

    Persists one durable pending delivery record per active, subscribed
    webhook and returns immediately. Never raises — a failure here must not
    affect the job pipeline's own state, which has already been persisted
    by the caller.
    """
    try:
        content_repo = ContentRepository(db)
        content_doc = await content_repo.find_raw_by_id(content_id)
        if not content_doc or "tenant_id" not in content_doc:
            logger.warning("webhook_delivery: no tenant found for content_id=%s — skipping", content_id)
            return
        tenant_id = str(content_doc["tenant_id"])

        client_repo = IntegrationClientRepository(db)
        client_ids = await client_repo.find_client_ids_for_tenant(tenant_id)
        if not client_ids:
            return

        webhook_repo = ContentAggregatorWebhookRepository(db)
        webhooks = await webhook_repo.find_active_for_clients_and_event(client_ids, event)
        if not webhooks:
            return

        now = datetime.now(UTC).isoformat()
        data: dict[str, Any] = {"jobId": str(job_id), "contentId": content_id, "jobName": JOB_NAME}
        if event == "job.completed":
            data["completedAt"] = now
        elif event == "job.failed":
            data["failedAt"] = now
            data["error"] = "processing_failed" if error else None

        delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)
        for wh in webhooks:
            await delivery_repo.create_pending(
                webhook_id=wh["_id"],
                content_id=content_id,
                event=event,
                tenant_id=tenant_id,
                client_id=wh["client_id"],
                payload_data=data,
                attempt_number=1,
                next_attempt_at=now,
            )
    except Exception:  # noqa: BLE001 — dispatch must never break the job pipeline
        logger.exception("webhook_delivery: dispatch_terminal_event failed for content_id=%s", content_id)
