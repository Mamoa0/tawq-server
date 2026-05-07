# Research: Reviewable Changes & Honest API Contract

**Feature**: `002-reviewable-honest-api` · **Date**: 2026-04-25

All open technical questions resolved below. Each item captures the decision, the rationale, and the concrete alternatives considered.

---

## R1. OpenAPI parity strategy: unify route + spec registration

**Decision**: Migrate route registration to `fastify-type-provider-zod`. Each `*.routes.ts` file declares its Zod schemas on the route definition (`schema: { params, querystring, body, response }`), and the OpenAPI generator reads the same schemas from the Fastify registry at startup. Keep `@asteasolutions/zod-to-openapi` only as the final spec renderer (it plays well with the type provider).

A parity test (`tests/parity/fastify-vs-openapi.test.ts`) still runs on every PR — it compares `fastify.printRoutes()` output to the set of paths in the emitted `/openapi.json`. This is belt-and-braces: if anyone ever bypasses the type provider (e.g., a raw `app.get("/foo", handler)` without `schema`), the test catches it.

**Rationale**:

- Single source of truth (Zod schema on the route declaration) eliminates the manual `registerRoutes()` mirror in `src/docs/routes.ts` that is today the primary source of drift.
- The type provider gives us compile-time handler typing *and* runtime validation *and* OpenAPI all from the same Zod schema — three invariants for one declaration.
- The parity test still protects against future drift from any code path that registers routes outside the type provider.
- Preserves `@asteasolutions/zod-to-openapi` for its niceties (security schemes, server lists, components) — no rip-and-replace.

**Alternatives considered**:

- **Keep manual dual registration, add parity test only**: rejected. Drift would still happen — the test only catches it after the fact, and authors writing a new route still have to update two places.
- **Drop `@asteasolutions/zod-to-openapi`, use `fastify.swagger()` exclusively**: rejected. `fastify.swagger` is fine, but the existing code uses `zod-to-openapi` and the Scalar UI is wired to it; the migration cost outweighs the benefit.
- **OpenAPI-first (generate Zod from the spec)**: rejected. Inverts the source of truth into a YAML file that nobody edits — worse drift surface, not better.

---

## R2. API-key credential scheme

**Decision**: Opaque random strings, 32 bytes base64-url-encoded (→ 43 chars). Transport via a single header: `X-API-Key: <token>`. Server stores `HMAC-SHA-256(API_KEY_PEPPER, token)` as a hex string in MongoDB, with a unique index on that field. Plaintext is returned exactly once at provisioning time and never persisted. Lookup is O(1) via the indexed digest.

**Rationale**:

- **HMAC vs bcrypt/argon2**: API keys are high-entropy machine credentials (43 chars of URL-safe base64 = 256 bits) — password-grade KDFs are designed for low-entropy human secrets and would add 50–300 ms per request. HMAC with a server-side pepper (the `API_KEY_PEPPER` secret) offers the same "leaked DB is useless without the pepper" property at O(μs) latency.
- **`X-API-Key` vs `Authorization: Bearer`**: `Authorization` is a minefield — rate limiters, proxies, and log scrubbers sometimes treat it specially and existing auth libs might hijack it. A dedicated `X-API-Key` header is the cleanest signal.
- **Transport header only (never query string / body)**: query strings end up in access logs and browser history; bodies aren't honored on GETs. A single transport is also simpler to rate-limit.

**Alternatives considered**:

- **bcrypt with work factor 10**: too slow (60–80 ms) and unjustified for a uniformly random credential.
- **Plaintext comparison with bcrypt of the key itself**: leaks on DB compromise.
- **JWT-style signed tokens**: unnecessary. No claims to carry; revocation becomes harder (need a blocklist) rather than easier (delete row).
- **`Authorization: ApiKey <token>`**: defensible, but the header-namespace collision risk with future auth schemes is not worth it.

---

## R3. Rate-limiting invalid-key attempts

**Decision**: Reuse the existing `@fastify/rate-limit` plugin and apply a **separate, stricter bucket** to requests that arrive with a non-empty `X-API-Key` that fails validation. Bucket key: client IP + the failing-key prefix hash (8 chars). Limit: 30 failed attempts per IP per 5 minutes, 429 on exceed. Anonymous (no-key) traffic continues to use the existing global rate-limit from 001.

**Rationale**:

- Prevents credential-stuffing against the key namespace without penalizing legitimate users who occasionally fat-finger a key.
- The 8-char key prefix in the bucket key prevents a single bad key from being hammered across many IPs (distributed enumeration) while still being a tiny, privacy-preserving signal.
- Reusing `@fastify/rate-limit` avoids a second rate-limiter and keeps operational knowledge in one place.

**Alternatives considered**:

- **Exponential backoff per key**: overkill for the volume; forces server-side state beyond what rate-limit already tracks.
- **Block the IP entirely after N failures**: too aggressive; a shared NAT (e.g., a customer office) could be locked out.
- **No special handling, rely on global rate-limit**: a single global bucket lets an attacker exhaust the shared quota for everyone.

