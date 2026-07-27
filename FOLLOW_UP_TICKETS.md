# Follow-up tickets — client integration with shared refresh-token flow (#459)

#459 built the shared backend refresh-token infrastructure only
(`platform/app/platform/auth/refresh_tokens.py`, `POST /auth/token/refresh`).
Teacher Web App, Content Web App, and Android App were explicitly out of
scope. `/login` endpoints for teacher/tenant/school_admin now additively
return `refresh_token` and `expires_in` alongside the existing `token`, but
no client reads or stores them yet, and the JWT access-token lifetime
(`jwt_expires_in`) is still 24h. Each ticket below brings one client onto
the shared flow; the actual TTL reduction is sequenced last, after all three
ship.

---

## Ticket 1 — Teacher Web App: adopt refresh-token flow

**Repo path:** `teacher-webapp/` (and/or `Teacher-App/`, whichever is the
active frontend — confirm before starting)

- Store `refresh_token` returned by `/teacher/login` (and any other teacher
  login path) alongside the existing access token, using the same secure
  storage mechanism already used for the access token.
- On a 401 from an API call (or proactively near `expires_in` expiry), call
  `POST /auth/token/refresh` with the stored refresh token, receive a new
  `access_token`/`refresh_token` pair, persist both, and retry the original
  request once.
- On a refresh failure (401 from `/auth/token/refresh` — token invalid,
  reused, or expired), clear stored tokens and route to login.
- Do not change backend behavior — this is a client-only change.

## Ticket 2 — Content Web App: adopt refresh-token flow

**Repo path:** `ContentWebApp/`

- Store `refresh_token` returned by `/tenant/login` and
  `/school/admin/login` alongside the existing access token.
- Same refresh-on-401 (or proactive, near-`expires_in`) + retry-once pattern
  as Ticket 1.
- `school/admin/login`'s response shape is additive (`refresh_token`,
  `expires_in` added to the existing `{token}` dict) — update the client's
  response typing/parsing to read them; no backend change needed.
- On refresh failure, clear stored tokens and route to login.

## Ticket 3 — Android App: adopt refresh-token flow

**Repo:** (Android app repo — not in this checkout; confirm current
location before starting)

- Store `refresh_token` returned at login alongside the existing access
  token, using the platform's secure storage (e.g. EncryptedSharedPreferences
  / Keystore-backed storage), not plain SharedPreferences.
- Add an HTTP client interceptor/authenticator that, on 401, calls
  `POST /auth/token/refresh`, persists the new pair, and retries the
  original request once.
- On refresh failure, clear stored tokens and force re-login.

## Ticket 4 — Lower `jwt_expires_in` to a short-lived value

**Depends on:** Tickets 1–3 (all three clients must be shipped and verified
in production first — this ticket is what the #459 infrastructure was built
for).

- Once all clients reliably call `/auth/token/refresh`, change
  `jwt_expires_in` (currently `"1d"`) to a short value (e.g. `"15m"`) in
  `platform/app/platform/settings.py` / environment config.
- This is a **configuration-only change** — no code changes should be
  required, per the design in #459.
- Roll out gradually (staging first) and monitor `auth.failures` /
  `auth.reuse_detected` telemetry counters for unexpected spikes before
  promoting to production.
