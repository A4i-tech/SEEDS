"""
Firebase auth provider.

Ported from backend-server/src/auth/dbAdapters/firebaseDb.js and
authenticateToken.js (Firebase branch).

Lazy initialization: the Firebase app is only initialized when
settings.auth_type == "firebase" AND verify_firebase_token() is first called.

SECURITY:
  - The service account JSON is never logged.
  - Firebase ID tokens are never logged.
"""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

_firebase_app: Any = None
_initialized: bool = False


def _ensure_initialized() -> None:
    """Initialize the Firebase Admin SDK on first use."""
    global _firebase_app, _initialized  # noqa: PLW0603

    if _initialized:
        return

    from app.platform.settings import get_settings  # noqa: PLC0415

    settings = get_settings()

    if settings.auth_type != "firebase":
        raise RuntimeError(
            "Firebase auth provider called but AUTH_TYPE is not 'firebase'."
        )

    service_account_raw: str = settings.firebase_service_account
    if not service_account_raw:
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT is not configured. "
            "Set it to a JSON string or a path to the service account file."
        )

    import firebase_admin  # noqa: PLC0415
    from firebase_admin import credentials  # noqa: PLC0415

    # Accept either a raw JSON string or a file path.
    try:
        service_account_dict = json.loads(service_account_raw)
        cred = credentials.Certificate(service_account_dict)
    except (json.JSONDecodeError, ValueError):
        # Treat as a file path
        cred = credentials.Certificate(service_account_raw)

    if not firebase_admin.app._apps:  # type: ignore[attr-defined]
        _firebase_app = firebase_admin.initialize_app(cred)
    else:
        _firebase_app = firebase_admin.get_app()

    _initialized = True
    logger.info("Firebase Admin SDK initialized")


async def verify_firebase_token(id_token: str) -> dict[str, Any]:
    """
    Verify a Firebase ID token and extract user claims.

    Returns a dict with keys: uid, email, role, tenant_id.
    Raises ValueError for invalid / expired tokens.

    SECURITY: the id_token value is never logged.
    """
    _ensure_initialized()

    from firebase_admin import auth as firebase_auth  # noqa: PLC0415

    decoded: dict[str, Any] = firebase_auth.verify_id_token(id_token)  # type: ignore[arg-type]

    uid: str = decoded.get("uid", "")
    email: str = decoded.get("email", "")

    # Custom claims are nested under the token payload.
    role: str = decoded.get("role", "") or decoded.get("claims", {}).get("role", "")
    tenant_id: str = (
        decoded.get("tenant_id", "")
        or decoded.get("claims", {}).get("tenant_id", "")
    )

    return {
        "uid": uid,
        "email": email,
        "role": role,
        "tenant_id": tenant_id,
    }
