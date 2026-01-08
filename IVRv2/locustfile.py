"""
Load Testing for IVR v2 API using Locust

This file simulates concurrent IVR users interacting with the system.
Tests the FSM cloning fix for concurrent DTMF input handling.

Usage:
    # Install locust first:
    poetry add --group test 
    
    # If you plan on running from webUI mode do not run test data setup/cleanup as it creates redundant data

    # Setup test data:
    poetry run python locustfile.py --setup --users 100

    # Cleanup test data:
    poetry run python locustfile.py --cleanup

    # Run load test (web UI):
    poetry run python locust -f locustfile.py --host=http://localhost:9210

    # Or run from command line (headless):
    poetry run python locust -f locustfile.py --host=http://localhost:9210 \
           --users 100 --spawn-rate 10 --run-time 60s --headless
"""

import sys
import os
import uuid
import random
import logging
import asyncio
from datetime import datetime, timezone

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.utils.mongodb import MongoDB
from dotenv import load_dotenv

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# --- Setup/Cleanup Functions ---


def _get_fsm_id_from_server(host="http://localhost:9210"):
    """Get FSM ID directly from the running server's /latest_fsm_id endpoint"""
    import requests

    try:
        response = requests.get(f"{host}/latest_fsm_id")
        if response.status_code == 200:
            data = response.json()
            print(f"✓ Server is running at {host}")
            return {"fsm_id": data["fsm_id"], "init_state_id": data["init_state_id"]}
        else:
            print(f"ERROR: Server returned status {response.status_code}")
            print(f"Response: {response.text}")
            return None
    except requests.exceptions.ConnectionError:
        print(f"ERROR: Cannot connect to server at {host}")
        print(
            "Please ensure the server is running: poetry run uvicorn app.main:app --host 0.0.0.0 --port 9210"
        )
        return None
    except Exception as e:
        print(f"Could not get FSM ID from server: {e}")
        import traceback

        traceback.print_exc()
        return None


def setup_test_data(num_users=100, host="http://localhost:9210"):
    """Create test IVR state documents in MongoDB."""
    print("=" * 60)
    print(f"SETTING UP LOAD TEST DATA FOR {num_users} USERS")
    print("=" * 60)

    ongoing_fsm_mongo = MongoDB(collection_name="ongoingIVRState")
    fsm_info = _get_fsm_id_from_server(host)

    if fsm_info is None:
        raise RuntimeError(
            "Could not get FSM ID from server. Please ensure the server is running."
        )

    fsm_id = fsm_info["fsm_id"]
    init_state_id = fsm_info["init_state_id"]

    print(f"\n✓ Server's current FSM ID: {fsm_id}")
    print(f"✓ Initial state ID: {init_state_id}")

    # Clean up any existing test data
    print("\n[1/3] Cleaning up existing test data...")
    collection = ongoing_fsm_mongo.get_collection()
    existing_docs = list(collection.find({"_id": {"$regex": "^CON-load-test-"}}))
    if existing_docs:
        print(f"Found {len(existing_docs)} existing test documents")
        for doc in existing_docs:
            collection.delete_one({"_id": doc["_id"]})
        print(f"✓ Cleaned up {len(existing_docs)} test documents")
    else:
        print("✓ No existing test data found")

    # Create test documents
    print(f"\n[2/3] Creating {num_users} test IVR state documents...")
    created_count = 0
    for i in range(num_users):
        conv_id = f"CON-load-test-{uuid.uuid4()}"
        phone_number = f"+91{7000000000 + i}"
        doc = {
            "_id": conv_id,
            "phone_number": phone_number,
            "fsm_id": fsm_id,
            "current_state_id": init_state_id,
            "created_at": datetime.now(),
            "stopped_at": None,
            "duration": "",
            "user_actions": [],
            "stream_playback": [],
            "experience_data": {},
            "call_status_updates": {},
            "version": 0,
        }
        try:
            collection.insert_one(doc)
            created_count += 1
            if (i + 1) % 10 == 0:
                print(f"  Created {i + 1}/{num_users} documents...")
        except Exception as e:
            print(f"✗ Failed to create document {i}: {e}")

    print(f"\n✓ Successfully created {created_count}/{num_users} test documents")
    print("\n" + "=" * 60)
    print("SETUP COMPLETE - Ready for load testing!")
    print("=" * 60)
    print("\nRun load test with:")
    print("  locust -f locustfile.py --host=http://localhost:9210")
    print("\nOr headless mode:")
    print("  locust -f locustfile.py --host=http://localhost:9210 \\")
    print("         --users 100 --spawn-rate 10 --run-time 60s --headless")
    print()


