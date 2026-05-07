# Data Model: Reviewable Changes & Honest API Contract

**Feature**: `002-reviewable-honest-api` · **Date**: 2026-04-25

This feature adds one new persisted entity (`ApiKey`), declares two derived / process-level entities (`RouteInventory`, `RequiredChecksConfig`), and references one external entity (`BranchProtectionRule`). Existing entities are untouched.

---

## 1. `ApiKey` (persisted, MongoDB collection `api_keys`)

Represents a credential that identifies a caller. The plaintext value is never stored; only its HMAC-SHA-256 digest (using `API_KEY_PEPPER` as the HMAC secret) is persisted.

### Fields

| Field          | Type                                         | Required | Notes |
|----------------|----------------------------------------------|----------|-------|
| `_id`          | `ObjectId`                                   | yes      | MongoDB primary key |
| `hashedKey`    | `string` (64-char lowercase hex)             | yes      | `hmacSha256(API_KEY_PEPPER, plaintext)`; **unique index** |
| `label`        | `string` (1–120 chars)                       | yes      | Human-readable owner identifier, e.g., `"beta-consumer-Acme"` |
| `status`       | `"active" \| "revoked" \| "expired"`        | yes      | See state transitions below |
| `createdAt`    | `Date`                                       | yes      | Mongoose timestamp |
| `revokedAt`    | `Date \| null`                               | no       | Set when `status` transitions to `revoked` |
| `expiresAt`    | `Date \| null`                               | no       | Optional expiry — if set and in the past, treated as expired at read time |
| `lastUsedAt`   | `Date \| null`                               | no       | Updated at most once per 60 s per key, best-effort (not on the hot path) |

### Indexes

- `{ hashedKey: 1 }` — **unique**. Drives the O(1) validation lookup.
- `{ status: 1, expiresAt: 1 }` — supports administrative list/scan for the `keys:list` script.

### Validation rules

- `hashedKey` matches `/^[0-9a-f]{64}$/`.
- `label` is non-empty after trim.
- `status` is one of the three enum values.
- `expiresAt` (when present) is strictly after `createdAt`.
- `revokedAt` is present iff `status === "revoked"`.

### State transitions

```text
        ┌──────────┐  revoke()   ┌──────────┐
        │  active  │────────────▶│ revoked  │ (terminal)
        └────┬─────┘             └──────────┘
             │
  (expiresAt passes)
             ▼
        ┌──────────┐
        │ expired  │ (terminal at read time; no row update needed)
        └──────────┘
```

- **Create**: always starts in `active`.
- **Revoke**: explicit admin action; sets `status="revoked"` and `revokedAt=now()`. Idempotent.
- **Expire**: implicit — a key with `expiresAt < now()` is treated as expired on validation without a write. A periodic cleanup job (out of scope for this feature) may materialize the state later.

### Derived rules for FR-002 / FR-004

- A validation request is **accepted** iff a matching row exists AND `status === "active"` AND (`expiresAt` is null OR `expiresAt > now()`).
- Any other outcome (no match, `status !== "active"`, expired) produces **the same** 401 response (stable `error: "InvalidApiKey"`, generic message) so existence of a row is not leakable.

---

## 2. `RouteInventory` (derived, in-memory at startup)

Not persisted. Derived from two sources at server startup and compared by the parity test:

- **Source A**: `fastify.printRoutes({ commonPrefix: false, includeHooks: false })` — the set of method+path pairs Fastify actually serves.
- **Source B**: `Object.keys(openApiDocument.paths).flatMap(path => methodsFor(path))` — the set present in the generated spec.

### Canonicalization rules (applied to both sets before comparison)

- Lowercase the HTTP method.
- Trim trailing slashes (`/api/roots/` → `/api/roots`), except for a bare root `/`.
- Normalize path parameter names (`{number}` vs `:number`) to OpenAPI's `{param}` form.
- Ignore internal / plugin-registered routes on the allowlist (`/reference`, `/reference/*`, `/openapi.json`, `/health`, `/ready`) — these are expected to be in Fastify but are exempt from the public contract parity check.

### Parity checks

