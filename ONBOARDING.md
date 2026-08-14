# SEEDS Onboarding

New joinee: paste this file to Claude Code and say **"read ONBOARDING.md and set up this repo."** Claude should follow the checklist below in order — it's written as direct instructions.

## Setup checklist (Claude: do these in order)

### 1. Plugins & MCP servers

Plugins (`superpowers`, `caveman`, `ponytail`, `frontend-design`, `render`, `mongodb`, `claude-mem`) and two MCP servers (`playwright`, `docmost`) are declared repo-wide in `.claude/settings.json` and `.mcp.json` at the repo root — they came with the clone. You cannot install plugins yourself; tell the user:

> Restart Claude Code (or run `/plugin` then `/mcp`) in this repo and approve the install/connection prompts for the plugins and MCP servers listed in `.claude/settings.json` / `.mcp.json`.

`render`, `mongodb-mcp-server`, `docmost`, and `github` each need the user's own credentials (Render login, Mongo connection string, Docmost workspace, GitHub OAuth) — that's a per-person step done via `/mcp`, not something in the repo. Confirm with the user once done; don't block on it.

### 2. Knowledge base — graphify + SEEDS Wiki

`graphify-out/` and `SEEDS wiki/` are git-ignored (they're generated, not source) — **check if they exist at the repo root**. If they're missing (true on every fresh clone), rebuild both:

**2a. Build the graph:**
Run `/graphify` (full build, not `--update`) on the repo root. It will detect a large corpus (~750 files, mostly code across `platform/`, `Teacher-App/`, `teacher-webapp/`, `ContentWebApp/`, `websocket-service/`) and warn about size — proceed on the full root anyway: code files are free AST extraction, and only the ~85 doc files need LLM subagents (~4 dispatches, cheap). Skip semantic extraction on image files under `coverage/`, `public/`, `mipmap-*`, and app icons/logos — they're build artifacts and launcher icons with no semantic content, not real documentation. Output lands in `graphify-out/` at the repo root.

**2b. Build the wiki:**
If `SEEDS wiki/` is missing, recreate it from scratch:
1. Create `SEEDS wiki/wiki/` and write the schema to `SEEDS wiki/CLAUDE.md`:
   ```markdown
   # SEEDS Wiki Schema

   Structured wiki for the SEEDS monorepo. Pages live in `wiki/`.

   ## Page types
   - `service` — one page per active service (platform, Teacher-App, teacher-webapp, ContentWebApp, websocket-service). Architecture, entry points, data models, service boundaries.
   - `concept` — cross-cutting systems spanning services (auth, data model, pipelines, infra). Create when a pattern shows up in 2+ services.
   - `source` — summary of a single ingested source (PR, commit, doc). Append-only history.
   - `synthesis` — a reusable answer from `/wiki-query` worth preserving as its own page.
   - `index` — the single `wiki/index.md` table-of-contents page.

   ## Frontmatter
   ```yaml
   ---
   title: Descriptive Title
   type: service|concept|source|synthesis|index
   tags: [relevant, tags]
   sources: [PR URL, file path, or commit SHA]
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   ---
   ```
   `sources` is optional for `service`/`concept` pages derived from reading the codebase directly.

   ## Cross-referencing
   Use `[[Page Title]]` wikilinks. Every page should be reachable from `wiki/index.md` and linked from at least one other page.

   ## Required files
   - `wiki/index.md` — table of contents by page type.
   - `wiki/log.md` — append-only changelog: `## [YYYY-MM-DD] ingest|update|lint | Brief description`.
   ```
2. Dispatch one agent per active service (`platform`, `Teacher-App`, `teacher-webapp`, `ContentWebApp`, `websocket-service`) to read that service's code and write a `service`-type page to `SEEDS wiki/wiki/<kebab-name>.md`, using `[[Page Title]]` wikilinks for cross-cutting concepts it touches (auth, data model, call flow, audio, etc.) even if those pages don't exist yet.
3. From the wikilinks the service pages actually used, identify recurring cross-cutting concepts (as of the last rebuild: **Authentication**, **Data Model**, **Conference/Call Flow**, **Audio Streaming**, **Subodha LMS Sync** — re-derive this list from what the service pages reference, it may have changed) and dispatch one agent per concept to write a `concept`-type page, reading the actual code (not just the service pages) to verify.
4. After all pages exist, verify every wikilink target matches an actual page title exactly (no dead links), then write `wiki/index.md` (grouped by type, linking every page) and `wiki/log.md` (one `## [YYYY-MM-DD] rebuild | ...` entry).
5. Run `/wiki-lint` to catch anything left over (orphans, mismatched titles, missing cross-references) and fix what it finds.

### 3. Skills & commands

Nothing to do — `.claude/skills/` and `.claude/commands/` are committed, so they arrived with the clone. Confirm they loaded (skills should appear in your skill listing).

### 4. Report back

Tell the user what was rebuilt (graph size, wiki page count) and what still needs their manual action (plugin/MCP approval, credentials).

---

## Reference: what's installed

### Plugins

| Plugin | What it's for |
|---|---|
| `superpowers` | Process skills — brainstorming, systematic debugging, TDD, writing/executing plans, code review, git worktrees, writing skills |
| `caveman` | Ultra-compressed communication mode (terse responses, commit messages, code review comments) |
| `ponytail` | Anti-over-engineering mode — forces the simplest working solution, audits for bloat/dead flexibility |
| `frontend-design` | Aesthetic/design guidance for building UI |
| `render` | Render.com deployment — blueprints, web services, Postgres, Key Value, cron jobs, workers, static sites, domains, scaling, monitoring, debugging |
| `mongodb` | MongoDB Atlas — schema design, query optimization, connection tuning, Atlas Search/Vector Search, stream processing |
| `claude-mem` | Memory compression system — persists context across sessions |

### MCP Servers

| Server | What it's for |
|---|---|
| `github` | Issues, PRs, branches, releases, code search, Actions — GitHub platform operations |
| `docmost` | Docmost pages/spaces — create, search, update, organize docs and comments |
| `mongodb-mcp-server` | Direct MongoDB/Atlas operations — query, aggregate, indexes, collections, logs |
| `playwright` | Browser automation — navigate, click, screenshot, network inspection for testing web apps |
| `render` | Render.com resource management via MCP (services, deploys, logs, Postgres, Key Value) |

### claude.ai Connectors

Available via `mcp__claude_ai_*` (OAuth-authenticated per-user, connect as needed):

Asana · Atlassian (Jira/Confluence) · Box · Canva · Figma · HubSpot · Intercom · Langfuse · Linear · Notion · monday.com

### Project skills & commands

Defined in `.claude/skills/` and `.claude/commands/` — see root `CLAUDE.md` for the full table:
- **Skills:** `backend-development`, `coding-style`, `code-review`, `javascript-typescript`, `vibesec`, `review-changes`, `webapp-testing`, `frontend-design`, `debug-issue`, `explore-codebase`, `refactor-safely`, `release`
- **Commands:** `graphify`, `sync-knowledge`, `wiki-ingest`, `wiki-lint`, `wiki-query`, `wiki-update`, `implement` — the knowledge-graph + wiki workflow (see `CLAUDE.md` → "Knowledge Store: graphify + SEEDS Wiki")
