# platform

Unified FastAPI backend replacing `backend-server`, `ConferenceV2`, and `IVRv2` as a single deployable service. Supports split workloads — run API and consumer tiers independently with the same image.

## Structure

```
platform/
├── app/
│   ├── main.py                  # FastAPI app + lifespan + conditional router mount
│   ├── router.py                # Single router — all controllers registered here
│   ├── platform/                # Cross-cutting: settings, auth, logging, telemetry, error handling
│   │   └── auth/                # JWT, bcrypt, Firebase + native providers, FastAPI deps
│   ├── models/                  # Pydantic domain models (user, conference, ivr_state, content, …)
│   ├── repositories/            # Motor async data access (one file per domain)
│   ├── services/                # Business logic
│   │   └── fsm/                 # IVR finite state machine engine
│   ├── controllers/             # HTTP handlers grouped by function (not origin service)
│   ├── consumers/               # Async background consumers (audio, IVR queues, content jobs)
│   └── providers/               # External clients (Vonage, Azure Service Bus, Blob, WebSocket)
│       └── vonage_actions/      # NCCO action builders
├── migrations/                  # MongoDB migration scripts (with verify + rollback pairs)
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── security/
│   └── regression/
└── tools/
    └── parity_check.py          # Endpoint parity verification against golden contracts
```

## Prerequisites

