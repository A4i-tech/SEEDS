Sync both the graphify knowledge graph and the SEEDS wiki after code changes. Run this after merging a PR, finishing a feature, or whenever the knowledge base feels stale.

$ARGUMENTS is optional context — a PR number, commit SHA, branch name, or description of what changed. If not provided, infer from recent git history.

## Step 1 — Understand what changed

If $ARGUMENTS is provided, use it as context. Otherwise:
```bash
git log --oneline -10
git diff HEAD~1 --stat
```

Note which services were touched: `platform`, `Teacher-App`, `teacher-webapp`, `ContentWebApp`, `websocket-service`. This scopes which graphify dirs to update.

## Step 2 — Update graphify (incremental)

Run incremental re-extraction only on services that changed. Use Python directly:

```python
import json, sys
from graphify.detect import detect_incremental, save_manifest
from pathlib import Path

# Only include dirs that had changes
dirs_changed = ["CHANGED_DIRS"]  # e.g. ["backend-server", "ConferenceV2"]

combined_new = {'total_files': 0, 'total_words': 0, 'needs_graph': False,
                'warning': None, 'skipped_sensitive': [], 'graphifyignore_patterns': 0,
                'files': {'code': [], 'document': [], 'paper': [], 'image': [], 'video': []},
                'incremental': True, 'unchanged_files': {}, 'new_total': 0, 'deleted_files': []}

for d in dirs_changed:
    r = detect_incremental(Path(d))
    combined_new['new_total'] += r.get('new_total', 0)
    combined_new['total_files'] += r.get('total_files', 0)
    for k in combined_new['files']:
        combined_new['files'][k] += r.get('files', {}).get(k, [])
    combined_new['deleted_files'] += r.get('deleted_files', [])

Path('.graphify_incremental.json').write_text(json.dumps(combined_new, indent=2))
print(f"{combined_new['new_total']} new/changed files across: {dirs_changed}")
```

If `new_total == 0`: print "Graphify already up to date — no files changed" and skip to Step 3.

If files changed — check which are code-only vs docs/images:
- **Code-only changes**: run AST extraction only (no LLM agents needed)
- **Doc/image changes**: run full semantic extraction via subagents (same as `/graphify --update`)

After extraction, merge into `graphify-out/graph.json`, re-cluster, regenerate `GRAPH_REPORT.md` and `graph.html`. Save manifest.

Also re-extract the SEEDS wiki docs if any wiki pages were modified:
```python
from graphify.detect import detect_incremental
from pathlib import Path
wiki_result = detect_incremental(Path('SEEDS wiki/wiki'))
print(f"Wiki docs: {wiki_result.get('new_total', 0)} changed")
```
If wiki docs changed, run semantic extraction on them and merge into the graph too.

## Step 2.5 — Consolidate graphify cache (ALWAYS run after any graphify step)

graphify writes a `graphify-out/cache/` **next to every path it scans**, so stray cache dirs appear in `.claude/` and inside service repos. Merge them into the canonical `graphify-out/cache/` at the SEEDS root and delete the strays. Run:

```python
import shutil, subprocess
from pathlib import Path

root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel']).decode().strip())
dest = root / 'graphify-out' / 'cache'
dest.mkdir(parents=True, exist_ok=True)

candidates = [root / '.claude' / 'graphify-out']
candidates += [d / 'graphify-out' for d in root.iterdir() if d.is_dir() and d.name != '.claude']

for g in candidates:
    if g.exists():
        cache = g / 'cache'
        if cache.exists():
            for item in cache.iterdir():
                target = dest / item.name
                if item.is_dir():
                    shutil.copytree(item, target, dirs_exist_ok=True)
                else:
                    shutil.copy2(item, target)
        shutil.rmtree(g)

print("Consolidated stray graphify-out caches into SEEDS root")
```

Verify none remain outside the SEEDS root — this should print nothing:
```python
root = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel']).decode().strip())
strays = [d / 'graphify-out' for d in root.iterdir() if d.is_dir() and (d / 'graphify-out').exists()]
print(strays)
```

## Step 3 — Update SEEDS wiki

Follow the SEEDS Wiki schema at `SEEDS wiki/CLAUDE.md`.

1. Read `wiki/index.md` to orient.
2. Read changed files (from Step 1 git diff) to understand scope.
3. Update affected service and concept pages.
4. Create a source page if the change is significant (new feature, architecture change).
5. Update `wiki/index.md` if new pages were created.
6. Append to `wiki/log.md`:
   `## [YYYY-MM-DD] update | Brief description`

## Step 4 — Report

Print a summary:
```
Knowledge base synced.

Graphify:
  - N files re-extracted
  - Graph: X nodes, Y edges (delta: +N nodes, +M edges)
  - Communities: Z (was W)

SEEDS Wiki:
  - Pages updated: [list]
  - Pages created: [list]
  - Source page: [name or "none"]
```

---

$ARGUMENTS - Optional: PR number, commit SHA, branch name, or description of what changed
