# Claude Code Setup — Plugins & MCP Servers

What's available when working on SEEDS in Claude Code.

## Plugins

| Plugin | What it's for |
|---|---|
| `superpowers` | Process skills — brainstorming, systematic debugging, TDD, writing/executing plans, code review, git worktrees, writing skills |
| `caveman` | Ultra-compressed communication mode (terse responses, commit messages, code review comments) |
| `ponytail` | Anti-over-engineering mode — forces the simplest working solution, audits for bloat/dead flexibility |
| `frontend-design` | Aesthetic/design guidance for building UI |
| `render` | Render.com deployment — blueprints, web services, Postgres, Key Value, cron jobs, workers, static sites, domains, scaling, monitoring, debugging |
| `mongodb` | MongoDB Atlas — schema design, query optimization, connection tuning, Atlas Search/Vector Search, stream processing |
| `claude-mem` | Memory compression system — persists context across sessions |

These are enabled repo-wide via `.claude/settings.json` — just open the repo in Claude Code and approve the plugin installs when prompted.

## MCP Servers

| Server | What it's for |
|---|---|
| `github` | Issues, PRs, branches, releases, code search, Actions — GitHub platform operations |
| `docmost` | Docmost pages/spaces — create, search, update, organize docs and comments |
| `mongodb-mcp-server` | Direct MongoDB/Atlas operations — query, aggregate, indexes, collections, logs |
| `playwright` | Browser automation — navigate, click, screenshot, network inspection for testing web apps |
| `render` | Render.com resource management via MCP (services, deploys, logs, Postgres, Key Value) |

`playwright` and `docmost` are declared in `.mcp.json` at the repo root — approve them when prompted (or set `"enableAllProjectMcpServers": true` in your own `~/.claude/settings.json` to skip the prompt). `render` and `mongodb-mcp-server` come bundled with their plugins above. `github` is a first-party OAuth connector — connect it once via `/mcp` in your own session.

Each of `render`, `mongodb-mcp-server`, and `docmost` needs your own credentials (Render login, Mongo connection string, Docmost workspace) — set those in your personal `~/.claude/settings.json` or `.claude/settings.local.json`, never in a file checked into the repo.

## claude.ai Connectors

Available via `mcp__claude_ai_*` (OAuth-authenticated per-user, connect as needed):

Asana · Atlassian (Jira/Confluence) · Box · Canva · Figma · HubSpot · Intercom · Langfuse · Linear · Notion · monday.com

## Project skills & commands

Defined in `.claude/skills/` and `.claude/commands/` — see root `CLAUDE.md` for the full table:
- **Skills:** `backend-development`, `coding-style`, `code-review`, `javascript-typescript`, `vibesec`, `review-changes`, `webapp-testing`, `frontend-design`, `debug-issue`, `explore-codebase`, `refactor-safely`, `release`
- **Commands:** `graphify`, `sync-knowledge`, `wiki-ingest`, `wiki-lint`, `wiki-query`, `wiki-update`, `implement` — the knowledge-graph + wiki workflow (see `CLAUDE.md` → "Knowledge Store: graphify + SEEDS Wiki")
