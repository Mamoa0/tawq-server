# Contributing to Tawq Server

## Required CI checks

Every PR to `main` must pass all required checks before merging. The canonical
list is in [`.github/required-checks.yml`](.github/required-checks.yml):

| Check | What it verifies |
|---|---|
| `correctness` | Unit and correctness test suite |
| `perf-gate` | Performance regression gate (from 001) |
| `openapi-parity` | `/openapi.json` matches the Fastify route inventory |
| `auth-contract` | API-key 401 contract tests |
| `branch-protection` | Live GitHub Ruleset matches `.github/branch-protection.yml` |

To run parity and contract tests locally:

```bash
npm test                           # full suite
npx vitest run tests/parity        # OpenAPI parity only
npx vitest run tests/contract/auth # auth contract only
```

## Workflow

1. Create a feature branch from `main`.
2. Make changes. Run `npm run build` to catch TypeScript errors.
3. Ensure all required checks pass locally (`npm test`).
4. Open a PR; the CI workflow runs all checks automatically.
5. Get at least one approving review.
6. Merge after all checks are green.

Direct pushes to `main` are blocked by branch protection — all changes arrive
via PR.

## Emergency bypass procedure (FR-020)

Emergency bypass is **disabled by default**. Use only when a critical fix must
land without waiting for a full CI run (e.g., a production outage).

**To enable bypass:**

1. A named repository administrator temporarily adds their GitHub user to the
   ruleset's `bypass_actors` with `bypass_mode: always` in GitHub's repo
   settings (Settings → Rules → Rulesets → main-protection).
2. Merge the critical change.
3. **Immediately** remove themselves from `bypass_actors`.

**Post-bypass obligations:**

- The bypass merge **must** be post-hoc reviewed within one business day by a
  second maintainer.
- The reviewer files an issue summarising what was bypass-merged and why.
- If the bypass actor is not removed from `bypass_actors`, the nightly
  `branch-protection` CI job will fail the next morning, creating a visible
  reminder to clean up.

The `branch-protection` job runs on every push to `main` and on a nightly
schedule (`0 7 * * *` UTC). Any drift between the live GitHub Ruleset and
`.github/branch-protection.yml` produces a failure report written to the
GitHub Actions step summary.