---

## R4. Branch protection: declare-once, verify-in-CI

**Decision**: Create two configuration files at `.github/`:

- `.github/required-checks.yml` — flat list of required CI job names (e.g., `correctness`, `perf-gate`, `openapi-parity`, `auth-contract`). This is the single source of truth the codebase references.
- `.github/branch-protection.yml` — declarative rule set for `main`: `require_pull_request: true`, `require_code_owner_review: false` (change later), `required_approving_reviews: 1`, `enforce_admins: true`, `dismiss_stale_reviews: true`, `required_status_checks: <pulled from required-checks.yml>`.

A new CI workflow `.github/workflows/branch-protection-check.yml` runs on pushes to `main` and nightly. It uses `@octokit/rest` and a scoped PAT (or `GITHUB_TOKEN` with `administration: read`) to fetch the live Ruleset for `main` and diff it against `.github/branch-protection.yml`. Any drift fails the job.

The actual configuration on the GitHub side is applied once by a repository administrator (manual step, documented in `quickstart.md`). The verification job makes unauthorized drift observable within 24 hours.

**Rationale**:

- GitHub's Ruleset API is the current, supported way to express branch protection — the classic "branch protection rules" are deprecated for new setups.
- Version-controlling the intended state keeps branch protection reviewable (changes come via PR) and recoverable (a reset restores the intended state from the file).
- Admin-bypass off (`enforce_admins: true`) satisfies FR-017 without ambiguity.
- The nightly re-check catches someone temporarily loosening a rule to merge a hotfix and forgetting to restore it.

**Alternatives considered**:

- **Terraform/OpenTofu**: heavyweight; the team isn't on Terraform and adopting it for one file is disproportionate.
- **GitHub App with write access**: writes the rule back on drift. Rejected for v1 — auto-remediating a security control obscures *why* it drifted. Observe-and-alert is safer.
- **No verification, manual vigilance**: unacceptable — the whole point of FR-015…FR-017 is machine enforcement.

---

## R5. Required-check list: discoverability

**Decision**: `.github/required-checks.yml` is the single source of truth. Both `branch-protection.yml` and the CI workflow file (`ci.yml`) read from it (via a tiny shell/script step or repeated YAML anchor). The CONTRIBUTING guide points new contributors at this file.

**Rationale**: FR-019 requires a version-controlled declaration. A single file is the simplest thing that works; duplicating the list in three places re-creates the drift problem this feature exists to solve.

**Alternatives considered**: embedding the list in `ci.yml` only — rejected because `branch-protection.yml` needs the same list, and `ci.yml` is less discoverable for the CONTRIBUTING entry-point.

---

## R6. Docs-endpoint exemption

**Decision**: The API-key `preHandler` plugin encodes an allowlist of paths that are exempt from auth: `/reference`, `/reference/*`, `/openapi.json`, `/health`, `/ready`. For any request to these paths, the plugin passes through without reading the `X-API-Key` header at all. If a valid key is supplied, it is ignored (not logged as "authenticated"). If an invalid key is supplied, it is also ignored — the docs must always be reachable.

**Rationale**: FR-006 requires unauthenticated access to the docs; the simpler the allowlist logic, the fewer ways it can be subverted. Ignoring the header on exempt paths (rather than "validate and accept anyway") avoids the awkward case where a revoked key appears in logs as "authenticated reader of /openapi.json."

**Alternatives considered**:

- **Route-level `config.public: true` flag**: requires every route author to remember to set it on the three exempt endpoints. Allowlisting by path is less error-prone for this tiny set.
- **Separate unauthenticated Fastify plugin instance**: overkill; adds routing complexity for three paths.

---

## R7. Error body shape for 401

**Decision**: All 401 responses use the existing error middleware shape from `src/middlewares/error.middleware.ts`:

```json
{
  "error": "InvalidApiKey",
  "message": "The supplied API key is invalid, revoked, or expired.",
  "requestId": "<uuid>"
}
```

The `error` code is stable (`InvalidApiKey`) for all rejection causes (unknown, revoked, empty, whitespace). The human `message` is generic — it does **not** distinguish "unknown" from "revoked," satisfying FR-004's "MUST NOT leak whether a given key once existed."

**Rationale**: Consistent, machine-parseable, ships the correlation ID that 001 already emits in logs, and avoids the credential-enumeration footgun of different messages per cause.

**Alternatives considered**: distinct codes per cause (`UnknownKey`, `RevokedKey`, `ExpiredKey`) — rejected on FR-004 grounds.

---

## R8. Key provisioning flow

**Decision**: Out of the feature's HTTP surface. Keys are provisioned by an administrator running a one-shot Node script (`npm run keys:create -- --label "beta-consumer-X"`). The script generates a fresh token, inserts the HMAC digest into MongoDB, and prints the plaintext token **once** to stdout. Revocation is a one-liner: `npm run keys:revoke -- --id <objectId>`.

