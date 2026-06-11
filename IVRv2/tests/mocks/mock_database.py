"""
Mock database implementation for testing.
Implements IDatabase interface without requiring real MongoDB connection.
"""

from typing import Any, Dict, List, Optional
from app.interfaces.database import IDatabase


class MockDatabase(IDatabase):
    """
    In-memory mock database for testing.
    Implements all IDatabase methods without external dependencies.
    """

    def __init__(self, initial_data: Optional[List[Dict[str, Any]]] = None):
        """
        Initialize mock database with optional initial data.

        Args:
            initial_data: List of documents to pre-populate the database
        """
        self.data: List[Dict[str, Any]] = initial_data.copy() if initial_data else []
        self._id_counter = 1000

    async def find_by_id(self, id_string: str) -> Optional[Dict[str, Any]]:
        """Find document by _id or id field"""
        for item in self.data:
            if str(item.get("_id")) == id_string or str(item.get("id")) == id_string:
                return item.copy()
        return None

    async def find_one_by_query(self, query: dict) -> Optional[Dict[str, Any]]:
        """Find first document matching all query criteria"""
        for item in self.data:
            if all(item.get(k) == v for k, v in query.items()):
                return item.copy()
        return None

    async def find_all(self) -> List[Dict[str, Any]]:
        """Return all documents"""
        return [item.copy() for item in self.data]

    async def query_items(self, query: dict) -> List[Dict[str, Any]]:
        """Find all documents matching query criteria with MongoDB operator support.

        Supports:
        - Direct equality: {"field": value}
        - $ne operator: {"field": {"$ne": value}}
        - $in operator: {"field": {"$in": [values]}}
        - $gt, $gte, $lt, $lte operators for comparisons
        """

        def matches(doc, query_dict):
            for key, cond in query_dict.items():
                # Handle operator objects (e.g., {"isDeleted": {"$ne": True}})
                if isinstance(cond, dict):
                    # $ne - not equal
                    if "$ne" in cond:
                        if doc.get(key) == cond["$ne"]:
                            return False
                    # $in - value in list
                    elif "$in" in cond:
                        if doc.get(key) not in cond["$in"]:
                            return False
                    # $gt - greater than
                    elif "$gt" in cond:
                        if not (
                            doc.get(key) is not None and doc.get(key) > cond["$gt"]
                        ):
                            return False
                    # $gte - greater than or equal
                    elif "$gte" in cond:
                        if not (
                            doc.get(key) is not None and doc.get(key) >= cond["$gte"]
                        ):
                            return False
                    # $lt - less than
                    elif "$lt" in cond:
                        if not (
                            doc.get(key) is not None and doc.get(key) < cond["$lt"]
                        ):
                            return False
                    # $lte - less than or equal
                    elif "$lte" in cond:
                        if not (
                            doc.get(key) is not None and doc.get(key) <= cond["$lte"]
                        ):
                            return False
                    else:
                        # Unsupported operator - fail the match to be safe
                        return False
                else:
                    # Direct equality
                    if doc.get(key) != cond:
                        return False
            return True

        results = []
        for item in self.data:
            if matches(item, query):
                results.append(item.copy())
        return results

    async def insert(self, doc: dict) -> Any:
        """Insert new document and return its ID"""
        new_doc = doc.copy()

        # Generate ID if not provided
        if "_id" not in new_doc and "id" not in new_doc:
            new_doc["_id"] = str(self._id_counter)
            self._id_counter += 1

        self.data.append(new_doc)
        return new_doc.get("_id") or new_doc.get("id")

    async def update_document(self, id: str, new_doc: dict) -> Any:
        """Replace document with matching ID"""
        for i, item in enumerate(self.data):
            if str(item.get("_id")) == id or str(item.get("id")) == id:
                # Preserve the ID in the new document
                updated_doc = new_doc.copy()
                if "_id" not in updated_doc:
                    updated_doc["_id"] = item.get("_id")
                if "id" not in updated_doc and "id" in item:
                    updated_doc["id"] = item.get("id")

                self.data[i] = updated_doc
                return {"modified_count": 1, "matched_count": 1}

        # If not found, upsert (insert new)
        new_doc_copy = new_doc.copy()
        new_doc_copy["_id"] = id
        self.data.append(new_doc_copy)
        return {"modified_count": 0, "matched_count": 0, "upserted_id": id}

    async def delete(self, id: str) -> Any:
        """Delete document with matching ID"""
        for i, item in enumerate(self.data):
            if str(item.get("_id")) == id or str(item.get("id")) == id:
                del self.data[i]
                return {"deleted_count": 1}
        return {"deleted_count": 0}

    async def find_top_one(self, attr: str) -> Optional[Dict[str, Any]]:
        """Find document with highest value for given attribute"""
        if not self.data:
            return None

        # Filter out items without the attribute
        items_with_attr = [item for item in self.data if attr in item]

        if not items_with_attr:
            return None

        # Find max by attribute
        top_item = max(items_with_attr, key=lambda x: x.get(attr, 0))
        return top_item.copy()

    async def update_one(self, filter_query: dict, update_query: dict) -> Any:
        """Update a single document with atomic operators.

        Args:
            filter_query: The filter to match documents (e.g., {"_id": "value"})
            update_query: The update operations (e.g., {"$set": {"field": "value"}})

        Returns:
            A result object with modified_count, matched_count, etc.
        """
        for i, item in enumerate(self.data):
            # Check if item matches filter query
            if all(item.get(k) == v for k, v in filter_query.items()):
                # Apply atomic operations
                updated_item = item.copy()

                # Handle $set operator
                if "$set" in update_query:
                    updated_item.update(update_query["$set"])

                # Handle other operators as needed
                # $inc, $push, etc. can be added here

                self.data[i] = updated_item
                return {"matched_count": 1, "modified_count": 1, "acknowledged": True}

        # No match found
        return {"matched_count": 0, "modified_count": 0, "acknowledged": True}

    def clear(self):
        """Clear all data (useful for test cleanup)"""
        self.data = []
        self._id_counter = 1000

    def add_data(self, documents: List[Dict[str, Any]]):
        """Add multiple documents at once"""
        self.data.extend([doc.copy() for doc in documents])

    def get_all_data(self) -> List[Dict[str, Any]]:
        """Get all data (for test assertions)"""
        return [item.copy() for item in self.data]

    def count(self) -> int:
        """Get count of documents"""
        return len(self.data)

    @staticmethod
    def get_content_test_data() -> List[Dict[str, Any]]:
        """Return diverse test data including valid, deleted, and non-pull-model content.

        Useful for testing content filtering logic (e.g., isPullModel, isDeleted flags).
        """
        return [
            # Valid content: isPullModel=True, isDeleted=False
            {
                "_id": "valid-story-1",
                "type": "story",
                "description": "Kannada Story",
                "language": "kn",
                "title": {
                    "english": "Snehitaru",
                    "local": "ನಾನು ಮತ್ತು ನನ್ನ ಶರೀರ",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/experience-titles/20/1.0.mp3",
                },
                "theme": {
                    "english": "Our body and its functions",
                    "local": "ನಮ್ಮ ದೇಹ ಮತ್ತು ಅದರ ಕಾರ್ಯಗಳು",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/theme-titles/Our%20body%20and%20its%20functions/1.0.mp3",
                },
                "audioContent": [
                    {
                        "description": "some optional description of audio",
                        "audioUrl": "https://seedsblob.blob.core.windows.net/output-container/20/1.0.wav",
                    }
                ],
                "isPullModel": True,
                "isTeacherApp": True,
                "createdBy": "default_user_ID",
                "creation_time": 1668287376,
                "isDeleted": False,
            },
            # Valid content: isPullModel=True, isDeleted=False (second item)
            {
                "_id": "valid-quiz-1",
                "type": "quiz",
                "description": "Hindi Quiz",
                "language": "hi",
                "localTitle": "गणित प्रश्नोत्तरी",
                "titleAudio": "https://seedsblob.blob.core.windows.net/experience-titles/30/1.0.mp3",
                "theme": {
                    "english": "Mathematics",
                    "local": "गणित",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/theme-titles/Mathematics/1.0.mp3",
                },
                "audioContent": [],
                "isPullModel": True,
                "isTeacherApp": True,
                "createdBy": "teacher_123",
                "creation_time": 1668287400,
                "isDeleted": False,
            },
            # Deleted content: isPullModel=True, isDeleted=True (should be filtered out)
            {
                "_id": "deleted-story-1",
                "type": "story",
                "description": "Deleted Tamil Story",
                "language": "ta",
                "title": {
                    "english": "Old Story",
                    "local": "பழைய கதை",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/experience-titles/40/1.0.mp3",
                },
                "theme": {
                    "english": "Nature",
                    "local": "இயற்கை",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/theme-titles/Nature/1.0.mp3",
                },
                "audioContent": [
                    {
                        "description": "deleted audio",
                        "audioUrl": "https://seedsblob.blob.core.windows.net/output-container/40/1.0.wav",
                    }
                ],
                "isPullModel": True,
                "isTeacherApp": True,
                "createdBy": "teacher_456",
                "creation_time": 1668100000,
                "isDeleted": True,  # This should be filtered out
            },
            # Non-pull-model content: isPullModel=False, isDeleted=False (should be filtered out)
            {
                "_id": "non-pull-story-1",
                "type": "story",
                "description": "Non-Pull Odia Story",
                "language": "or",
                "title": {
                    "english": "Push Model Story",
                    "local": "ପୁସ୍ ମଡେଲ୍ କାହାଣୀ",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/experience-titles/50/1.0.mp3",
                },
                "theme": {
                    "english": "Science",
                    "local": "ବିଜ୍ଞାନ",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/theme-titles/Science/1.0.mp3",
                },
                "audioContent": [
                    {
                        "description": "push model audio",
                        "audioUrl": "https://seedsblob.blob.core.windows.net/output-container/50/1.0.wav",
                    }
                ],
                "isPullModel": False,  # This should be filtered out
                "isTeacherApp": True,
                "createdBy": "teacher_789",
                "creation_time": 1668200000,
                "isDeleted": False,
            },
            # Both flags wrong: isPullModel=False, isDeleted=True (should be filtered out)
            {
                "_id": "invalid-content-1",
                "type": "quiz",
                "description": "Invalid Content",
                "language": "mr",
                "localTitle": "अवैध प्रश्नमंजुषा",
                "titleAudio": "https://seedsblob.blob.core.windows.net/experience-titles/60/1.0.mp3",
                "theme": {
                    "english": "General",
                    "local": "सामान्य",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/theme-titles/General/1.0.mp3",
                },
                "audioContent": [],
                "isPullModel": False,  # Wrong
                "isTeacherApp": False,
                "createdBy": "unknown",
                "creation_time": 1668000000,
                "isDeleted": True,  # Wrong
            },
        ]

    @staticmethod
    def get_simple_fsm_test_data() -> List[Dict[str, Any]]:
        """Return simple story test data for FSM generation tests.

        Useful for testing FSM instantiation with minimal, valid content.
        """
        return [
            {
                "_id": "test-story-1",
                "type": "story",
                "description": "Kannada Story",
                "language": "kn",
                "title": {
                    "english": "Test Story",
                    "local": "ಪರೀಕ್ಷಾ ಕಥೆ",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/experience-titles/20/1.0.mp3",
                },
                "theme": {
                    "english": "Our body and its functions",
                    "local": "ನಮ್ಮ ದೇಹ ಮತ್ತು ಅದರ ಕಾರ್ಯಗಳು",
                    "audioUrl": "https://seedsblob.blob.core.windows.net/theme-titles/Our%20body%20and%20its%20functions/1.0.mp3",
                },
                "audioContent": [
                    {
                        "description": "test audio",
                        "audioUrl": "https://seedsblob.blob.core.windows.net/output-container/20/1.0.wav",
                    }
                ],
                "isPullModel": True,
                "isTeacherApp": True,
                "createdBy": "test_user",
                "creation_time": 1668287376,
                "isDeleted": False,
            }
        ]
