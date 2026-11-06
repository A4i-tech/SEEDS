# Security scans on this repo

Two SAST tools run on every pull request into `a4i/staging`.

| Tool | Role | Blocks merge? | Where results show |
|------|------|---------------|--------------------|
| Semgrep | Primary gate. Fast pattern + light dataflow, OSS engine. Rulesets `p/security-audit`, `p/owasp-top-ten`. | **Yes**, once the ruleset requires it (see below). A new `ERROR`-severity finding fails the check. | PR **Checks** + Security > Code scanning |
| CodeQL | Depth layer. Interprocedural taint / dataflow for Python and JS/TS. | No. Advisory. | Security > Code scanning |

## Why the gate stays low-noise

- **Diff-aware.** Only findings introduced by the PR are scanned (`--baseline-commit`). Pre-existing findings are not evaluated by the gate. The backlog is tracked in issue #575.
- **Severity gate.** Only `ERROR` (high/critical) can block the PR's own diff. The full-repo advisory step also reports `WARNING`/`ERROR` for the pre-existing backlog in the run summary (see below); it never fails the check.

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

As of this pipeline landing, a full scan reports 19 `ERROR`-level findings.
The diff-aware gate does **not** block on any of these: it only evaluates
lines a PR actually changes, so touching the same file elsewhere does not
require fixing or `# nosemgrep`-ing them:

- `yaml.github-actions.security.run-shell-injection`, 8 hits across `.github/actions/*/action.yml`
- `yaml.github-actions.security.secrets-inherit`, 8 hits in `.github/workflows/main.yml:28-69` (the reusable-workflow `secrets: inherit` pattern; likely to be excluded once reviewed)
- `dockerfile.security.missing-user.missing-user`, 2 hits (`ContentWebApp/Dockerfile`, `teacher-webapp/Dockerfile`); false positive, the final stage is `nginxinc/nginx-unprivileged`
- `typescript.react.security.react-insecure-request.react-insecure-request`, 1 hit

Triage belongs to issue #575.

## Making the gate enforceable

`a4i/staging` already has an active ruleset (2 required approvals, 4 required
test checks, no deletion, no force push). Required checks there match by the
job id, not the display name, so a repo admin must add **`semgrep`** (shown
as *Semgrep / semgrep* in PR checks) to that ruleset's required status
checks.

Until then the check runs and shows red on a finding, but does not stop a merge.

## Not covered yet

- Kotlin / Android (`Teacher-App/`) — CodeQL supports it but needs the Gradle build wired into the workflow. Separate task.
- DAST — tracked in the SAST/DAST rollout plan.

## Local run

Same scan a reviewer can run before pushing, fully sandboxed (no host install):

```bash
docker run --rm -v "$PWD":/src:ro -w /src semgrep/semgrep:1.179.0 \
  semgrep scan --config p/security-audit --config p/owasp-top-ten \
  --severity ERROR --oss-only --metrics off
```

Drop `--severity ERROR` to also see `WARNING` / `INFO`.
