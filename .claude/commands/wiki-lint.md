Health-check the SEEDS Wiki and report issues.

Follow the SEEDS Wiki schema at `SEEDS wiki/CLAUDE.md`.

## Steps

1. **Read all wiki pages** in `SEEDS wiki/wiki/`.

2. **Scan for issues:**

   - **Orphan pages** — pages with no inbound `[[wikilinks]]` from other pages
   - **Missing cross-references** — pages that should link to each other but don't
   - **Dead links** — `[[wikilinks]]` pointing to pages that don't exist
   - **Stale claims** — information superseded by newer sources or code changes
   - **Missing pages** — concepts mentioned in text but lacking their own page
   - **Contradictions** — pages that disagree with each other
   - **Frontmatter issues** — missing or malformed YAML frontmatter
   - **Outdated dates** — pages with `updated` dates much older than recent code changes

3. **Report findings** as a prioritized list:
   - Critical: dead links, contradictions
   - Important: orphan pages, missing pages, stale claims
   - Minor: missing cross-references, frontmatter issues

4. **Propose fixes** for each issue but do NOT auto-fix. Wait for user confirmation.

5. **After fixes are confirmed and applied**, append to `wiki/log.md`:
   `## [YYYY-MM-DD] lint | Wiki health check`
