import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from app.utils.daily_limit import (
    get_daily_usage,
    increment_daily_usage,
    is_limit_exceeded,
    get_ist_date_string,
)


class TestGetIstDateString:
    def test_returns_date_string_format(self):
        result = get_ist_date_string()
        # Should be YYYY-MM-DD format
        assert len(result) == 10
        assert result[4] == "-"
        assert result[7] == "-"


class TestGetDailyUsage:
    @pytest.mark.asyncio
    async def test_returns_zero_when_no_document(self):
        mock_collection = AsyncMock()
        mock_collection.find_one_by_query = AsyncMock(return_value=None)

        result = await get_daily_usage(mock_collection, "+919876543210", "2026-03-27")
        assert result == 0

    @pytest.mark.asyncio
    async def test_returns_total_seconds_from_document(self):
        mock_collection = AsyncMock()
        mock_collection.find_one_by_query = AsyncMock(
            return_value={"phone_number": "+919876543210", "date": "2026-03-27", "total_seconds": 300}
        )

        result = await get_daily_usage(mock_collection, "+919876543210", "2026-03-27")
        assert result == 300


class TestIncrementDailyUsage:
    @pytest.mark.asyncio
    async def test_calls_update_one_with_upsert(self):
        mock_collection = AsyncMock()
        mock_collection.collection = MagicMock()
        mock_collection.collection.update_one = AsyncMock()

        await increment_daily_usage(
            mock_collection, "+919876543210", "2026-03-27", 180,
            tenant_id="tenant-1", school_id="school-1"
        )

        mock_collection.collection.update_one.assert_called_once()
        call_args = mock_collection.collection.update_one.call_args
        assert call_args[0][0] == {"phone_number": "+919876543210", "date": "2026-03-27"}
        assert "$inc" in call_args[0][1]
        assert call_args[0][1]["$inc"]["total_seconds"] == 180
        assert call_args[1]["upsert"] is True


class TestIsLimitExceeded:
    @pytest.mark.asyncio
    async def test_not_exceeded_when_under_limit(self):
        mock_collection = AsyncMock()
        mock_collection.find_one_by_query = AsyncMock(
            return_value={"total_seconds": 300}
        )

        result = await is_limit_exceeded(mock_collection, "+919876543210", "2026-03-27", 7200)
        assert result is False

    @pytest.mark.asyncio
    async def test_exceeded_when_at_limit(self):
        mock_collection = AsyncMock()
        mock_collection.find_one_by_query = AsyncMock(
            return_value={"total_seconds": 7200}
        )

        result = await is_limit_exceeded(mock_collection, "+919876543210", "2026-03-27", 7200)
        assert result is True

    @pytest.mark.asyncio
    async def test_exceeded_when_over_limit(self):
        mock_collection = AsyncMock()
        mock_collection.find_one_by_query = AsyncMock(
            return_value={"total_seconds": 8000}
        )

        result = await is_limit_exceeded(mock_collection, "+919876543210", "2026-03-27", 7200)
        assert result is True

    @pytest.mark.asyncio
    async def test_not_exceeded_when_no_usage(self):
        mock_collection = AsyncMock()
        mock_collection.find_one_by_query = AsyncMock(return_value=None)

        result = await is_limit_exceeded(mock_collection, "+919876543210", "2026-03-27", 7200)
        assert result is False


from app.utils.duration_announcement import get_daily_limit_announcement


class TestGetDailyLimitAnnouncement:
    def test_english_announcement(self):
        result = get_daily_limit_announcement("en")
        assert "daily listening limit" in result.lower()

    def test_kannada_announcement(self):
        result = get_daily_limit_announcement("kn")
        assert len(result) > 0

    def test_unknown_language_falls_back_to_default_language(self):
        result = get_daily_limit_announcement("unknown_lang")
        assert len(result) > 0
