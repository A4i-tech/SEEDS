# SEEDS Monorepo — Agent Instructions

## Comments

Never add or modify comments in code. Leave existing comments exactly as they are unless the user explicitly asks for a comment change.

## Core Coding Philosophy: Less Code is Better

Strict minimalist approach. "No code best code."

### Guardrails
* **KISS**: simple over clever/abstract. Boring code > smart code.
* **YAGNI**: build only what's asked now. No speculative params, configs, hooks, extensibility for hypothetical future use. Add later when actually needed.
* **DRY**: repeat block twice → extract fn/const/component, one source of truth. Light duplication still ok if avoiding it needs heavy abstraction (DRY vs WET tradeoff).
* **Native first**: stdlib/runtime builtins over new deps.
* **Delete first**: if removing/refactoring existing lines solves it, do that before adding.
* **Design patterns**: use creational (factory, builder, singleton), structural (adapter, decorator, facade), behavioral (strategy, observer, template) patterns only when they cut code/complexity — never bolt on for "best practice" alone.

### Restrictions
* NEVER unneeded abstractions, boilerplate interfaces, wrappers, factories.
* NEVER placeholder files, empty fns, unused config blocks.
* NEVER comments restating obvious code.

### Check before shipping
1. Fewer lines possible?
2. New dep/abstraction actually needed?
3. Beginner grok instantly?

## Design Patterns Reference (refactoring.guru)

A design pattern is a typical solution to a commonly occurring problem in software design — a customizable blueprint, not ready-to-use code. Unlike an algorithm (fixed steps toward a goal), a pattern is a higher-level description: the result and its features are known, but the exact implementation is up to you. Patterns give teams shared vocabulary to communicate architectural decisions quickly.

Patterns are not universally applicable — they vary in complexity and scope, and misapplying one (forcing a pattern where a plain solution would do) adds complexity rather than removing it. Per this repo's minimalist philosophy above: reach for a pattern only when it cuts code/complexity, never for "best practice" alone.

Classified by scope: **idioms** (low-level, language-specific) vs **architectural patterns** (high-level, implementable in any language for whole-application design). By intent, three groups:

**Creational** — object creation mechanisms that increase flexibility and reuse:
- Factory Method, Abstract Factory, Builder, Prototype, Singleton

**Structural** — how to assemble objects/classes into larger structures while keeping them flexible and efficient:
- Adapter, Bridge, Composite, Decorator, Facade, Flyweight, Proxy

**Behavioral** — effective communication and assignment of responsibility between objects:
- Chain of Responsibility, Command, Iterator, Mediator, Memento, Observer, State, Strategy, Template Method, Visitor

## Coding Style

