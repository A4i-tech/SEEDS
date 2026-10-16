# Security scans on this repo

Two SAST tools run on every pull request into `a4i/staging`.

| Tool | Role | Blocks merge? | Where results show |
|------|------|---------------|--------------------|
| Semgrep | Primary gate. Fast pattern + light dataflow, OSS engine. Rulesets `p/security-audit`, `p/owasp-top-ten`. | **Yes**, once branch protection requires it (see below). A new `ERROR`-severity finding fails the check. | PR **Checks** + Security > Code scanning |
| CodeQL | Depth layer. Interprocedural taint / dataflow for Python and JS/TS. | No. Advisory. | Security > Code scanning |

## Why the gate stays low-noise

- **Diff-aware.** Only findings introduced by the PR are scanned (`--baseline-commit`). Pre-existing findings are not evaluated by the gate. The backlog is tracked in issue #575.
- **Severity gate.** Only `ERROR` (high/critical) is scanned and can block. `WARNING` / `INFO` are not reported by this workflow. Run Semgrep locally (below) to see them.

## Suppressing a false positive

1. **One line** — add on the flagged line:

   ```python
   subprocess.run(cmd, shell=True)  # nosemgrep: dangerous-subprocess-use  cmd is a fixed constant
   ```

   Always name the rule id and say why it is safe.

2. **A whole path** (generated code, vendored deps, test fixtures) — add it to `.semgrepignore` with a one-line reason.

3. **A rule wrong for this codebase every time** — add `--exclude-rule <rule-id>` to the scan step in `.github/workflows/semgrep.yml`, with a comment, after agreeing it with the security owner.

For CodeQL: dismiss the alert in the Security tab with a reason, or add the path to `.github/codeql/codeql-config.yml`.

## Known pre-existing `ERROR` findings (not fixed here)

As of this pipeline landing, a full scan reports `ERROR`-level findings that the
diff-aware gate does **not** block, but that a PR touching those files will have
to address or `# nosemgrep`:

- `yaml.github-actions.security.run-shell-injection` — 8 hits across `.github/actions/*/action.yml`
- `yaml.github-actions.security.secrets-inherit` — 7 hits in `.github/workflows/main.yml` (the reusable-workflow `secrets: inherit` pattern; likely to be excluded once reviewed)

Triage belongs to issue #575.

## Making the gate enforceable

`a4i/staging` currently has **no branch protection at all** — no required
reviews, no required checks, direct push allowed. For the Semgrep check to
actually block a merge, a repo admin must:

1. Add a branch protection rule for `a4i/staging`.
2. Mark **Semgrep / scan** as a required status check.

Until then the check runs and shows red on a finding, but does not stop a merge.

## Not covered yet

- Kotlin / Android (`Teacher-App/`) — CodeQL supports it but needs the Gradle build wired into the workflow. Separate task.
- DAST — tracked in the SAST/DAST rollout plan.

## Local run

Same scan a reviewer can run before pushing, fully sandboxed (no host install):

```bash
docker run --rm -v "$PWD":/src:ro -w /src semgrep/semgrep:latest \
  semgrep scan --config p/security-audit --config p/owasp-top-ten \
  --severity ERROR --oss-only --metrics off
```

Drop `--severity ERROR` to also see `WARNING` / `INFO`.
