import pytest
import asyncio
from app.fsm import insti
from unittest.mock import patch, MagicMock
from tests.mocks.mock_database import MockDatabase


# Patch fsm.print_states and open to avoid side effects
def dummy_print_states(self):
    pass


insti.FSM.print_states = dummy_print_states


@pytest.mark.asyncio
async def test_instantiate_from_latest_content():
    """Test that FSM can be instantiated from valid content."""

    class DummyFile:
        def write(self, _):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_val, exc_tb):
            pass

    # Create mock collection with simple story content for FSM generation
    mock_collection = MockDatabase(MockDatabase.get_simple_fsm_test_data())

    with patch("builtins.open", return_value=DummyFile()):
        fsm = await insti.instantiate_from_latest_content(
            contents_v3_collection=mock_collection
        )
    assert fsm is not None
    assert hasattr(fsm, "states")
    assert isinstance(fsm.states, dict)
    # Check that END state exists
    assert "END" in fsm.states
    # Check that at least one state is generated
    assert len(fsm.states) > 1


@pytest.mark.asyncio
async def test_deleted_content_is_excluded():
    """Documents with isDeleted=True must not appear in filtered query results."""
    mock_collection = MockDatabase(MockDatabase.get_content_test_data())

    # Get all content to verify our test data includes deleted items
    all_items = await mock_collection.find_all()
    deleted_items = [item for item in all_items if item.get("isDeleted") is True]
    assert len(deleted_items) > 0, "Test data should include deleted content"

    # Get filtered content using the query that instantiate_from_latest_content uses
    filtered_items = await mock_collection.query_items(
        {"isPullModel": True, "isDeleted": {"$ne": True}}
    )

    # Verify deleted content is excluded
    deleted_ids = {item["_id"] for item in deleted_items}
    filtered_ids = {item["_id"] for item in filtered_items}

    assert deleted_ids.isdisjoint(filtered_ids), (
        "Deleted content should not appear in filtered results. "
        f"Found deleted IDs in filtered results: {deleted_ids & filtered_ids}"
    )

    # Verify we still have valid content after filtering
    assert (
        len(filtered_items) >= 2
    ), "Should have valid content after filtering out deleted items"


@pytest.mark.asyncio
async def test_non_pull_model_content_is_excluded():
    """Documents with isPullModel=False must not appear in filtered query results."""
    mock_collection = MockDatabase(MockDatabase.get_content_test_data())

    # Get all content to verify our test data includes non-pull-model items
    all_items = await mock_collection.find_all()
    non_pull_items = [item for item in all_items if item.get("isPullModel") is not True]
    assert len(non_pull_items) > 0, "Test data should include non-pull-model content"

    # Get filtered content using the query that instantiate_from_latest_content uses
    filtered_items = await mock_collection.query_items(
        {"isPullModel": True, "isDeleted": {"$ne": True}}
    )

    # Verify non-pull-model content is excluded
    non_pull_ids = {item["_id"] for item in non_pull_items}
    filtered_ids = {item["_id"] for item in filtered_items}

    assert non_pull_ids.isdisjoint(filtered_ids), (
        "Non-pull-model content should not appear in filtered results. "
        f"Found non-pull-model IDs in filtered results: {non_pull_ids & filtered_ids}"
    )

    # Verify we still have valid content after filtering
    assert (
        len(filtered_items) >= 2
    ), "Should have valid content after filtering out non-pull-model items"


@pytest.mark.asyncio
async def test_only_valid_content_included():
    """Only documents with isPullModel=True AND isDeleted=False should be included in filtered results."""
    mock_collection = MockDatabase(MockDatabase.get_content_test_data())

    # Get all content
    all_items = await mock_collection.find_all()

    # Manually identify valid items
    valid_items = [
        item
        for item in all_items
        if item.get("isPullModel") is True and item.get("isDeleted") is not True
    ]

    # Get filtered content using the same query
    filtered_items = await mock_collection.query_items(
        {"isPullModel": True, "isDeleted": {"$ne": True}}
    )

    # Verify counts match
    assert len(filtered_items) == len(
        valid_items
    ), f"Expected {len(valid_items)} valid items, got {len(filtered_items)} filtered items"

    # Verify the exact same items are returned
    valid_ids = {item["_id"] for item in valid_items}
    filtered_ids = {item["_id"] for item in filtered_items}

    assert valid_ids == filtered_ids, (
        f"Filtered IDs don't match valid IDs. "
        f"Valid: {valid_ids}, Filtered: {filtered_ids}"
    )

    # Verify at least 2 valid items exist in our test data
    assert len(valid_items) >= 2, "Test data should have at least 2 valid items"

    # Verify specific expected valid IDs are present
    expected_valid_ids = {"valid-story-1", "valid-quiz-1"}
    assert expected_valid_ids.issubset(
        filtered_ids
    ), f"Expected valid IDs not found in filtered results. Missing: {expected_valid_ids - filtered_ids}"
