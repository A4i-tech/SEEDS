# #773 tenant account audit

`tenant_audit_773.js` finds out whether any `role: "tenant"` users were created through
`POST /teacher/register` before the role allowlist landed. Its results decide whether
pre-existing escalated accounts need remediation (see the two `xfail` tests in
`tests/security/test_teacher_role_escalation_773.py`).

## Safety

- A single `aggregate` on `users`: `$match`, `$project`, `$lookup`, `$facet`, `$group`, `$sort`.
  No `$out`/`$merge`, no write commands.
- Output is counts, booleans, BSON types and months. `_id`, names, emails and phones are not returned.
- Tagged with `comment: "ticket-773-readonly-tenant-audit"` and `maxTimeMS: 120000`.

## Running it (authorized operator only)

Use a database user that holds only the built-in `read` role on the application database.
Never use an application or admin credential.

```bash
mongosh "mongodb+srv://<readonly-user>@<cluster>/<database>?readPreference=secondary" \
  --quiet --file platform/scripts/tenant_audit_773.js > tenant_audit_773.result.json
```

Share `tenant_audit_773.result.json` on the ticket. Do not commit it.

## Reading the result

| Signal | Legitimate tenant (`/tenant/register`) | Escalated via `/teacher/register` |
|---|---|---|
| `tenant_id` | missing | set (school admin's tenant) |
| `school_id` | missing | set (school admin's school) |
| `tenant_name` / `organisation` | set | missing |
| `email_equals_phone` | false | true (controller stores phone as email) |
| `tenant_id_target_role` | null | `"tenant"` |

- `totals.with_tenant_id_and_school_id_no_name_no_org` is the escalated-shape count.
- `email_has_at: true` inside an escalated-shape combination means that account can still sign in
  through `POST /auth/login` (email path), which this change does not block.
- Combinations that match neither column (legacy migrations, `tenantId`, missing dates) need a
  human decision before any guard keys on these fields.

## Token exposure after deploy

- `/teacher/login` now refuses non-teacher roles, so escalated accounts cannot start new phone sessions.
- Access JWTs are stateless and live `JWT_EXPIRES_IN` (default `1h`).
- Refresh tokens rotate inside a fixed family expiry of `REFRESH_TOKEN_EXPIRES_IN` (default `30d`)
  from the original login, and each rotation re-reads the user's role from the database. An existing
  escalated session keeps tenant access until that family expires unless the account is fixed.

## What an escalated session can reach

- Routes scoped by the `tenant_id` claim (`assert_same_tenant` in `user_service.py`,
  `textbook_remediation_controller.py`) resolve to the school admin's real tenant.
- Routes scoped by `sub` (`/school`, `/tenant/volunteers`, onboarding, translations) act on a
  shadow tenant rooted at the escalated user's own id. School admins and volunteers created there
  have their own email + password and outlive the 30-day refresh window.

If escalated accounts are found, a second read-only query is needed for users and schools whose
`tenant_id` equals one of their ids.

## Decision after the audit

- **Zero escalated-shape accounts:** no remediation; drop the two `xfail` tests or keep them as documentation.
- **Some found:** product/security owners confirm each account, then an operator corrects its `role`
  and revokes its refresh tokens (`userRefreshTokens`, `revoke_all_for_owner`). A code guard is only
  worth adding if the shape above proves to be an exact, exception-free discriminator.
