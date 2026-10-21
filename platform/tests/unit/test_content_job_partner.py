from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from app.consumers.content_job_consumer import _process_audio_content_job


def _repos(doc):
    job_repo = MagicMock(mark_running=AsyncMock(), mark_completed=AsyncMock(), mark_failed=AsyncMock())
    content_repo = MagicMock(find_raw_by_id=AsyncMock(return_value=doc), save_processed=AsyncMock())
    partner_repo = MagicMock(
        find_partner_content=AsyncMock(return_value=doc), update_partner_content=AsyncMock()
    )
    return job_repo, content_repo, partner_repo


async def test_partner_job_uses_aggregator_repo():
    job_repo, content_repo, partner_repo = _repos({"content_id": "c1", "audio_content": []})
    job = {"_id": "j1", "content_id": "c1", "tenant_id": "t1", "source": "partner"}
    await _process_audio_content_job(job, job_repo, content_repo, MagicMock(), partner_repo)
    partner_repo.find_partner_content.assert_awaited_once_with("t1", "c1")
    partner_repo.update_partner_content.assert_awaited_once()
    content_repo.find_raw_by_id.assert_not_awaited()
    content_repo.save_processed.assert_not_awaited()


async def test_teacher_job_still_uses_content_repo():
    job_repo, content_repo, partner_repo = _repos({"audio_content": []})
    job = {"_id": "j1", "content_id": "c1"}
    await _process_audio_content_job(job, job_repo, content_repo, MagicMock(), partner_repo)
    content_repo.save_processed.assert_awaited_once()
    partner_repo.find_partner_content.assert_not_awaited()