| Check | FR ref | Rule |
|---|---|---|
| Inventory equality | FR-008, FR-009 | `A \ B == ∅` and `B \ A == ∅` after canonicalization |
| Response schema match | FR-010 | For each route in `A ∩ B`, a sample successful response validates against the `responses["2xx"]` schema in the spec |
| Parameter schema match | FR-011 | For each route in `A ∩ B`, the handler's Zod validator is structurally equivalent to the spec's `parameters` / `requestBody` schemas |
| Security declaration match | FR-012 | For each route in `A ∩ B`, the plugin's auth-exempt flag agrees with the spec's `security` entry (none for exempt; `ApiKeyAuth` scheme otherwise) |

---

## 3. `RequiredChecksConfig` (version-controlled, `.github/required-checks.yml`)

A single YAML file listing the CI job names required to merge to `main`. The file is the source of truth; both `branch-protection.yml` and `ci.yml` reference it.

### Schema

```yaml
# .github/required-checks.yml
version: 1
checks:
  - name: correctness            # from 001
    description: Vitest correctness suite
  - name: perf-gate              # from 001
    description: Performance regression gate
  - name: openapi-parity         # from 002 (this feature)
    description: /openapi.json vs Fastify route inventory
  - name: auth-contract          # from 002 (this feature)
    description: API-key 401 contract tests
  - name: branch-protection      # from 002 (this feature)
    description: Verifies live GitHub Ruleset matches declared config
```

### Validation rules

- `version` must be `1` (reserved for future migrations).
- `checks` is a non-empty list; each `name` is a valid GitHub workflow job name (alphanumeric + `-`).
- No duplicate names.

The parity test file (`tests/parity/required-checks.test.ts`) asserts that every job in `.github/workflows/ci.yml` that is intended to be required appears in this file, and vice versa.

---

## 4. `BranchProtectionRule` (external, GitHub-side)

Not stored in the repository. Its *intended* state lives in `.github/branch-protection.yml`; the actual state is queried from the GitHub API at verification time.

### Intended-state schema (`.github/branch-protection.yml`)

```yaml
# .github/branch-protection.yml
target:
  ref: main
rules:
  pull_request:
    required_approving_review_count: 1
    dismiss_stale_reviews_on_push: true
    require_code_owner_review: false
    require_last_push_approval: false
  required_status_checks:
    strict: true                    # Require branches to be up-to-date before merging
    contexts_from: .github/required-checks.yml
  enforce_admins: true              # FR-017: no admin bypass in normal operation
  block_force_pushes: true
  block_deletions: true
```

### Verification

Performed by `scripts/verify-branch-protection.ts`, run by the `branch-protection-check.yml` workflow:

1. Read `.github/branch-protection.yml`.
2. Resolve `contexts_from` by loading `required-checks.yml` and extracting the `name` values.
3. Call `GET /repos/{owner}/{repo}/rulesets` via Octokit and locate the `main` ruleset.
4. Diff each rule against the declared config.
5. Exit non-zero on any drift; emit a concise failure report listing each divergent rule, the declared value, and the observed value.

---

## Relationships

```text
ApiKey (persisted) ──► validated by ──► api-key.plugin.ts
                                         │
                                         ▼
                                 preHandler on every
                                 non-exempt route

RouteInventory (runtime) ──► compared with ──► /openapi.json
                                                       │
                                                       ▼
                                              tests/parity/*

RequiredChecksConfig ──► referenced by ──► BranchProtectionRule
           │                                         │
           │                                         ▼
           └──► referenced by ──► .github/workflows/ci.yml
                                         │
                                         ▼
                                  verify-branch-protection.ts
```

No entity has a foreign-key relationship to another in MongoDB terms. The relationships above are **configuration** (YAML refers to YAML) and **contract** (test asserts A equals B).

---

## Out-of-model

- No new fields on existing entities (`Surah`, `Verse`, `Word`, `Token`, `Root`, `RootMeaning`).
- No plaintext key storage anywhere — including logs, error messages, or exception traces.
- No per-user session state; API keys are stateless from the server's perspective beyond the O(1) lookup.