def cleanup_test_data():
    """Clean up all test data from MongoDB"""
    print("=" * 60)
    print("CLEANING UP LOAD TEST DATA")
    print("=" * 60)

    ongoing_fsm_mongo = MongoDB(collection_name="ongoingIVRState")
    collection = ongoing_fsm_mongo.get_collection()
    existing_docs = list(collection.find({"_id": {"$regex": "^CON-load-test-"}}))

    if existing_docs:
        print(f"Found {len(existing_docs)} test documents")
        for doc in existing_docs:
            collection.delete_one({"_id": doc["_id"]})
        print(f"✓ Cleaned up {len(existing_docs)} test documents")
    else:
        print("No test data found")

    print("\n" + "=" * 60)
    print("CLEANUP COMPLETE")
    print("=" * 60)


# --- CLI Entrypoint (for setup/cleanup only) ---
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Setup or cleanup load test data")
    parser.add_argument("--setup", action="store_true", help="Setup test data")
    parser.add_argument("--cleanup", action="store_true", help="Cleanup test data")
    parser.add_argument(
        "--users",
        type=int,
        default=100,
        help="Number of test users to create (default: 100)",
    )
    args = parser.parse_args()

    if args.cleanup:
        cleanup_test_data()
        sys.exit(0)
    elif args.setup:
        setup_test_data(num_users=args.users)
        sys.exit(0)


# --- Locust Load Testing Code ---

from locust import HttpUser, task, between, events

# Track statistics
success_count = 0
error_count = 0
state_transitions = {}

# MongoDB connection (shared across all users)
ongoing_fsm_mongo = None
fsm_mongo = None
actual_fsm_id = None  # Will be populated during startup
latest_fsm_id = None


@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when test starts - Initialize MongoDB and fetch actual FSM ID"""
    global success_count, error_count, state_transitions, ongoing_fsm_mongo, fsm_mongo, actual_fsm_id, latest_fsm_id
    success_count = 0
    error_count = 0
    state_transitions = {}

    # Initialize MongoDB connections
    ongoing_fsm_mongo = MongoDB(collection_name="ongoingIVRState")
    fsm_mongo = MongoDB(collection_name="fsm")

    # Fetch actual FSM ID from an existing test document created by setup script
    # This avoids async event loop issues in Locust's thread
    collection = ongoing_fsm_mongo.get_collection()
    test_doc = collection.find_one({"_id": {"$regex": "^CON-load-test-"}})

    if test_doc is None:
        raise RuntimeError(
            "No test data found! Please run setup first:\n"
            "  poetry run python locustfile.py --setup --users 50"
        )

    actual_fsm_id = test_doc["fsm_id"]
    latest_fsm_id = test_doc["fsm_id"]

    logger.info("=" * 60)
    logger.info("LOAD TEST STARTED")
    logger.info(f"MongoDB initialized: {ongoing_fsm_mongo is not None}")
    logger.info(f"✓ FSM ID loaded from test data: {actual_fsm_id}")
    logger.info(
        f"✓ Found {collection.count_documents({'_id': {'$regex': '^CON-load-test-'}})} test documents"
    )
    logger.info("=" * 60)


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when test stops - print summary"""
    logger.info("=" * 60)
    logger.info("LOAD TEST COMPLETED")
    logger.info(f"Total Successful Requests: {success_count}")
    logger.info(f"Total Failed Requests: {error_count}")
    logger.info(f"State Transitions: {state_transitions}")
    logger.info("=" * 60)


