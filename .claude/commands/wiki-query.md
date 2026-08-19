Answer a question using the SEEDS Wiki as the knowledge base.

Follow the SEEDS Wiki schema at `SEEDS wiki/CLAUDE.md`.

## Steps

1. **Read `wiki/index.md`** to identify relevant pages for the question.

2. **Read those pages** and any pages they cross-reference that seem relevant.

3. **Synthesize an answer** with `[[wikilinks]]` citations to wiki pages.

4. **If the answer is reusable** (a comparison, analysis, or connection worth preserving), offer to file it as a synthesis page in the wiki.

5. **If the wiki doesn't have enough information**, say so clearly. Suggest what source could be ingested to fill the gap (e.g. "ingesting the auth middleware code would help answer this — want me to do that?").

$ARGUMENTS - The question to answer