- Python >= 3.12
- [Poetry](https://python-poetry.org/docs/#installation)
- MongoDB (local or Atlas)
- `ffmpeg` on PATH (required for content job consumer audio processing)

## Install

```bash
cd platform
poetry install
```

## Configure

Copy `env.example` to `.env` and fill in values:

```bash
cp env.example .env
```

### Key variables

| Variable | Required | Description |
|----------|----------|-------------|
| `APP_MODE` | no | `api` \| `consumer` \| `all` (default: `all`) |
| `ENV` | no | `development` \| `staging` \| `production` (default: `development`) |
| `MONGO_DB_CONNECTION_STRING` | yes | MongoDB connection string |
| `SECRET_KEY` | yes | JWT signing secret |
| `AUTH_TYPE` | no | `native` \| `firebase` (default: `native`) |
| `JWT_EXPIRES_IN` | no | Token expiry in ms or duration string (default: `3000000`) |
| `VONAGE_API_KEY` | for calls | Vonage API key |
| `VONAGE_API_SECRET` | for calls | Vonage API secret |
| `VONAGE_APPLICATION_ID` | for calls | Vonage application ID |
| `VONAGE_APPLICATION_PRIVATE_KEY64` | for webhooks | Base64-encoded Vonage private key (HMAC verification) |
| `AZURE_SERVICE_BUS_CONNECTION_STRING` | for consumers | Azure Service Bus connection string |
| `AZURE_STORAGE_CONNECTION_STRING` | for content/audio | Azure Blob Storage connection string |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | no | App Insights (telemetry disabled if absent) |
| `WS_CONTROL_SECRET` | for prod | Shared secret for websocket-service control channel |
| `CORS_ALLOWED_ORIGINS` | for prod | Comma-separated allowed origins (ignored in development) |

## Run

### Local (API + consumers together)

```bash
APP_MODE=all poetry run uvicorn app.main:app --reload --port 8000
```

### API tier only

```bash
APP_MODE=api poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Consumer tier only

```bash
APP_MODE=consumer poetry run uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Consumer pods expose `/health` only — no business routes. Scale independently based on Azure Service Bus queue depth (KEDA).

### Docker

```bash
docker build -t platform .

# API workload
docker run -p 8000:8000 --env-file .env -e APP_MODE=api platform

# Consumer workload
docker run -p 8001:8001 --env-file .env -e APP_MODE=consumer platform
```

## API Docs

Available at `http://localhost:8000/docs` when `ENV != production`.

All original endpoint URLs preserved exactly:

| Origin | Prefix | Controller |
|--------|--------|------------|
| backend-server | `/teacher`, `/student`, `/user`, `/tenant` | `auth_controller`, `users_controller` |
| backend-server | `/school`, `/class` | `school_controller` |
| backend-server | `/content` | `content_controller` |
| backend-server | `/call`, `/log` | `call_controller`, `audit_controller` |
| ConferenceV2 | `/conference/*` | `call_controller`, `playback_controller`, `participants_controller` |
| ConferenceV2 | `/webhooks/*`, `/websocket/*` | `webhook_controller`, `websocket_controller` |
| IVRv2 | `/event`, `/webhook`, `/rtc-event`, `/dtmf`, `/input` | `webhook_controller` |
| IVRv2 | `/start-call`, `/transfer`, `/hangup`, `/answer`, `/call_webhook` | `call_controller` |
| IVRv2 | `/ivr-structure`, `/ivr/{id}`, `/start-ivr` | `ivr_structure_controller` |

## Test

```bash
# All tests
poetry run pytest tests/ -v

# Unit tests only
poetry run pytest tests/unit/ -v

# Integration tests only
poetry run pytest tests/integration/ -v

# Security tests
poetry run pytest tests/security/ -v

# FSM parity regression (IVR behaviour)
poetry run pytest tests/regression/ -v

# With coverage report
poetry run pytest tests/ --cov=app --cov-report=term-missing

# Security scan
poetry run bandit -r app/ -ll
```

Expected: **1012 tests, 0 failures, 70% coverage, 0 bandit HIGH findings**.

## Consumers

Six background consumers start when `APP_MODE` is `consumer` or `all`:

| Consumer | Source | What it does |
|----------|--------|--------------|
| `AudioRecordingConsumer` | WebSocket audio frames | Buffers and writes WAV segments to Azure Blob |
| `AudioAnalysisConsumer` | WAV segments from above | VAD, hold detection, transcription → updates ConferenceState |
| `CallEventConsumer` | Azure SB `call_event_*` queue | Processes IVR call status updates via FSM |
| `DtmfConsumer` | Azure SB `dtmf_input_*` queue | Processes DTMF keypad input via FSM |
| `CallWebhookConsumer` | Azure SB `call_webhook_*` queue | Creates/updates call records from missed-call notifications |
| `ContentJobConsumer` | MongoDB pending jobs | FFmpeg audio transcode + TTS generation + Blob upload |

All consumers: 3x retry with exponential backoff on transient errors; dead-letter with reason on permanent failures.

## Migrations

Run before first production deployment, in order:

```bash
# 1. Unify users (teachers + students + tenants → users collection)
python migrations/001_unify_users.py --mongo-uri "$MONGO_DB_CONNECTION_STRING" --dry-run
python migrations/001_unify_users.py --mongo-uri "$MONGO_DB_CONNECTION_STRING"
python migrations/001_verify_unify_users.py --mongo-uri "$MONGO_DB_CONNECTION_STRING"

# 2. Add tenant-scoped compound indexes
python migrations/002_tenant_scoped_indexes.py --mongo-uri "$MONGO_DB_CONNECTION_STRING" --dry-run
python migrations/002_tenant_scoped_indexes.py --mongo-uri "$MONGO_DB_CONNECTION_STRING"
python migrations/002_verify_tenant_scoped_indexes.py --mongo-uri "$MONGO_DB_CONNECTION_STRING"
```

Each migration is idempotent. Rollback available for migration 001:

```bash
python migrations/001_rollback_unify_users.py --mongo-uri "$MONGO_DB_CONNECTION_STRING"
```

## Security

- Vonage webhook HMAC verification enforced in `production` mode (bypass in `development`)
- WebSocket control channel requires `WS_CONTROL_SECRET` header when set
- WebSocket connections rejected for unregistered conference IDs
- `GET /user/participants` requires authentication (was unprotected in legacy `backend-server`)
- All tenant-scoped resources enforce `assert_same_tenant` — cross-tenant access returns 403
- Conference mutating operations require ownership check — non-owner returns 403
- Passwords excluded from all API responses (`UserPublic` schema)
- Sensitive fields (keys, tokens, phone numbers) masked in structured logs

See `READINESS_REPORT.md` for full pre-production cutover checklist.
