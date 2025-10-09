import pytest
import sys
import os
from datetime import datetime, timezone
from enum import Enum
from json import JSONEncoder
import json

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from utils.functions import format_data_html, CustomJSONEncoder


class TestUtilityFunctions:
    """Unit tests for utility functions in utils.functions module."""

    def test_format_data_html_with_dict(self):
        """Test format_data_html with dictionary input."""
        test_data = {"name": "John", "age": 30}
        result = format_data_html(test_data)
        
        assert isinstance(result, str)
        assert '<ul role="tree">' in result
        assert '<strong>name</strong>' in result
        assert '<strong>age</strong>' in result
        assert 'aria-level="1"' in result

    def test_format_data_html_with_nested_dict(self):
        """Test format_data_html with nested dictionary."""
        test_data = {
            "person": {
                "name": "John",
                "details": {"age": 30, "city": "NYC"}
            }
        }
        result = format_data_html(test_data)
        
        assert isinstance(result, str)
        assert '<ul role="tree">' in result
        assert '<ul role="group">' in result
        assert 'aria-level="1"' in result
        assert 'aria-level="2"' in result

    def test_format_data_html_with_set(self):
        """Test format_data_html with set input."""
        test_data = {"items": {"apple", "banana", "cherry"}}
        result = format_data_html(test_data)
        
        assert isinstance(result, str)
        assert '<ul>' in result
        assert '<li>' in result

    def test_format_data_html_with_empty_dict(self):
        """Test format_data_html with empty dictionary."""
        test_data = {}
        result = format_data_html(test_data)
        
        assert result == '<ul role="tree"></ul>'

    def test_format_data_html_with_mixed_data(self):
        """Test format_data_html with mixed data types."""
        test_data = {
            "string": "value",
            "number": 42,
            "nested": {"key": "value"},
            "set_data": {"item1", "item2"}
        }
        result = format_data_html(test_data)
        
        assert isinstance(result, str)
        assert 'string' in result
        assert 'number' in result
        assert 'nested' in result
        assert 'set_data' in result


class TestEnum(Enum):
    """Test enum for CustomJSONEncoder testing."""
    VALUE_A = "value_a"
    VALUE_B = "value_b"


class TestCustomJSONEncoder:
    """Unit tests for CustomJSONEncoder class."""

    def test_custom_json_encoder_inheritance(self):
        """Test that CustomJSONEncoder inherits from JSONEncoder."""
        encoder = CustomJSONEncoder()
        assert isinstance(encoder, JSONEncoder)
        assert isinstance(encoder, CustomJSONEncoder)

    def test_custom_json_encoder_with_enum(self):
        """Test CustomJSONEncoder with Enum values."""
        encoder = CustomJSONEncoder()
        test_enum = TestEnum.VALUE_A
        
        result = encoder.default(test_enum)
        assert result == "value_a"

    def test_custom_json_encoder_with_datetime(self):
        """Test CustomJSONEncoder with datetime values."""
        encoder = CustomJSONEncoder()
        test_datetime = datetime(2023, 12, 25, 15, 30, 45, 123456, tzinfo=timezone.utc)
        
        result = encoder.default(test_datetime)
        assert isinstance(result, str)
        assert "2023-12-25T15:30:45.123Z" == result

    def test_custom_json_encoder_json_dumps_integration(self):
        """Test CustomJSONEncoder integration with json.dumps."""
        test_data = {
            "enum_value": TestEnum.VALUE_B,
            "datetime_value": datetime(2023, 6, 15, 12, 30, 0, tzinfo=timezone.utc),
            "string_value": "test"
        }
        
        result = json.dumps(test_data, cls=CustomJSONEncoder)
        parsed = json.loads(result)
        
        assert parsed["enum_value"] == "value_b"
        assert parsed["datetime_value"] == "2023-06-15T12:30:00.000Z"
        assert parsed["string_value"] == "test"