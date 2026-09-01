# Local Authentication Guide

How authentication works in the SEEDS Platform (`platform/`) and how to obtain a
valid admin token for local development and API testing.

> Scope: the FastAPI backend under `platform/`. The localization Admin UI
> (`ContentWebApp/`) reaches the backend through the CRA dev proxy
> (`setupProxy.js`), so the same tokens apply.

---

## 1. How authentication works end-to-end

Authentication is **bearer-token based**. Every protected endpoint depends on
`get_current_user` (`app/platform/auth/dependencies.py`), which:

1. Reads the token from the `Authorization: Bearer <token>` header.
   (Fallback: a `?token=` query param, used only by SSE endpoints that cannot
   set headers.)
2. Branches on `settings.auth_type`:
   - `jwt` (default) → `verify_token()` validates a native platform JWT.
     **Stateless — no MongoDB user lookup.** The signed token *is* the identity.
   - `firebase` → `verify_firebase_token()` validates a Firebase ID token.
3. Returns the decoded payload as the `user` dict (`sub`, `role`, `tenant_id`,
   `email`).
4. Sets `request.state.user_id` / `tenant_id` for logging correlation.

Role enforcement is layered on top via dependencies:

| Dependency | Passes when |
|---|---|
| `require_admin` | `role == "admin"` |
| `require_admin_or_reviewer` | `role in {"admin", "reviewer"}` |
| `require_role("teacher", ...)` | `role` in the given set |

**Development-only bypass:** when `settings.env == "development"`, a token with
`role == "tenant"` is also accepted by `require_admin` /
`require_admin_or_reviewer` (`_admin_or_reviewer_dev_bypass`). This never
triggers in staging/production because `env` is not `"development"` there. Prefer
minting an explicit `admin` token (below) over relying on this bypass.

Because native JWT auth does no database lookup, **you do not need to create a
MongoDB user** to authenticate locally.

---

## 2. How JWTs are generated

Source: `app/platform/auth/jwt.py` → `create_access_token(data, expires_delta=None)`.

- Signs with `settings.secret_key` using **HS256**.
- Issuer is fixed to `"platform"`.
- `iat` = now (UTC); `exp` = now + `expires_delta` (defaults to
  `settings.jwt_expires_in`, e.g. `24h`).

`verify_token()` validates signature, expiry, and issuer, and requires the
claims `sub`, `exp`, `iss` to be present.

---

## 3. Required JWT claims

**Required in the `data` you pass to `create_access_token`:**

| Claim | Meaning |
|---|---|
| `sub` | Subject / user id |
| `role` | Role string (`admin`, `reviewer`, `tenant`, `teacher`, ...) |

**Added automatically by `create_access_token`:**

| Claim | Value |
|---|---|
| `iss` | `"platform"` |
| `iat` | Issued-at (UTC) |
| `exp` | Expiry (now + `jwt_expires_in`) |

**Optional (included if provided):** `tenant_id`, `school_id`.

`verify_token` enforces presence of `sub`, `exp`, `iss` and that `iss == "platform"`.

---

## 4. Required environment variables

Set in `platform/.env` (loaded via `app/platform/settings.py`).

| Env var | Settings field | Default | Notes |
|---|---|---|---|
| `SECRET_KEY` | `secret_key` | `""` | **Required.** HS256 signing key. Empty ⇒ tokens cannot be trusted. |
| `AUTH_TYPE` | `auth_type` | `jwt` | `jwt` (native) or `firebase`. Use `jwt` locally. |
| `JWT_EXPIRES_IN` | `jwt_expires_in` | `1d` | Accepts `7d`, `24h`, `30m`, or plain seconds (`3600`). |
| `ENV` | `env` | — | `development` locally (enables the tenant→admin dev bypass). |
| `DB_CONNECTION` | `db_connection` | `""` | MongoDB URI. Not used by auth, but required for the app to run. |

