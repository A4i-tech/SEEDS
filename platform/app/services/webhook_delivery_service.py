from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any, NamedTuple

import httpx
from cryptography.fernet import InvalidToken
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import DeliveryAttempt, DeliveryStatus, Webhook
from app.models.requests.webhook_registration_requests import WebhookEventType, WebhookStatus
from app.platform.auth.webhook_secret import decrypt_secret
from app.platform.error_handling import ConfigurationError
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
WEBHOOK_RETRY_DELAYS_SECONDS = (30, 300, 1800, 7200, 86400)
WEBHOOK_MAX_ATTEMPTS = len(WEBHOOK_RETRY_DELAYS_SECONDS) + 1


class _Outcome(NamedTuple):
    status: DeliveryStatus
    response_code: int | None
    error: str | None


def build_payload(
    event: WebhookEventType, webhook_id: str, tenant_id: str, data: dict[str, Any]
) -> dict[str, Any]:
    return {
        "event": event.value,
        "webhookId": webhook_id,
        "tenantId": tenant_id,
        "timestamp": datetime.now(UTC).isoformat(),
        "data": data,
    }


def serialize_payload(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def sign_payload(secret: str, raw_body: bytes) -> str:
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


class WebhookDeliveryService:
    def __init__(
        self,
        webhook_repo: ContentAggregatorWebhookRepository,
        delivery_repo: ContentAggregatorWebhookDeliveryRepository,
        content_repo: ContentRepository,
        client_repo: IntegrationClientRepository,
    ) -> None:
        self._webhook_repo = webhook_repo
        self._delivery_repo = delivery_repo
        self._content_repo = content_repo
        self._client_repo = client_repo

    async def _send(self, attempt: DeliveryAttempt, webhook: Webhook) -> _Outcome:
        payload = build_payload(
            attempt.event, attempt.webhook_id, attempt.tenant_id, attempt.payload_data
        )
        raw_body = serialize_payload(payload)
        secret = decrypt_secret(webhook.secret_encrypted)
        signature = sign_payload(secret, raw_body)
        try:
            async with httpx.AsyncClient(timeout=WEBHOOK_HTTP_TIMEOUT_SECONDS) as client:
                response = await client.post(
                    webhook.url,
                    content=raw_body,
                    headers={
                        "Content-Type": "application/json",
                        "X-SEEDS-Signature": signature,
                    },
                )
        except httpx.HTTPError as exc:
            return _Outcome(DeliveryStatus.FAILED, None, f"{type(exc).__name__}: {exc}")
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "webhook_delivery: unexpected send error webhookId=%s attemptId=%s "
                "contentId=%s event=%s",
                attempt.webhook_id, attempt.id, attempt.content_id, attempt.event.value,
            )
            return _Outcome(DeliveryStatus.FAILED, None, f"{type(exc).__name__}: {exc}")

        if 200 <= response.status_code < 300:
            return _Outcome(DeliveryStatus.SUCCEEDED, response.status_code, None)
        return _Outcome(
            DeliveryStatus.FAILED, response.status_code, f"non-2xx response: {response.status_code}"
        )

    async def claim_due(self, now: datetime, stale_before: datetime) -> DeliveryAttempt | None:
        return await self._delivery_repo.claim_due(now, stale_before)

    async def mark_attempt_failed(self, attempt_id: str, *, error: str) -> None:
        await self._delivery_repo.record_attempt_result(
            attempt_id,
            status=DeliveryStatus.FAILED,
            response_code=None,
            succeeded=False,
            error=error,
        )

    async def attempt_delivery(self, attempt: DeliveryAttempt) -> None:
        webhook = await self._webhook_repo.get_for_client(attempt.client_id, attempt.webhook_id)
        if webhook is None or webhook.status is not WebhookStatus.ACTIVE:
            reason = "webhook deleted" if webhook is None else f"webhook {webhook.status.value}"
            logger.info(
                "webhook_delivery: skipping attempt attemptId=%s webhookId=%s contentId=%s "
                "event=%s attempt=%d — %s",
                attempt.id, attempt.webhook_id, attempt.content_id,
                attempt.event.value, attempt.attempt_number, reason,
            )
            await self._record(attempt, _Outcome(DeliveryStatus.SKIPPED, None, reason))
            return

        try:
            outcome = await self._send(attempt, webhook)
        except (ConfigurationError, InvalidToken) as exc:
            await self._release_for_config_fault(attempt, exc)
            return

        await self._record(attempt, outcome)
        if outcome.status is DeliveryStatus.SUCCEEDED:
            return

        logger.warning(
            "webhook_delivery: attempt failed attemptId=%s webhookId=%s contentId=%s event=%s "
            "attempt=%d/%d — %s",
            attempt.id, attempt.webhook_id, attempt.content_id, attempt.event.value,
            attempt.attempt_number, WEBHOOK_MAX_ATTEMPTS, outcome.error,
        )

        if attempt.attempt_number < WEBHOOK_MAX_ATTEMPTS:
            await self._schedule_retry(attempt)
            return

        logger.error(
            "webhook_delivery: exhausted %d attempts webhookId=%s clientId=%s contentId=%s "
            "event=%s — disabling webhook",
            WEBHOOK_MAX_ATTEMPTS, attempt.webhook_id, attempt.client_id,
            attempt.content_id, attempt.event.value,
        )
        try:
            await self._webhook_repo.disable(attempt.webhook_id)
        except Exception:
            logger.exception(
                "webhook_delivery: failed to disable exhausted webhook webhookId=%s clientId=%s "
                "attemptId=%s — webhook stays active and will keep receiving new events",
                attempt.webhook_id, attempt.client_id, attempt.id,
            )

    async def _record(self, attempt: DeliveryAttempt, outcome: _Outcome) -> None:
        try:
            await self._delivery_repo.record_attempt_result(
                attempt.id,
                status=outcome.status,
                response_code=outcome.response_code,
                succeeded=outcome.status is DeliveryStatus.SUCCEEDED,
                error=outcome.error,
            )
        except Exception:
            logger.exception(
                "webhook_delivery: failed to record attempt result attemptId=%s webhookId=%s "
                "attempt=%d — the record stays claimed and will be re-delivered once stale",
                attempt.id, attempt.webhook_id, attempt.attempt_number,
            )

    async def _release_for_config_fault(self, attempt: DeliveryAttempt, exc: Exception) -> None:
        logger.exception(
            "webhook_delivery: configuration fault attemptId=%s webhookId=%s attempt=%d — "
            "not counted toward exhaustion",
            attempt.id, attempt.webhook_id, attempt.attempt_number,
        )
        next_attempt_at = datetime.now(UTC) + timedelta(seconds=WEBHOOK_RETRY_DELAYS_SECONDS[0])
        await self._delivery_repo.release_claim(
            attempt.id,
            next_attempt_at=next_attempt_at,
            error=f"configuration: {type(exc).__name__}",
        )

    async def _schedule_retry(self, attempt: DeliveryAttempt) -> None:
        delay = WEBHOOK_RETRY_DELAYS_SECONDS[attempt.attempt_number - 1]
        try:
            await self._delivery_repo.create_pending(
                webhook_id=attempt.webhook_id,
                content_id=attempt.content_id,
                event=attempt.event,
                tenant_id=attempt.tenant_id,
                client_id=attempt.client_id,
                payload_data=attempt.payload_data,
                attempt_number=attempt.attempt_number + 1,
                next_attempt_at=datetime.now(UTC) + timedelta(seconds=delay),
            )
        except Exception:
            logger.exception(
                "webhook_delivery: failed to schedule retry attemptId=%s webhookId=%s "
                "contentId=%s event=%s next_attempt=%d — retry chain ended early",
                attempt.id, attempt.webhook_id, attempt.content_id, attempt.event.value,
                attempt.attempt_number + 1,
            )

    async def dispatch_terminal_event(self, job: dict[str, Any], event: WebhookEventType) -> None:
        job_id = job.get("_id")
        content_id = job.get("content_id")
        if not content_id:
            logger.error("webhook_delivery: job_id=%s has no content_id — cannot dispatch %s",
                         job_id, event.value)
            return

        content_doc = await self._content_repo.find_raw_by_id(content_id)
        if not content_doc:
            logger.warning(
                "webhook_delivery: no content found contentId=%s job_id=%s — skipping %s",
                content_id, job_id, event.value,
            )
            return
        if content_doc.get("is_teacher_app"):
            return

        tenant_id = str(content_doc["tenant_id"])
        client_ids = await self._client_repo.find_active_client_ids_for_tenant(tenant_id)
        if not client_ids:
            return

        webhooks = await self._webhook_repo.find_active_for_clients_and_event(client_ids, event)
        if not webhooks:
            return

        data: dict[str, Any] = {
            "jobId": str(job_id),
            "contentId": str(content_id),
            "jobName": "processNewContent",
        }
        if event is WebhookEventType.JOB_COMPLETED:
            data["completedAt"] = _iso(job.get("completed_at"))
        elif event is WebhookEventType.JOB_FAILED:
            data["failedAt"] = _iso(job.get("failed_at"))
            data["error"] = job.get("reason")

        now = datetime.now(UTC)
        failed = 0
        for webhook in webhooks:
            try:
                await self._delivery_repo.create_pending(
                    webhook_id=webhook.id,
                    content_id=str(content_id),
                    event=event,
                    tenant_id=tenant_id,
                    client_id=webhook.client_id,
                    payload_data=data,
                    attempt_number=1,
                    next_attempt_at=now,
                )
            except Exception:
                failed += 1
                logger.exception(
                    "webhook_delivery: failed to queue delivery webhookId=%s clientId=%s "
                    "contentId=%s event=%s job_id=%s",
                    webhook.id, webhook.client_id, content_id, event.value, job_id,
                )
        if failed:
            logger.error(
                "webhook_delivery: %d of %d deliveries not queued contentId=%s event=%s job_id=%s",
                failed, len(webhooks), content_id, event.value, job_id,
            )


def _iso(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else value


def get_webhook_delivery_service(db: AsyncDatabase) -> WebhookDeliveryService:
    return WebhookDeliveryService(
        ContentAggregatorWebhookRepository(db),
        ContentAggregatorWebhookDeliveryRepository(db),
        ContentRepository(db),
        IntegrationClientRepository(db),
    )
