Implement a feature end-to-end using the graphify knowledge graph and SEEDS wiki as context before touching any code.

$ARGUMENTS is the feature description. Read it carefully — it drives everything.

## Step 1 — Extract key terms

Parse $ARGUMENTS for: service names, feature concepts, data models, and any technical terms. These become your search queries for steps 2 and 3.

## Step 2 — Pull context from graphify

Read `graphify-out/GRAPH_REPORT.md` — specifically the God Nodes section to understand core abstractions, and the community list to orient yourself.

Then query the graph for each key term. Use Python directly:

```python
import json, sys
import networkx as nx
from networkx.readwrite import json_graph
from pathlib import Path

data = json.loads(Path('graphify-out/graph.json').read_text())
G = json_graph.node_link_graph(data, edges='links')

terms = [t.lower() for t in "SEARCH_TERMS".split(',')]
scored = []
for nid, ndata in G.nodes(data=True):
    label = ndata.get('label', '').lower()
    score = sum(1 for t in terms if t in label)
    if score > 0:
        scored.append((score, nid, ndata))
scored.sort(reverse=True)

for score, nid, ndata in scored[:20]:
    print(f"NODE: {ndata.get('label', nid)} | file: {ndata.get('source_file','')} | score: {score}")
    for neighbor in list(G.neighbors(nid))[:5]:
        edge = G.edges[nid, neighbor]
        print(f"  -> {G.nodes[neighbor].get('label', neighbor)} [{edge.get('relation','')} {edge.get('confidence','')}]")
```

From the graph output, extract:
- **Files to change** (source_file on matching nodes)
- **Blast radius** (neighbors with EXTRACTED edges — things that will be affected)
- **Integration points** (edges between services/communities)

## Step 3 — Pull context from SEEDS wiki

Read `SEEDS wiki/wiki/index.md` to find relevant pages. Read those pages plus any they cross-reference.

Extract:
- **Architecture intent** — why the current design exists
- **Data models** — fields, constraints, relationships
- **Service boundaries** — what each service owns
- **Known gaps** — anything the wiki explicitly flags as unimplemented or missing

## Step 4 — Synthesize a plan

Before writing any code, produce a concise plan:

```
## Implementation Plan

**What:** [one sentence from $ARGUMENTS]

**Files to change:**
  - path/to/file.py — reason
  - path/to/file.js — reason

**New files (if any):**
  - path/to/new.py — reason

**Blast radius (must not break):**
  - ComponentA — connected via [edge type]
  - ComponentB — connected via [edge type]

**Architecture constraints (from wiki):**
  - [constraint 1]
  - [constraint 2]

**Approach:** [2-3 sentences on the implementation strategy]
```

Show this plan to the user and wait for confirmation before writing any code.

## Step 5 — Implement

After confirmation, implement the changes:
- Follow the architecture constraints from the wiki
- Stay within the blast radius — test or at minimum read every affected file
- Match existing patterns in the codebase (naming, error handling, structure)
- Do not add features, refactoring, or cleanup beyond what $ARGUMENTS asks for

## Step 6 — Update the wiki

After implementation, run `/wiki-update` to reflect the changes in the SEEDS wiki so future sessions have accurate context.

---

$ARGUMENTS - Feature description: what to build, which service it belongs to, and any constraints