Algorithm (`HS256`) and issuer (`platform`) are **constants in code**
(`_ALGORITHM`, `_ISSUER` in `jwt.py`), not env-configurable.

Firebase-only (ignored when `AUTH_TYPE=jwt`): `FIREBASE_API_KEY`,
`FIREBASE_SERVICE_ACCOUNT`.

---

## 5. Generate a local admin JWT (using the application's own code)

Do **not** hand-craft or hardcode tokens. Use the app's signer so the secret,
algorithm, issuer, and expiry always match what the verifier expects.

From the `platform/` directory:

```bash
poetry run python -c "from app.platform.auth.jwt import create_access_token; print(create_access_token({'sub':'local-admin','role':'admin','tenant_id':'t1'}))"
```

To also confirm it verifies through the app's own verifier (same path
`get_current_user` uses):

```bash
poetry run python - <<'PY'
from app.platform.auth.jwt import create_access_token, verify_token
tok = create_access_token({"sub": "local-admin", "role": "admin", "tenant_id": "t1"})
print("TOKEN:", tok)
print("CLAIMS:", verify_token(tok))
PY
```

Save it to a file for reuse:

```bash
poetry run python -c "from app.platform.auth.jwt import create_access_token; print(create_access_token({'sub':'local-admin','role':'admin','tenant_id':'t1'}))" \
  | grep -oE 'eyJ[A-Za-z0-9._-]+' > /tmp/tok.txt
```

For a `reviewer`-scoped token, pass `'role':'reviewer'`.

> Alternative (real login flow): the auth controllers
> (`tenant_auth_controller`, `teacher_auth_controller`,
> `school_admin_auth_controller`) issue tokens for their own roles via login
> endpoints. They do **not** mint `admin`/`reviewer` roles, so for the
> localization Admin API the direct-mint approach above is the correct local path.

---

## 6. Authenticate API requests locally

Attach the token as a bearer header.

```bash
TOK=$(cat /tmp/tok.txt)

# Direct to the backend (:8000)
curl -H "Authorization: Bearer $TOK" http://localhost:8000/projects

# Through the CRA dev proxy (:3000) — how the Admin UI reaches the backend
curl -H "Authorization: Bearer $TOK" http://localhost:3000/api/projects
```

Expected: `200` with a token, `401` without one.

**Public (no token) localization endpoints** — called by the runtime SDK from
anonymous visitor browsers, rate-limited instead of authenticated:

- `POST /translations/extract`
- `GET /translations?siteId=&route=&lang=`
- `GET /languages`

**Interactive docs:** http://localhost:8000/docs — click **Authorize**, paste the
raw token (no `Bearer ` prefix; Swagger adds it), then call endpoints from the UI.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `401 Missing authentication token` | No/blank `Authorization` header. In shell, quote the whole header: `-H "Authorization: Bearer $TOK"` (unquoted splits `Bearer` and the token into separate args). |
| `401 Invalid token` | Token signed with a different `SECRET_KEY`, or issuer ≠ `platform`. Re-mint with the app's signer against the running `.env`. |
| `401 Token has expired` | Older than `JWT_EXPIRES_IN`. Re-mint. |
| `403 one of ['admin'] role required` | Token role is not `admin`. Mint with `'role':'admin'` (or set `ENV=development` to use the tenant bypass). |
| Empty output when minting in Git Bash | Cosmetic shell issue, not a token failure: `poetry` cold-start noise / Python-on-Windows treating `/tmp` differently than MSYS. Pipe through `grep -oE 'eyJ[A-Za-z0-9._-]+'` to extract the token reliably. |

---

## Reference

- `app/platform/auth/jwt.py` — `create_access_token`, `verify_token`, `_ALGORITHM`, `_ISSUER`
- `app/platform/auth/dependencies.py` — `get_current_user`, `require_admin`, `require_admin_or_reviewer`, dev bypass
- `app/platform/settings.py` — `secret_key`, `auth_type`, `jwt_expires_in`, `env`
