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
from app.models.content_aggregator import IntegrationClientStatus as WebhookStatus
from app.models.requests.webhook_registration_requests import WebhookEventType
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
from app.services.website_extractor import _PinnedTransport

logger = logging.getLogger(__name__)

WEBHOOK_HTTP_TIMEOUT_SECONDS = 10.0
WEBHOOK_RETRY_DELAYS_SECONDS = (30, 300, 1800, 7200, 86400)
WEBHOOK_MAX_ATTEMPTS = len(WEBHOOK_RETRY_DELAYS_SECONDS) + 1


class _Outcome(NamedTuple):
    status: DeliveryStatus
    response_code: int | None
    error: str | None


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
        payload = {
            "event": attempt.event.value,
            "webhookId": attempt.webhook_id,
            "tenantId": attempt.tenant_id,
            "timestamp": datetime.now(UTC).isoformat(),
            "data": attempt.payload_data.model_dump(by_alias=True, mode="json"),
        }
        raw_body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        secret = decrypt_secret(webhook.secret_encrypted)
        digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
        signature = f"sha256={digest}"
        try:
            async with httpx.AsyncClient(
                timeout=WEBHOOK_HTTP_TIMEOUT_SECONDS, transport=_PinnedTransport()
            ) as client:
                response = await client.post(
                    webhook.url,
                    content=raw_body,
                    headers={
                        "Content-Type": "application/json",
                        "X-SEEDS-Signature": signature,
                    },
                )
        except Exception as exc:
            logger.exception(
                "webhook_delivery: send error webhook_id=%s attempt_id=%s "
                "content_id=%s event=%s",
                attempt.webhook_id, attempt.id, attempt.content_id, attempt.event.value,
            )
            return _Outcome(DeliveryStatus.FAILED, None, str(exc))

        if 200 <= response.status_code < 300:
            return _Outcome(DeliveryStatus.SUCCEEDED, response.status_code, None)
        return _Outcome(
            DeliveryStatus.FAILED, response.status_code, f"non-2xx response: {response.status_code}"
        )

    async def mark_attempt_failed(self, attempt_id: str, *, error: str) -> None:
        await self._delivery_repo.record_attempt_result(
            attempt_id,
            status=DeliveryStatus.FAILED,
            response_code=None,
            error=error,
        )

    async def attempt_delivery(self, attempt: DeliveryAttempt) -> None:
        webhook = await self._webhook_repo.get_for_client(attempt.client_id, attempt.webhook_id)
        if webhook is None or webhook.status is not WebhookStatus.ACTIVE:
            reason = "webhook deleted" if webhook is None else f"webhook {webhook.status.value}"
            logger.info(
                "webhook_delivery: skipping attempt attempt_id=%s webhook_id=%s content_id=%s "
                "event=%s attempt=%d — %s",
                attempt.id, attempt.webhook_id, attempt.content_id,
                attempt.event.value, attempt.attempt_number, reason,
            )
            await self._record(attempt, _Outcome(DeliveryStatus.SKIPPED, None, reason))
            return

        try:
            outcome = await self._send(attempt, webhook)
        except ConfigurationError as exc:
            await self._release_for_config_fault(attempt, exc)
            return
        except InvalidToken as exc:
            logger.exception(
                "webhook_delivery: invalid secret attempt_id=%s webhook_id=%s content_id=%s "
                "event=%s — disabling webhook",
                attempt.id, attempt.webhook_id, attempt.content_id, attempt.event.value,
            )
            await self._dead_letter(attempt, _Outcome(DeliveryStatus.FAILED, None, f"invalid secret: {exc}"))
            return

        if outcome.status is DeliveryStatus.SUCCEEDED:
            await self._record(attempt, outcome)
            return

        logger.warning(
            "webhook_delivery: attempt failed attempt_id=%s webhook_id=%s content_id=%s event=%s "
            "attempt=%d/%d — %s",
            attempt.id, attempt.webhook_id, attempt.content_id, attempt.event.value,
            attempt.attempt_number, WEBHOOK_MAX_ATTEMPTS, outcome.error,
        )

        if attempt.attempt_number < WEBHOOK_MAX_ATTEMPTS:
            await self._record(attempt, outcome)
            await self._schedule_retry(attempt)
            return

        logger.error(
            "webhook_delivery: exhausted %d attempts webhook_id=%s client_id=%s content_id=%s "
            "event=%s — disabling webhook",
            WEBHOOK_MAX_ATTEMPTS, attempt.webhook_id, attempt.client_id,
            attempt.content_id, attempt.event.value,
        )
        await self._dead_letter(attempt, outcome)

    async def _dead_letter(self, attempt: DeliveryAttempt, outcome: _Outcome) -> None:
        await self._record(attempt, outcome._replace(status=DeliveryStatus.DEAD_LETTERED))
        await self._webhook_repo.update_for_client(
            attempt.client_id, attempt.webhook_id, status=WebhookStatus.DISABLED,
        )

    async def _record(self, attempt: DeliveryAttempt, outcome: _Outcome) -> None:
        await self._delivery_repo.record_attempt_result(
            attempt.id,
            status=outcome.status,
            response_code=outcome.response_code,
            error=outcome.error,
        )

    async def _release_for_config_fault(self, attempt: DeliveryAttempt, exc: Exception) -> None:
        logger.exception(
            "webhook_delivery: configuration fault attempt_id=%s webhook_id=%s content_id=%s "
            "event=%s attempt=%d — not counted toward exhaustion",
            attempt.id, attempt.webhook_id, attempt.content_id, attempt.event.value,
            attempt.attempt_number,
        )
        next_attempt_at = datetime.now(UTC) + timedelta(seconds=WEBHOOK_RETRY_DELAYS_SECONDS[0])
        await self._delivery_repo.release_claim(
            attempt.id,
            next_attempt_at=next_attempt_at,
            error=f"configuration: {exc}",
        )

    async def _schedule_retry(self, attempt: DeliveryAttempt) -> None:
        delay = WEBHOOK_RETRY_DELAYS_SECONDS[attempt.attempt_number - 1]
        await self._delivery_repo.create_pending(
            **attempt.model_dump(
                include={"webhook_id", "content_id", "event", "tenant_id", "client_id", "payload_data"},
                by_alias=True,
            ),
            attempt_number=attempt.attempt_number + 1,
            next_attempt_at=datetime.now(UTC) + timedelta(seconds=delay),
        )

    async def dispatch_terminal_event(self, job: dict[str, Any], event: WebhookEventType) -> None:
        job_id = job.get("_id")
        content_id = job.get("content_id")
        if not content_id:
            logger.error(
                "webhook_delivery: job_id=%s has no content_id — cannot dispatch %s",
                job_id, event.value,
            )
            return

        content_doc = await self._content_repo.find_raw_by_id(content_id)
        if not content_doc:
            logger.warning(
                "webhook_delivery: no content found content_id=%s job_id=%s — skipping %s",
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

        data: dict[str, Any] = {
            "jobId": job_id,
            "contentId": content_id,
            "jobName": "processNewContent",
        }
        if event is WebhookEventType.JOB_COMPLETED:
            data["completedAt"] = _iso(job.get("completed_at"))
        elif event is WebhookEventType.JOB_FAILED:
            data["failedAt"] = _iso(job.get("failed_at"))
            data["error"] = "processing_failed" if job.get("reason") else None

        now = datetime.now(UTC)
        for webhook in webhooks:
            await self._delivery_repo.create_pending(
                webhook_id=webhook.id,
                content_id=content_id,
                event=event,
                tenant_id=tenant_id,
                client_id=webhook.client_id,
                payload_data=data,
                attempt_number=1,
                next_attempt_at=now,
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
