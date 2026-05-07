# Contract: Branch Protection on `main`

**Feature**: `002-reviewable-honest-api` · **Satisfies**: FR-015, FR-016, FR-017, FR-018, FR-019, FR-020

The `branch-protection` CI job asserts that the live GitHub ruleset for `main` matches the declared state in this repository. Any drift fails the job.

---

## 1. Declared state (`.github/branch-protection.yml`)

```yaml
target:
  ref: main
rules:
  pull_request:
    required_approving_review_count: 1
    dismiss_stale_reviews_on_push: true
    require_code_owner_review: false
    require_last_push_approval: false
  required_status_checks:
    strict: true
    contexts_from: .github/required-checks.yml
  enforce_admins: true
  block_force_pushes: true
  block_deletions: true
```

Source of truth for required status check names: `.github/required-checks.yml` (see `data-model.md` §3).

## 2. Verification procedure (FR-015, FR-016, FR-017)

The `scripts/verify-branch-protection.ts` script, run by the `branch-protection-check.yml` workflow:

1. Loads `.github/branch-protection.yml` and resolves `required_status_checks.contexts_from` → list of check names from `.github/required-checks.yml`.
2. Calls `GET /repos/{owner}/{repo}/rulesets` via Octokit with `GITHUB_TOKEN` (requires `administration: read` permission).
3. Finds the ruleset targeting `main`.
4. Diffs each declared rule against the live rule.
5. Exits 0 if every rule matches; exits 1 with a report otherwise.

Expected live rules (mapped from declared config):

| Declared | Live GitHub ruleset check |
|---|---|
| `pull_request.required_approving_review_count: 1` | `required_reviews.required_approving_review_count === 1` |
| `pull_request.dismiss_stale_reviews_on_push: true` | `required_reviews.dismiss_stale_reviews === true` |
| `required_status_checks.strict: true` | `required_status_checks.strict_required_status_checks_policy === true` |
| `required_status_checks` contexts list | `required_status_checks.required_status_checks === resolvedList` (set equality) |
| `enforce_admins: true` | Rule applies to `admin` role (ruleset `bypass_actors` must NOT include admin) |
| `block_force_pushes: true` | `non_fast_forward` rule is present |
| `block_deletions: true` | `deletion` rule is present |

Any declared-rule key missing from the live ruleset, or present with a different value, is a failure. Any unexpected live rule (extra protection not declared) is **permitted but logged as a warning** — over-protection is safe.

## 3. Required status checks (FR-016)

The live required-checks list MUST equal, as a set, the names in `.github/required-checks.yml`:

```
correctness
perf-gate
openapi-parity
auth-contract
branch-protection
```

If the list in GitHub contains any check NOT in this file, or is missing any check that IS in this file, the verification job fails. This is how FR-019 is enforced — a new CI job that should be required but was forgotten in branch protection is caught within one scheduled run.

## 4. Direct-push rejection (FR-015)

Enforced by `non_fast_forward` rule plus requiring PRs. A contributor attempting `git push origin main` with any change receives:

```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - Cannot update this protected ref.
remote: - Required status check: <name> is expected.
remote: Rule violations require review before this change can be completed.
```

This behavior is verified at setup time by `quickstart.md` step 5 and referenced (not repeatedly re-verified) by the CI job, which only checks the ruleset configuration.

## 5. Admin bypass (FR-017)

`enforce_admins: true` MUST appear in the declared config and MUST be reflected in the live ruleset's `bypass_actors`: the admin role MUST NOT appear with a `bypass_mode` that lets admins skip required checks. The only permitted bypass actor in v1 is an explicitly named emergency role (see FR-020), which is OFF by default.

## 6. Health signal (FR-018)

- A CI badge in `README.md` reflects the latest `main` workflow run status.
- Badge URL: `https://github.com/{owner}/{repo}/actions/workflows/ci.yml/badge.svg?branch=main`.
- Latency: GitHub updates the badge within ~60 seconds of workflow completion. No additional tooling required.

## 7. Emergency bypass procedure (FR-020)

Documented in `CONTRIBUTING.md`:

- Emergency bypass is disabled by default.
- To enable: a named repository administrator temporarily adds their GitHub user to the ruleset's `bypass_actors` with `bypass_mode: always`.
- Any merge made under bypass MUST be post-hoc reviewed within one business day by a second maintainer; the reviewer files an issue summarizing what bypass-merged and why.
- After the incident, the admin removes themselves from `bypass_actors`. The `branch-protection-check` nightly run will fail the next day if the temporary bypass is left in place, forcing removal.

## 8. Verification job CI integration

- Job name: `branch-protection` (matches `.github/required-checks.yml`).
- Runs on: pushes to `main`, and on a nightly schedule (`cron: "0 7 * * *"` UTC).
- Required PAT scope: `GITHUB_TOKEN` with `administration: read` OR a scoped fine-grained PAT stored as `BRANCH_PROTECTION_READ_TOKEN`. Choice documented in `quickstart.md`.
- Job wall time target: **< 30 s** (one API call + one local YAML load + diff).

## 9. Failure report format

Markdown written to `$GITHUB_STEP_SUMMARY`:

```markdown
## Branch protection drift on `main`

| Rule | Declared | Live | Action |
|---|---|---|---|
| required_approving_review_count | 1 | 0 | Set live to 1 |
| enforce_admins | true | false | Re-enable admin enforcement |
| required_status_checks | {correctness, perf-gate, openapi-parity, auth-contract, branch-protection} | {correctness, perf-gate} | Add missing checks to live ruleset |
```

Each row contains a concrete remediation. An operator should be able to fix the drift using only the report and GitHub's repo settings UI.
