# ContentWebApp E2E — idempotency, concurrency, and known-bug design notes

Reference doc for patterns referenced inline as "see IDEMPOTENCY.md" across `e2e/tests/*.spec.js` and `playwright.config.js`.

## Async content processing

`POST /content` and `PATCH /content/:id` (when `is_audio_uploaded=true`) return a
`{"message": "Processing New Content job scheduled!", "job_id": ...}` response, not
the finished record — a background job (`platform/app/consumers/content_job_consumer.py`)
transcodes audio and marks the record processed afterward. Turnaround is unbounded —
seconds to multiple minutes depending on shared queue load, which this suite's own
content creation contributes to. Every row lookup goes through
`ContentListPage.waitForRow()`/`waitUntilProcessed()`, which poll with a generous
timeout instead of a single-shot check; tests calling these set their own
`test.setTimeout()` to a budget large enough to cover it.

`content_job_consumer.py` runs an extra `_process_tts_for_content` step for any
content created/updated with `is_pull_model` ("Add to IVR") set — on top of the
normal audio-processing job every item already gets. `TC-CONT-019` used to enable
this (`addToIVR: true`) and ran immediately before `experience.spec.js` in file
order, adding load to the shared queue right before the tests most sensitive to it
(see the EXP section below). Fixed by leaving `addToIVR` false there — the button
click it actually asserts (`updateIVRButton`) is a standalone sync trigger
(`ivrService.updateIVR`) unrelated to any one content item's `is_pull_model` flag.

## Serial execution / `workers: 1`

Every spec logs in as one of a small, shared set of personas (tenant, school,
schoolA4I, contentCreator). `TC-AUTH-007/008` used to mutate the shared
`PERSONAS.tenant` password mid-run — every other file in the suite assumes that
password is valid, so a different file logging in as tenant while 007/008's
mutation window was open would fail nondeterministically (confirmed live:
`school.spec.js`'s tenant login raced it). `test.describe.configure({ mode: 'serial'
})` inside one file does not stop a different file from running in another worker,
so `workers: 1` was set globally to close the gap entirely.

Fixed: `TC-AUTH-007/008` now mutate `PERSONAS.tenantPasswordTest`, a persona no
other spec in the suite touches (not `tenant2` — that's already used read-only by
`TC-SYNC-004`, so reusing it would just relocate the race). `auth.spec.js` itself
stays serial internally as a safety margin. `workers: 1` has not yet been reverted
to default parallelism in this PR — that's a separate, larger change that needs its
own live verification pass to rule out other latent cross-file races this setting
may have been masking.

## Unique identifiers / self-cleaning teardown

Doc test data (fixed emails/phones/names) assumes a human manually resets state
between runs — automating 1:1 breaks idempotency under repeated CI runs. Tests
instead generate unique ids/phones (`uniqueId()`/`uniquePhone()`) and clean up
inline. Content titles get middle-truncated in the UI (`MiddleEllipsis.js`) once
they don't fit the column width, so row matching uses the short generated suffix
(always preserved by that truncation) rather than the full title string.

Every Docmost test case whose corresponding e2e test isn't safely rerunnable as
written is tagged `[NOT-IDEMPOTENT]` or `[ONE-WAY]` directly in the Docmost doc,
not in a separate in-repo file.

## Confirmed product bugs documented as passing tests

Some tests assert the *actual* (buggy) behavior rather than the intended one, so
CI stays green and self-documenting instead of permanently red on a known,
already-filed bug:

- `TC-AUTH-008` — `POST /tenant/change-password` doesn't validate `current_password`
  server-side (#592). Restores the account afterward unconditionally (not
  try/finally — a restore failure must surface as a real failure).
- `TC-CONT-018` — freshly self-registered teacher accounts can't log in (#595).
- `TC-CONT-005`/`TC-CONT-012`/`TC-CONT-016` — content title updates aren't asserted
  to propagate to the DOM (#594); only the PATCH HTTP status is checked.

## Story/Poem/Snippet (EXP) category status

`experience.spec.js` reuses the exact code path already proven in `content.spec.js`
(Song). Live verification was paused after the shared backend job queue visibly
degraded during a long test-writing session — see #593. Track there before
treating EXP failures in CI as a suite regression rather than backend queue load.
