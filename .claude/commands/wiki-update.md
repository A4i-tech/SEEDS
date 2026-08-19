Update the SEEDS Wiki after implementing a feature, fixing a bug, or merging a PR.

This is the command to run after you've done work on the codebase and want the wiki to reflect the changes.

Follow the SEEDS Wiki schema at `SEEDS wiki/CLAUDE.md`.

## Steps

1. **Understand what changed.** If $ARGUMENTS is provided, use it as context. Otherwise:
   - Run `git log --oneline -10` to see recent commits
   - Run `git diff HEAD~1 --stat` to see files changed in the last commit
   - Read the relevant changed files to understand the scope

2. **Read `wiki/index.md`** to identify which existing pages are affected.

3. **Update affected pages:**
   - Service pages — if endpoints, models, or architecture changed
   - Concept pages — if auth, data model, pipeline, or infrastructure changed
   - Create new concept pages if a new pattern or system was introduced

4. **Create a source page** (type: source) summarizing the change if it's significant enough to document (new feature, architectural change, important bug fix). Skip for trivial changes.

5. **Update `wiki/index.md`** with any new pages.

6. **Append to `wiki/log.md`:**
   `## [YYYY-MM-DD] update | Brief description of what changed`

7. **Report** what was updated.

$ARGUMENTS - Optional: description of what changed, PR number, or commit SHA
