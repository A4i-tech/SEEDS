# Textbook remediation

Turns a textbook PDF into an accessible document, one re-runnable stage at a
time. Built on [OmniIngest](https://github.com/A4i-tech/OmniIngest) — the OCR
itself is upstream's `page_chunking` + `ocr` agents, not ours.

    book.pdf     --[A: OCR]----------->  raw.md
    raw.md       --[B: review agent]-->  corrected.md + findings.jsonl
    corrected.md --[C: remediate]----->  remediated.docx

Each stage writes its own artifact and never overwrites the one before it, so a
bad review pass costs nothing to redo while the expensive OCR output is still
on disk.

All three stages are wired. Only the model calls are unproven — no key is set yet.

## Install

`omni-ingest` cannot share the platform's environment: it pulls starlette >=1.0,
which needs fastapi >=0.119, and the platform pins fastapi <0.119. So it gets a
venv of its own, and the consumer drives these pipelines as a subprocess against
that interpreter:

    python -m venv .venv-remediation
    .venv-remediation/bin/pip install -r app/remediation/requirements.txt
    export REMEDIATION_PYTHON=$PWD/.venv-remediation/bin/python

In Docker: `--build-arg INSTALL_REMEDIATION=true`, which builds the same venv at
`/app/.venv-remediation`. Build it for the consumer tier only — the api tier
never runs a pipeline.

## Stage A — textbook PDF to Markdown

    $REMEDIATION_PYTHON -m app.remediation.run app/remediation/textbook_ocr.yaml \
      --input book.pdf --output run.json \
      --engine llm --pages 3 --out out/raw.md

    page_chunking   PDF -> one single-page PDF per page      free
    ocr             pages -> Markdown                        COSTS MONEY, one call per page
    write_markdown  join pages in order -> raw.md            free

Flags: `--engine`, `--language`, `--pages` (OCR only the first N),
`--concurrency`, `--out`. `--resume <run-id>` skips completed stages.

Page-chunking first is not decoration. The `llm` engine sends the whole
document in one vision call, which a 120-page textbook will not survive.

**Start with `--pages 3`.** Three pages answer the only question worth asking
before spending on a hundred and twenty: does the Markdown come back with
`$...$` math delimiters and image alt text? Stages B and C both depend on
those, and the upstream OCR prompt asks for neither.

Engines differ by OmniIngest version: PyPI 0.1.2 has `llm`/`openai`/`azure_di`;
`a4i/main` has `llm`/`azure_di`/`sarvam` and renames the OCR agent's `workers`
to `concurrency`. `llm` is the right default — `openai` and `azure_di` return a
page's *existing text layer* when it has one, which is plain text with no
markdown structure and no alt text.

### Upstream behaviour this works around

* `concurrency` is ignored by the `llm` and `sarvam` engines — the semaphore is
  passed but never acquired — so every page fires at once. `--pages` is the
  only brake on a 120-page book.
* Never name a pipeline file after a built-in step. `_resolve_step_pipeline_path`
  checks for a sibling `<agent>.yaml` *before* the step registry, so an
  `ocr.yaml` silently shadows the built-in `ocr` step and fails with an
  unrelated parameter error. The file here is `textbook_ocr.yaml` for that
  reason.
* Image assets do not survive OCR: the sarvam engine reads one file out of the
  returned zip and discards the rest, and `llm`/`azure_di` return text only. So
  figures reach stage C as alt text without a resolvable `src`.

## Stage B — review

    $REMEDIATION_PYTHON -m app.remediation.run app/remediation/review.yaml \
      --input out/raw.md --output review.json \
      --language kn --script latin --out-dir out

    alt_translate   English figure alt text -> the book's language   COSTS MONEY
    postcorrect     mechanical fixes, gated audit, verification      audit COSTS MONEY

Writes `<stem>.corrected.md`, `<stem>.findings.jsonl` and `<stem>.alt.jsonl`.
`raw.md` is never modified.

`--language en` makes translation a no-op; `--no-audit` makes the whole stage
free, leaving only the mechanical fixes.

`alt_translate` runs first on purpose. `postcorrect` treats an image reference
as a protected span its audit may never touch, so translating first means the
translated text is protected for the rest of the run instead of becoming an
audit target.

## Stage C — accessible Word document

    $REMEDIATION_PYTHON -m app.remediation.run app/remediation/textbook_docx.yaml \
      --input out/raw.corrected.md --output docx.json \
      --out out/remediated.docx --assets-dir out

    remediate   strip page furniture, summarise tables, fix heading levels   summaries COST MONEY
    docx        pandoc -> .docx                                              free

Writes `<stem>.remediated.md`, `<stem>.remediation.jsonl` and the `.docx`.

The remediation rules are the manual ones from the Tamil Nadu and I-Stem
workflows. Page furniture — standalone page numbers, Roman numerals, bare URLs,
QR captions — is removed line by line and every removal is logged with its text,
so a reviewer can reverse it. A number alone on a line goes; a number inside a
sentence stays. Heading levels are made to descend one at a time so document
navigation works. Each table gets a one-sentence summary above it saying what it
holds, which is the only part of this step that calls a model.

Pandoc gives the rest for free, verified on 3.1.11: `$...$` becomes OMML, tables
become real Word tables, headings become Word heading styles, and image alt text
becomes the `descr` field NVDA announces.

**Pandoc drops an image *and* its alt text when the `src` does not resolve.** An
unresolved figure would therefore vanish silently, so `docx` turns its alt text
into a visible `**Figure.**` paragraph instead and logs it to
`remediated.unresolved.jsonl`. A visible line is a worse document than a real
alt-text field and a much better one than nothing. Since OCR returns no image
files (see above), this is currently the path every figure takes — point
`--assets-dir` at extracted images to get real alt-text fields.

## postcorrect

The stage-B review agent. LLM proposes, code decides, verifier checks — the
model never edits text.

    mechanical   CRLF, NFC, LaTeX backslash repair, duplicate combining marks
    chunk        audit units, split on blank lines
    audit        one structured model call per unit  <- the only stage that spends
    apply        every rule re-derived in code
    verify       digits, protected-span count, length budget; revert unit on failure

Gates, in order: `script_uncalibrated` (only `devanagari` is calibrated),
`decision`, `confidence` >= 0.97, `class` (Class A only), `beautification`,
`anchoring` (the context triple must match exactly once), `protected_span`,
`budget` (<= 5% of a unit's characters).

Auto-apply is off by default: everything is queued and nothing is written back.
Artifacts land in `--out-dir` as `<stem>.corrected.md` and
`<stem>.findings.jsonl`, one record per mechanical change, model proposal (with
the gate that stopped it) and revert. The input file is never modified.

## Credentials

One vision-capable chat model key (`DEFAULT_CHAT_COMPLETION_MODEL`) covers OCR
and the audit. `openai` needs `OCR_BASE_URL`/`OCR_API_KEY`, `azure_di` needs
`DOCUMENTINTELLIGENCE_*`. OmniIngest reads `.env` from the working directory.

## Where this runs in SEEDS

    ContentWebApp  Textbooks tab -> POST /textbook-remediation/jobs
    platform api   controller: creates the job, uploads the PDF, serves artifacts + SSE
    platform consumer  TextbookRemediationConsumer: claims it, runs the three
                       pipelines as subprocesses, uploads each artifact as it lands

Job state lives in `textbookRemediationJobs`; artifacts live in blob storage
under `textbook-remediation/<job_id>/`. Progress reaches the browser by the API
polling Mongo, because the consumer is a different process from the one serving
the stream.

## Tests

    poetry run pytest tests/unit/test_remediation.py         # pipeline steps
    poetry run pytest tests/unit/test_textbook_remediation.py  # job + API

The first covers the pure decision functions — gates, page ordering, alt-span
rewriting, page furniture, heading levels, unresolved images — and skips
entirely when omni-ingest is not importable. Neither needs a model key.
