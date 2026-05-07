# Quickstart: Reviewable Changes & Honest API Contract

**Feature**: `002-reviewable-honest-api` · **Audience**: engineers bringing the feature up locally and administrators applying the GitHub-side configuration.

---

## 0. Prerequisites

- Node.js 22.x, npm 10.x
- Local MongoDB 7 (or Docker `mongo:7`)
- Repository admin access on GitHub (for the one-time branch-protection setup in §5)
- A fine-grained PAT or `GITHUB_TOKEN` with `administration: read` on the target repo (for the `branch-protection` CI job)

---

## 1. Install new dependencies

```bash
npm install fastify-type-provider-zod
npm install -D @octokit/rest
```

Set the new environment variable locally:

```bash
# .env (do NOT commit)
API_KEY_PEPPER=<openssl rand -hex 32>
API_KEY_HEADER=X-API-Key         # default; override only for local testing
```

In CI, `API_KEY_PEPPER` is provided via GitHub Actions secrets. Rotating it invalidates every existing key — document this and rotate deliberately.

---

## 2. Run migrations / seed an API key

No schema migration is required for MongoDB (Mongoose creates the collection lazily). Seed a key for local development:

```bash
npm run keys:create -- --label "local-dev"
# Prints once:
#   API key: 5e2b...d71c         ← record this; server never stores plaintext
#   Key id:  6629...e8f1
```

To revoke:

```bash
npm run keys:revoke -- --id 6629...e8f1
```

The scripts live at `src/scripts/keys/create.ts` and `src/scripts/keys/revoke.ts`. They use the same Mongoose connection as the API.

---

## 3. Verify the three invariants locally

### 3a. Invalid key → 401

```bash
npm run dev
# in another shell:
curl -i http://localhost:5000/api/v1/quran/surahs -H 'X-API-Key: not-a-real-key'
# → HTTP/1.1 401 Unauthorized
# → {"error":"InvalidApiKey","message":"The supplied API key ...","requestId":"..."}
```

### 3b. OpenAPI parity

```bash
npm run test -- tests/parity
# Expect all 5 parity tests to pass in < 10 s.
```

If a test fails, the message identifies the exact drifting route and what to fix. The fastest fix is usually to attach a Zod schema to the route definition that does not yet have one.

### 3c. Branch protection (local dry-run)

```bash
# Dry-run the verifier against the live GitHub state:
GITHUB_TOKEN=<your PAT>  \
GITHUB_REPOSITORY=<owner>/<repo>  \
npx tsx scripts/verify-branch-protection.ts --dry-run
```

The `--dry-run` flag prints what would fail without exiting non-zero, useful while you are iterating on the declared config.

---

## 4. Run the full test suite

```bash
npm test
```

Expected CI jobs, once 001 is merged:

| Job | Source | Wall time |
|---|---|---|
| `correctness` | 001 | < 2 min |
| `perf-gate` | 001 | < 3 min |
| `openapi-parity` | 002 | < 10 s |
| `auth-contract` | 002 | < 20 s |
| `branch-protection` | 002 | < 30 s |

Total PR CI target: **< 5 min** (unchanged from 001's goal).

---

## 5. One-time GitHub configuration (administrator only)

This step is **manual**; the CI job verifies the result but cannot apply it (by design — auto-remediating security controls hides *why* drift happened).

1. Open the repository on GitHub → **Settings → Rules → Rulesets → New branch ruleset**.
2. Name it `main-protection`. Enforcement status: **Active**.
3. Target: **Include default branch** (which is `main`).
4. Rules (match `.github/branch-protection.yml` exactly):
   - ✅ Restrict deletions
   - ✅ Block force pushes
   - ✅ Require a pull request before merging
     - Required approving reviews: **1**
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
     - ✅ Require branches to be up to date before merging
     - Add checks: `correctness`, `perf-gate`, `openapi-parity`, `auth-contract`, `branch-protection` — exactly matching `.github/required-checks.yml`.
   - **Bypass list**: empty. Do NOT add admins to bypass. (`enforce_admins: true`.)
5. Save. Then test: `git push origin main` from any branch (after a commit) and confirm the push is rejected with the GH013 ruleset message.

The nightly `branch-protection` CI job will now continuously verify this configuration. If anyone relaxes a rule by mistake, the job fails within 24 hours.

---

## 6. Provisioning keys for beta consumers

Once merged and deployed:

```bash
# On the production host (or wherever the service runs with DB access):
npm run keys:create -- --label "beta-consumer-Acme" --expires 2026-07-01
```

Share the printed plaintext token with the consumer over a secure channel. **You cannot recover the plaintext later** — if the consumer loses it, revoke and reissue.

---

## 7. Troubleshooting

- **Parity test fails with "missing-from-spec"**: a route was registered without a Zod schema on the Fastify route definition. Attach a `schema: { ...zod schemas... }` object to the route; `fastify-type-provider-zod` will wire the spec entry automatically.
- **Parity test fails with "missing-from-code"**: a manual `registerRoutes()` entry remains for a route that no longer exists in `src/modules/`. Delete the stale entry.
- **`auth-contract/invalid-key.test.ts` fails with 200 instead of 401**: the `api-key.plugin.ts` `preHandler` is not registered on the Fastify instance, or the exempt-path allowlist matched too broadly. Check `src/server.ts` registers `apiKeyPlugin` before route modules.
- **`branch-protection` CI fails with "required_approving_review_count: declared=1 live=0"**: a repo admin disabled review requirements. Re-enable in repo settings and document the outage in an issue per FR-020.
- **Badge stays red after a green merge**: the badge is cached by the browser for 5 minutes. Hard-refresh. If still red after 5 minutes, the workflow is queued or the badge URL points at the wrong workflow file.

---

## 8. What this feature does NOT include

- No self-service signup flow, no user accounts, no OAuth / JWT.
- No write-path endpoints and no authorization model beyond "key is valid or not."
- No per-key quota accounting. The rate limiter buckets by IP (and by IP+keyPrefix for failed attempts); per-key quota tracking is a future feature.
- No migration of existing routes to a new URL scheme. Route paths are unchanged.