Follow the Google style guides for Python ([Google Python Style Guide](https://google.github.io/styleguide/pyguide.html)) and JavaScript ([Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)).

## Error Handling Philosophy: Fail Loud, Never Fake

Prefer a visible failure over a silent fallback.

- Never silently swallow errors to keep things "working."
  Surface the error. Don't substitute placeholder data.
- Fallbacks are acceptable only when disclosed. Show a
  banner, log a warning, annotate the output.
- Design for debuggability, not cosmetic stability.

Priority order:
1. Works correctly with real data
2. Falls back visibly — clearly signals degraded mode
3. Fails with a clear error message
4. Silently degrades to look "fine" — never do this

## Knowledge Store: graphify + SEEDS Wiki

Two persistent knowledge sources live at the SEEDS root (not `.claude/`) and survive across sessions — read them before non-trivial work, don't rebuild from scratch each time.

**graphify** — a code knowledge graph (structural + semantic) over the whole monorepo.
- Outputs: `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.html`
- Use it to understand architecture, find god nodes/hubs, trace blast radius, or answer "what connects to X" before touching unfamiliar code
- Talk to it via: `/graphify query "<question>"` (BFS/DFS traversal), `/graphify explain "<Node>"`, `/graphify path "<A>" "<B>"`, or `/graphify <path> --update` after code changes
- Rebuild only when `graphify-out/` is missing or badly stale — otherwise `--update` is enough

**SEEDS Wiki** — human-readable pages: one per service (architecture, entry points, data models) and one per cross-cutting concept (auth, data model, call flow, etc.), cross-linked with `[[wikilinks]]`.
- Pages: `SEEDS wiki/wiki/`
- Schema: `SEEDS wiki/CLAUDE.md`
- Talk to it via: `/wiki-query "<question>"` to answer from existing pages, `/wiki-ingest` to add a new source (PR/doc/commit), `/wiki-update` after implementing a feature, `/wiki-lint` to health-check
- Always update `index.md` and `log.md` after any ingest

**Using both for a task:** `/implement "<feature>"` pulls context from graphify (blast radius, integration points) and the wiki (architecture intent, constraints) before writing a plan. `/sync-knowledge` refreshes both after a merge/feature so the next session isn't working from stale context.

## Skills

Project-specific skills live in `.claude/skills/`. **Before starting any relevant task, read the appropriate skill file and follow its instructions.**

| Skill | File | When to use |
|---|---|---|
| Backend Development | `.claude/skills/backend-development/SKILL.md` | API design, database schemas, auth, caching, Node.js backend work |
| Coding Style | `.claude/skills/coding-style/SKILL.md` | Writing or reviewing code in any language: no redundant defensive fallbacks, plain error stringification, comment hygiene, no unrequested abstractions, validate-at-boundary data modeling |
| Code Review | `.claude/skills/code-review/SKILL.md` | Reviewing staged changes, PRs, or any code audit |
| Debug Issue | `.claude/skills/debug-issue.md` | Tracing and debugging issues using the knowledge graph |
| Explore Codebase | `.claude/skills/explore-codebase.md` | Navigating and understanding codebase structure |
| Frontend Design | `.claude/skills/frontend-design/SKILL.md` | Building React/HTML components, dashboards, web UIs |
| JavaScript / TypeScript | `.claude/skills/javascript-typescript/SKILL.md` | JS/TS frontend or backend work (React, Node.js) |
| Refactor Safely | `.claude/skills/refactor-safely.md` | Planning and executing refactors with dependency analysis |
| VibeSec | `.claude/skills/vibesec/SKILL.md` | Writing secure web apps; security scans/audits (XSS, CSRF, SSRF, SQLi, auth, JWT, uploads) |
| Review Changes | `.claude/skills/review-changes.md` | Risk-aware code review using change detection and impact |
| Web App Testing | `.claude/skills/webapp-testing/SKILL.md` | Testing local web apps with Playwright |

## Commands

Project slash-commands live in `.claude/commands/`.

| Command | File | Purpose |
|---|---|---|
| `/graphify` | `.claude/commands/graphify.md` | Build or update the knowledge graph (see also the `graphify` skill) |
| `/sync-knowledge` | `.claude/commands/sync-knowledge.md` | Sync both graph + wiki after merging a PR or finishing a feature |
| `/wiki-ingest` | `.claude/commands/wiki-ingest.md` | Ingest a source (PR, doc, commit) into the SEEDS wiki |
| `/wiki-update` | `.claude/commands/wiki-update.md` | Update the wiki after implementing a feature or fixing a bug |
| `/wiki-query` | `.claude/commands/wiki-query.md` | Answer a question using the wiki as the knowledge base |
| `/wiki-lint` | `.claude/commands/wiki-lint.md` | Health-check the wiki and report issues |
| `/implement` | `.claude/commands/implement.md` | Implement a feature end-to-end using graph + wiki as context |
| `/engineering-issues` | `.claude/commands/engineering-issues.md` | Fetch issues from the A4i-tech engineering project board |

## Services

| Directory | Service |
|---|---|
| `platform/` | Unified FastAPI backend (Python 3.12, MongoDB/Motor); api + consumer tiers via `APP_MODE` |
| `Teacher-App/` | Android app (Kotlin, MVVM, Hilt) |
| `teacher-webapp/` | React web app for teachers |
| `websocket-service/` | Node.js WebSocket audio streaming (standalone, not absorbed into platform) |
| `ContentWebApp/` | React admin/content dashboard |
