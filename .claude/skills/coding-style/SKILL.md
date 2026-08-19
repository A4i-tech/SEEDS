---
name: coding-style
description: Personal coding style preferences distilled from review feedback across SEEDS projects — no redundant defensive fallbacks on trusted/validated data, plain error stringification, comment hygiene (why not what), no unrequested abstractions, validate-at-the-boundary data modeling, verify-before-done, and task-tracking hygiene. Use whenever writing or reviewing code in any language in this workspace.
---

# Coding Style Notes

Distilled from review feedback given in chat. Apply these when writing or
reviewing code in this repo, regardless of language/framework.

## 1. No defensive fallbacks for data you already control

- We own both the backend and the frontend, and the database schema, in
  these projects. Before adding any optional/defensive check, verify the
  actual shape of the data end-to-end: read the backend route/handler, the
  DB schema/model, and the frontend consumer. If we control every layer that
  produces and consumes a value, a defensive check is almost always
  unnecessary — fix the shape at the source instead of guarding against it
  downstream.
- If a value comes from your own validated/typed data model (a value you
  constructed, validated at a boundary, or that the type system already
  guarantees is present), **do not** guard it again with `??`, `||`,
  `or None` checks, optional chaining, `try/except: pass`, etc. "just in
  case." The validation/type is the single source of truth — trust it.
- Only add fallback/guard logic for genuinely untrusted or externally-shaped
  data: raw third-party API responses before parsing, platform/runtime APIs
  whose return shape legitimately varies (e.g. a header that can be a string
  or a list of strings), or values explicitly declared optional/nullable in
  your own data model.
- Example fixed: removed a redundant `?? null` / `|| ""` fallback on a value
  that was already initialized and could never be empty at that point.

## 2. Error message extraction

- Don't write verbose type-narrowing just to get an error's message (e.g.
  `if isinstance(err) ... else str(err)` / `err instanceof Error ? err.message
  : String(err)`). Just stringify the error directly — most languages'
  exception/error types already produce a sensible message when converted to
  a string. One line, no branch.
- Apply this consistently everywhere errors are logged or surfaced to a user,
  across both server-side and client-side code.

## 3. Comments: keep only the ones that explain "why," delete the ones that restate "what"

- Delete comments that just describe what the next line of code obviously
  does (paraphrasing the code in plain language).
- Keep short comments that capture a non-obvious constraint or rationale,
  e.g.:
  - why a value needs to be normalized/stripped before hashing or comparing
  - why a client/connection is kept alive or reused instead of recreated
  - why two layers of the system model the same event/data differently on
    purpose
- Prefer trimming a paragraph-style comment down to one line rather than
  deleting it entirely, when the "why" is worth keeping.

## 4. Don't invent abstractions, options, or generality that weren't asked for

- Build exactly what's needed for the current requirement. Don't add extra
  config flags, speculative parameters, or "future-proofing" layers unless
  requested.
- If something is genuinely ambiguous, ask rather than guessing and adding
  extra surface area.

## 5. Validate at the boundary, trust it afterward

- Model incoming/outgoing data with a schema or type definition (whatever
  the language's idiomatic tool is — e.g. schema validation library, data
  classes, structs) and derive your in-code types from that definition rather
  than hand-duplicating them.
- Validate external input exactly once, at the boundary where it enters your
  system (parsing an API response, reading a request body, reading a file).
  After that point, treat the data as trusted — see §1.

## 6. Verify before reporting done

- After any refactor/cleanup pass: run the type checker / compiler and a
  smoke test against real data on every affected part of the codebase before
  declaring a task complete.
- When doing repo-wide cleanup passes (comments, fallbacks, etc.), search
  for the pattern across the whole codebase rather than fixing files one at
  a time from memory — confirm nothing was missed.
- When a claim about data shape (a schema/model matching what's actually
  stored) matters to the task, don't just trust the code/type definitions —
  check the real data directly if a DB/API MCP tool is available (e.g. query
  the live MongoDB collection, hit the real endpoint). Ground the "we own
  this shape, no fallback needed" argument in §1 against actual stored
  documents, not just the declared schema.

## 7. Task tracking hygiene

- Use task-tracking tools to track in-progress multi-step work when asked,
  but don't let stale reminders pile up — clean up the task list once work
  is genuinely done, and skip creating tasks for trivial one-off asks.
