"""Outbound content-aggregator webhook delivery (ticket #464).

Dispatches job.completed / job.failed events to tenant-registered webhooks
when a content_jobs document reaches a terminal state (hooked directly into
content_job_consumer.py — no parallel pipeline).

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

import asyncio
import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime
from typing import Any

import httpx

from app.platform.auth.webhook_secret import decrypt_secret
from app.repositories.content_aggregator_webhook_delivery_repository import (
    ContentAggregatorWebhookDeliveryRepository,
)
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from app.repositories.integration_client_repository import IntegrationClientRepository
from app.repositories.content_repository import ContentRepository

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


async def deliver_webhook(
    webhook_doc: dict[str, Any],
    event: str,
    payload: dict[str, Any],
    content_id: str,
    webhook_repo: ContentAggregatorWebhookRepository,
    delivery_repo: ContentAggregatorWebhookDeliveryRepository,
) -> None:
    webhook_id = webhook_doc["_id"]
    client_id = webhook_doc["client_id"]
    raw_body = serialize_payload(payload)

    async with httpx.AsyncClient(timeout=WEBHOOK_HTTP_TIMEOUT_SECONDS) as client:
        for attempt in range(1, WEBHOOK_MAX_ATTEMPTS + 1):
            current = await webhook_repo.get_for_client(client_id, str(webhook_id))
            if current is None or current.get("status") != "active":
                logger.info(
                    "webhook_delivery: webhookId=%s no longer active — skipping attempt %d",
                    webhook_id, attempt,
                )
                return

            response_code: int | None = None
            error: str | None = None
            succeeded = False
            try:
                secret = decrypt_secret(current["secret_encrypted"])
                signature = sign_payload(secret, raw_body)
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

            await delivery_repo.log_attempt(
                webhook_id, content_id, event, attempt, response_code, succeeded, error,
            )

            if succeeded:
                return

            logger.warning(
                "webhook_delivery: webhookId=%s attempt=%d/%d failed — %s",
                webhook_id, attempt, WEBHOOK_MAX_ATTEMPTS, error,
            )
            if attempt < WEBHOOK_MAX_ATTEMPTS:
                await asyncio.sleep(WEBHOOK_RETRY_DELAYS_SECONDS[attempt - 1])

    logger.error(
        "webhook_delivery: webhookId=%s exhausted %d attempts — disabling",
        webhook_id, WEBHOOK_MAX_ATTEMPTS,
    )
    await webhook_repo.disable(webhook_id)


async def dispatch_terminal_event(
    db: Any,
    content_id: str,
    event: str,
    *,
    job_id: str,
    error: str | None = None,
) -> None:
    """Best-effort webhook fan-out for a content_jobs terminal state.

    Never raises — a webhook delivery failure must not affect the job
    pipeline's own state, which has already been persisted by the caller.
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
            data["error"] = error

        delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)
        results = await asyncio.gather(
            *(
                deliver_webhook(
                    wh, event, build_payload(event, wh["_id"], tenant_id, data),
                    content_id, webhook_repo, delivery_repo,
                )
                for wh in webhooks
            ),
            return_exceptions=True,
        )
        for wh, result in zip(webhooks, results, strict=True):
            if isinstance(result, Exception):
                logger.exception(
                    "webhook_delivery: unhandled error delivering to webhookId=%s", wh["_id"], exc_info=result,
                )
    except Exception:  # noqa: BLE001 — dispatch must never break the job pipeline
        logger.exception("webhook_delivery: dispatch_terminal_event failed for content_id=%s", content_id)
