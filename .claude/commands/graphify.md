Run the graphify knowledge graph pipeline.

Use the Skill tool with skill: "graphify" and args: "$ARGUMENTS" before doing anything else.

$ARGUMENTS - Path and flags (e.g. "platform", "platform --update", "query \"how does streaming work\""). If empty, run on current directory.

## Working directory

Every graphify run and wiki-ingest must use the SEEDS root as the working directory, regardless of which service repo is being ingested — the INPUT path is the service repo, but the WORKING dir is always the SEEDS root:

```
# Correct
cd "$(git rev-parse --show-toplevel)"
python detect_run.py   # INPUT path = service repo, WORKING dir = SEEDS root

# Wrong — do not run graphify from inside a service repo or from .claude
cd "$(git rev-parse --show-toplevel)/Teacher-App"
cd "$(git rev-parse --show-toplevel)/.claude"
```

Intermediate temp files (`.graphify_*.json`, helper scripts) must also be created at the SEEDS root, not in service repos or `.claude/`.

## After the pipeline — ALWAYS consolidate cache

graphify writes a `graphify-out/cache/` **next to every path it scans**, leaving stray dirs in service repos (or `.claude/`, if it was ever run from there). When the run finishes, merge them into the canonical `graphify-out/cache/` at the SEEDS root and delete the strays:

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