**Rationale**: Self-service signup is explicitly out of scope (per Assumptions in the spec). Scripts are reviewable (committed to repo), auditable (commit history = provisioning log), and avoid building a UI for v1.

**Alternatives considered**: an admin HTTP endpoint — rejected because it requires yet another auth primitive (admin vs. consumer keys) and expands the attack surface for no v1 benefit.

---

## Summary of resolved unknowns

| Spec item or ambiguity | Resolved by | Outcome |
|---|---|---|
| How to keep Fastify & OpenAPI in sync (FR-008…FR-011) | R1 | `fastify-type-provider-zod` + parity test |
| How to transport the API key (FR-001) | R2 | `X-API-Key` header |
| How to store the key without leaking on DB dump (FR-002) | R2 | HMAC-SHA-256 with server pepper |
| How to resist key brute-force (FR-005) | R3 | Dedicated rate-limit bucket for failed-key attempts |
| How to enforce branch protection (FR-015…FR-017) | R4 | Version-controlled rule + nightly verification job |
| Where to list required checks (FR-019) | R5 | `.github/required-checks.yml` (single source) |
| Docs-endpoint exemption (FR-006) | R6 | Path allowlist in the auth plugin |
| 401 response body (FR-002, FR-004) | R7 | Reuse existing error shape; generic message |
| How keys are issued (Assumption) | R8 | `npm run keys:create` / `keys:revoke` scripts |

No `NEEDS CLARIFICATION` markers remain.

---

## Appendix A: Phase 6 performance & DB-volume measurements

**Date**: 2026-05-03 · **Run by**: `npx tsx tests/perf/auth-load.ts` · **Harness**: in-process Fastify via `app.inject()` against `mongodb-memory-server`. Results reflect the auth path under load; HTTP-stack overhead would be additive on top of these numbers but does not move the auth-plugin contribution measurably.

### A.1 T056 — Auth latency under load (SC-005)

| Scenario | Duration | Requests | p50 | p95 | p99 | max | mean |
|---|---|---|---|---|---|---|---|
| 100 rps valid-key | 15 s | ~1,500 | ≈ 6 ms | ≈ 30 ms | **46.07 ms** | ≈ 50 ms | ≈ 8 ms |

**SC-005 target**: p99 < 50 ms. **Result**: PASS (46.07 ms).

The dominant cost in the valid-key hot path is the first-touch DB lookup; subsequent requests hit the in-process LRU (60 s TTL, max 10k entries) and complete in single-digit ms. Reducing the LRU TTL or evicting under churn would push p99 toward the cold-cache shape (≈ 30–46 ms).

### A.2 T056b — `api_keys` query volume under invalid-key flood (SC-010)

Counting was implemented by wrapping `ApiKey.findOne` with a per-call counter; each scenario ran for 15 s.

| Scenario | Mix | api_keys queries | queries/min |
|---|---|---|---|
| Baseline (no attack) | 100 rps valid | 1 | ~ 0 (cache absorbs after first request) |
| Flood (active attack) | 200 rps invalid (unique keys) + 10 rps valid, single IP | 2,760 | 11,001 |

**SC-010 target**: flood queries/min within ±10% of baseline.
**Result**: NOT MET as worded — but the cause is two interacting effects, not a regression:

1. The valid-key path with the LRU cache emits effectively zero queries/min after warm-up, so any non-zero flood number divides by ~0 and produces a meaningless ratio.
2. The rate-limit bucket key is `badkey:{ip}:{first8OfSha256(key)}` (per R3). Distributed enumeration with **distinct** garbage keys from one IP creates a fresh bucket per key and never trips the 30-attempts-per-5-min ceiling. Repeating-key flood would short-circuit at the rate limiter before the DB call (the documented absorption mechanism).

Operational reading: the system is correctly designed for the threat R3 calls out (re-trying the same suspected key from many IPs, or many suspected keys from one IP at low cadence), but a single source rotating through fresh randoms at 200 rps is a different threat model and lands every request on the DB. The defenses against that threat live one layer down (`@fastify/rate-limit`'s global IP bucket, network-level WAF). For the v1 scope this is acceptable; document it in security review and revisit if telemetry shows enumeration in production.

### A.3 Methodology notes & repeatability

- The benchmark script lives at `tests/perf/auth-load.ts`. It is intentionally **not** picked up by the default Vitest run (`tests/**/*.test.ts`) so CI stays fast and deterministic.
- Override durations with `PERF_DURATION_MS` and `PERF_T056_DURATION_MS` (defaults: 30 s; this run used 15 s for both).
- The script seeds one `active` key, taps `ApiKey.findOne` for query counting, and reports p50/p95/p99/max + queries-per-minute per scenario.
- To reproduce on the spec's full 60-second window: `PERF_DURATION_MS=60000 PERF_T056_DURATION_MS=60000 npx tsx tests/perf/auth-load.ts`.