class IVRUser(HttpUser):
    """
    Simulates a user calling into the IVR system.

    Each user:
    1. Gets a unique conversation_uuid
    2. Starts at language selection menu (LA0)
    3. Presses various keys to navigate menus
    4. Validates NCCO responses
    """

    wait_time = between(1, 3)

    def on_start(self):
        """Called when a simulated user starts - creates IVR state in MongoDB"""
        global actual_fsm_id

        self.conv_id = f"CON-load-test-{uuid.uuid4()}"
        self.phone = f"+91{random.randint(7000000000, 9999999999)}"
        self.current_state = "LA0"

        # Create IVR state document in MongoDB (synchronous)
        try:
            doc = {
                "_id": self.conv_id,
                "phone_number": self.phone,
                "fsm_id": actual_fsm_id or "default-fsm",
                "current_state_id": "LA0",
                "created_at": datetime.now(),
                "stopped_at": None,
                "duration": "",
                "user_actions": [],
                "stream_playback": [],
                "experience_data": {},
                "call_status_updates": {},
                "version": 0,
            }

            if ongoing_fsm_mongo:
                collection = ongoing_fsm_mongo.get_collection()
                collection.insert_one(doc)
                logger.info(f"✓ User created in DB: conv_id={self.conv_id}")
            else:
                logger.warning(f"⚠ MongoDB not initialized, skipping document creation")

        except Exception as e:
            logger.error(f"✗ Failed to create user state: {e}")

    @task(5)
    def select_language(self):
        """
        Task: Select language (1=Kannada, 2=Bengali, 3=English)
        Weight: 5 (highest probability)
        """
        digit = random.choice(["1", "2", "3"])
        self._send_dtmf(digit=digit, task_name="Select Language")

    @task(3)
    def navigate_theme_menu(self):
        """
        Task: Navigate theme selection menu
        Weight: 3
        """
        digit = random.choice(["1", "8", "9"])  # 1=select, 8=repeat, 9=back
        self._send_dtmf(digit=digit, task_name="Navigate Theme")

    @task(2)
    def navigate_exercise_menu(self):
        """
        Task: Navigate exercise selection menu
        Weight: 2
        """
        digit = random.choice(["1", "8", "9"])
        self._send_dtmf(digit=digit, task_name="Navigate Exercise")

    @task(1)
    def press_invalid_key(self):
        """
        Task: Press invalid key (should return error message)
        Weight: 1 (lowest probability)
        """
        digit = random.choice(["#", "*", "4", "5", "6", "7", "0"])
        self._send_dtmf(digit=digit, task_name="Invalid Key Press")

    @task(1)
    def timeout_input(self):
        """
        Task: Simulate timeout (empty input)
        Weight: 1
        """
        self._send_dtmf(digit="", task_name="Timeout/Empty Input", is_timeout=True)

    @task(1)
    def rapid_sequential_inputs(self):
        """Simulate rapid DTMF inputs for a single conversation."""
        for digit in ["1", "2", "3", "1", "2"]:
            self._send_dtmf(digit=digit, task_name="Rapid Sequential")

    @task(1)
    def concurrent_same_conversation(self):
        """Simulate two requests with the same conversation_uuid arriving nearly simultaneously."""
        self._send_dtmf(digit="1", task_name="Concurrent Request 1")
        self._send_dtmf(digit="2", task_name="Concurrent Request 2")

    def _send_dtmf(self, digit, task_name, is_timeout=False):
        """
        Send DTMF input to /input endpoint and validate response.

        Args:
            digit: The digit pressed (or empty string for timeout)
            task_name: Name for logging/metrics
            is_timeout: Whether this is a timeout scenario (optional)
        """
        global success_count, error_count, state_transitions

        payload = {
            "conversation_uuid": self.conv_id,
            "dtmf": {"digits": digit, "timed_out": is_timeout},
            "from": self.phone,
            "to": "442079460000",
            "uuid": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }

        with self.client.post(
            "/input", json=payload, catch_response=True, name=task_name
        ) as response:
            try:
                if response.status_code != 200:
                    response.failure(f"Status {response.status_code}")
                    error_count += 1
                    return

                # Validate NCCO response
                ncco = response.json()

                if not isinstance(ncco, list):
                    response.failure("NCCO is not a list")
                    error_count += 1
                    return

                if len(ncco) == 0:
                    response.failure("NCCO is empty")
                    error_count += 1
                    return

                # Check for required NCCO actions (stream or talk)
                has_stream = any(action.get("action") == "stream" for action in ncco)
                has_talk = any(action.get("action") == "talk" for action in ncco)
                has_input = any(action.get("action") == "input" for action in ncco)

                if not (has_stream or has_talk):
                    response.failure("NCCO missing stream/talk action")
                    error_count += 1
                    return

                # Track state transition
                transition_key = f"{self.current_state} -> {digit}"
                state_transitions[transition_key] = (
                    state_transitions.get(transition_key, 0) + 1
                )

                response.success()
                success_count += 1

                logger.debug(
                    f"✓ {task_name}: conv_id={self.conv_id}, digit='{digit}', state={self.current_state}, ncco_actions={len(ncco)}"
                )

            except Exception as e:
                response.failure(f"Exception: {str(e)}")
                error_count += 1
                logger.error(f"✗ {task_name} failed: {e}")


class QuickLoadTest(HttpUser):
    """
    Quick smoke test user - just hammers the language selection.
    Useful for rapid testing of concurrent FSM cloning.
    """

    wait_time = between(0.1, 0.5)

    def on_start(self):
        """Called when a simulated user starts - creates IVR state in MongoDB"""
        global actual_fsm_id

        self.conv_id = f"CON-quick-{uuid.uuid4()}"
        self.phone = f"+91{random.randint(7000000000, 9999999999)}"

        try:
            doc = {
                "_id": self.conv_id,
                "phone_number": self.phone,
                "fsm_id": actual_fsm_id or "default-fsm",
                "current_state_id": "LA0",
                "created_at": datetime.now(),
                "stopped_at": None,
                "duration": "",
                "user_actions": [],
                "stream_playback": [],
                "experience_data": {},
                "call_status_updates": {},
                "version": 0,
            }

            if ongoing_fsm_mongo:
                collection = ongoing_fsm_mongo.get_collection()
                collection.insert_one(doc)
                logger.info(f"✓ Quick user created in DB: conv_id={self.conv_id}")
            else:
                logger.warning(f"⚠ MongoDB not initialized, skipping document creation")

        except Exception as e:
            logger.error(f"✗ Failed to create quick user state: {e}")

    @task
    def rapid_language_selection(self):
        """Rapidly select languages to stress test FSM cloning"""
        digit = random.choice(["1", "2", "3"])
        payload = {
            "conversation_uuid": self.conv_id,
            "dtmf": {"digits": digit, "timed_out": False},
        }

        with self.client.post("/input", json=payload, catch_response=True) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Status {response.status_code}")
