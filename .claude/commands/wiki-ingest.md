Ingest a source into the SEEDS Wiki.

The user will provide a source — this could be:
- A PR number or URL (e.g. `#42`, `https://github.com/A4i-tech/SEEDS/pull/42`)
- A file path to a document
- A commit SHA or range
- A pasted block of text (meeting notes, design doc, etc.)

Follow the SEEDS Wiki schema at `SEEDS wiki/CLAUDE.md`.

## Steps

1. **Read the source material.** For PRs, use `gh pr view <number> --json title,body,files,commits` and read the changed files. For documents, read the file. For commits, use `git show`.

2. **Classify the source:**
   - Routine (PRs, bug fixes, small features) → autonomous ingest
   - Major (architecture docs, design specs, system-wide changes) → discuss takeaways first, wait for confirmation

3. **Create a source summary page** in `SEEDS wiki/wiki/` with kebab-case filename and proper frontmatter:
   ```yaml
   ---
   title: Descriptive Title
   type: source
   tags: [relevant, tags]
   sources: [PR URL or file path]
   created: YYYY-MM-DD
   updated: YYYY-MM-DD
   ---
   ```

4. **Update all affected wiki pages** — service pages, concept pages. Add new cross-references. Bump `updated` date on every modified page.

5. **If the source introduces a new concept** that deserves its own page, create it (type: concept).

6. **Update `wiki/index.md`** — add new pages to the appropriate section.

7. **Append to `wiki/log.md`** — use format: `## [YYYY-MM-DD] ingest | Source Title`

8. **Report** what you created and updated.

$ARGUMENTS - The source to ingest (PR number, file path, commit SHA, or description)
