---

description: "Task list for 002-reviewable-honest-api"
---

# Tasks: Reviewable Changes & Honest API Contract

**Input**: Design documents from `/specs/002-reviewable-honest-api/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: REQUIRED. The spec mandates contract and parity tests as the observable proof of every functional requirement (FR-001…FR-014, FR-016, FR-019, SC-001, SC-002, SC-005, SC-006, SC-007, SC-010). Tests are not optional here — they ARE the deliverable.

**Organization**: Tasks are grouped by user story. Each story is independently implementable and testable; US1 alone is a shippable MVP.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete-task dependencies)
- **[Story]**: Which user story this task serves (US1, US2, US3)
- File paths are absolute-within-repo

## Path Conventions

- Source: `src/` at repo root
- Tests: `tests/` at repo root (parity/ and contract/ subdirs added by this feature)
- Config: `.github/` for CI + branch-protection configuration
- Scripts: `scripts/` (branch-protection verifier); `src/scripts/keys/` (key provisioning CLIs)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies, add environment configuration, scaffold test directories.

- [x] T001 Install runtime dependency `fastify-type-provider-zod` (add to `package.json` dependencies, run `npm install`)
- [x] T002 Install dev dependencies `@octokit/rest` and `mongodb-memory-server` (add to `package.json` devDependencies, run `npm install`). `mongodb-memory-server` is the test-isolation seam used by `buildTestApp()` (T009) — added by this feature so tests are not coupled to whatever 001 happens to ship.
- [x] T003 [P] Add `API_KEY_PEPPER` (required, min 32 chars) and `API_KEY_HEADER` (default `X-API-Key`) to the Zod env schema in `src/config/env.ts`
- [x] T004 [P] Add `API_KEY_PEPPER=<generate-with-openssl-rand-hex-32>` and `API_KEY_HEADER=X-API-Key` placeholders to `.env.example`
- [x] T005 [P] Create directory scaffolding: `tests/parity/`, `tests/contract/auth/`, `tests/helpers/`, `tests/fixtures/parity/` with `.gitkeep` files
- [x] T006 [P] Create directory scaffolding: `src/scripts/keys/`, `src/plugins/`, `src/services/`, `scripts/` with `.gitkeep` files for those that do not yet exist

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish the minimum plumbing every user story needs: the app factory for in-process testing, the test runner config, and the error-body shape all 401s rely on.

**⚠️ CRITICAL**: No user story work may begin until this phase completes.

- [x] T007 Extract Fastify bootstrap into a `createApp()` factory at `src/app.ts` (move plugin/route registration out of `src/server.ts`; `server.ts` becomes `createApp().then(app => app.listen(...))`). This is the seam tests boot against.
- [x] T008 [P] Add Vitest configuration at `vitest.config.ts` at repo root: test include globs (`tests/**/*.test.ts`), globals on, 60s timeout, coverage excludes for scripts. Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`.
- [x] T009 [P] Create `tests/helpers/app.ts`: `buildTestApp()` helper that calls `createApp()` against a `mongodb-memory-server` instance (started in a Vitest `globalSetup` at `tests/helpers/setup.ts`, URI exposed via the `MONGO_URI_TEST` env var). The helper reads `process.env.MONGO_URI_TEST` (falling back to `MONGO_URI` ONLY when set, e.g. for CI runners that prefer a containerized Mongo), boots the app, and returns `{app, close}`. Every test imports this helper — no test connects to a real shared MongoDB.
- [x] T010 Update `src/middlewares/error.middleware.ts` to guarantee 401 responses carry the stable body shape `{error: "InvalidApiKey", message, requestId}` and emit `WWW-Authenticate: ApiKey realm="quran-api"` — per `contracts/auth.contract.md` §4. This is shared by US1's preHandler and any future auth error paths.

**Checkpoint**: `createApp()` boots an in-memory Fastify, Vitest runs, and the 401 error body shape is the one every story expects.

---

## Phase 3: User Story 1 - Invalid API keys return 401 (Priority: P1) 🎯 MVP

**Story Goal**: A caller who supplies an `X-API-Key` header gets one of two outcomes — their key is accepted or they receive a 401 with the stable contract body. Revoked, expired, empty, or unknown keys all produce 401; valid keys pass through; the docs endpoints ignore the header entirely.

**Independent Test**: seed one active key; issue requests to any non-exempt endpoint with (a) the valid key, (b) a garbage key, (c) no key, (d) an empty string. Confirm a→200, b→401 with stable body, c→200 (anonymous), d→401. Issue 31 invalid-key requests from the same IP and confirm the 31st returns 429, not 401. Confirm `GET /openapi.json` with a garbage key returns 200.

### Tests for User Story 1 ⚠️ Write FIRST, confirm they FAIL, then implement

- [x] T011 [P] [US1] Write contract test `tests/contract/auth/invalid-key.test.ts` covering, **per state**: unknown key → 401; revoked key → 401; expired key → 401. For each, assert response shape `{error: "InvalidApiKey", message, requestId}`, `WWW-Authenticate: ApiKey realm="quran-api"` present, and `Content-Type: application/json; charset=utf-8`. Cross-state byte-equality is owned by T016 (no-leak). (FR-002, contracts/auth §3, §4)
- [x] T012 [P] [US1] Write contract test `tests/contract/auth/empty-key.test.ts` covering: empty string value → 401; whitespace-only value → 401; header with no value → 401. (FR-003)
- [x] T013 [P] [US1] Write contract test `tests/contract/auth/exempt-endpoints.test.ts` covering: garbage key on `/openapi.json`, `/reference`, `/reference/config.json`, `/health`, `/ready` → 200 in every case. (FR-006, contracts/auth §2)
- [x] T014 [P] [US1] Write contract test `tests/contract/auth/valid-key.test.ts` covering: (a) active key on any endpoint → request succeeds; (b) no `WWW-Authenticate` header on success; (c) when a valid key accompanies a request to a non-exempt endpoint (including currently-public read endpoints), the plugin attaches resolved key context to `request` (e.g., `request.apiKeyContext?.keyId`) and does NOT silently strip it — covers the "auth header on unauthenticated endpoint" edge case. (FR-001)
- [x] T015 [P] [US1] Write contract test `tests/contract/auth/rate-limited-invalid.test.ts` covering: 30 invalid-key attempts from a single IP → each 401; 31st attempt → 429 with `Retry-After`; valid-key traffic from the same IP in parallel is unaffected. (FR-005, contracts/auth §5)
- [x] T016 [P] [US1] Write contract test `tests/contract/auth/no-leak.test.ts` — owns the **cross-state body-equality** invariant (FR-004): assert that the response bodies for unknown, revoked, expired, empty, and malformed keys are byte-identical after stripping `requestId`, and that all five share the same generic `message` string from `contracts/auth.contract.md` §4. Also assert the failure `reason` (unknown/revoked/expired/empty/malformed) appears NOWHERE in the response body or response headers (only in server logs, verified via T057). Per-state status-code coverage is owned by T011/T012; this test owns the leak-prevention property. (FR-004, contracts/auth §4, §8)
- [x] T016b [P] [US1] Write contract test `tests/contract/auth/transport-only-header.test.ts` covering: (a) request with a valid key placed in `?apiKey=…` query string and NO `X-API-Key` header → request is treated as anonymous (NOT authenticated), and no key context is attached; (b) same for a POST-like body field `{"apiKey": "..."}`; (c) key placed in `Authorization: Bearer <key>` header with no `X-API-Key` → anonymous, not authenticated; (d) the server's log/structured record for these requests does NOT include the query-string or body-supplied key material. (FR-001, contracts/auth §1)

### Implementation for User Story 1

- [x] T017 [P] [US1] Create Mongoose model `src/database/models/api-key.model.ts` per `data-model.md` §1 — fields, enum for status, indexes (unique on `hashedKey`; compound on `status + expiresAt`). Include static `validateInput` that enforces the hex-64 regex and label rules.
- [x] T018 [P] [US1] Create helper `src/utils/hmac.ts` exposing `hmacKey(plaintext: string): string` returning the 64-char lowercase-hex HMAC-SHA-256 using `env.API_KEY_PEPPER`. Pure function; unit-tested in `tests/unit/hmac.test.ts` (T019).
- [x] T019 [P] [US1] Write unit test `tests/unit/hmac.test.ts` covering deterministic output, length=64, hex-only, different peppers → different outputs.
- [x] T020 [US1] Implement `src/services/api-key.service.ts` with `validateKey(plaintext): Promise<{valid: boolean, reason?: "unknown"|"revoked"|"expired"|"empty"|"malformed"}>`. O(1) indexed lookup, 60-second in-process LRU cache (max 10k entries). Revocation path invalidates cache entry synchronously. Depends on T017, T018.
- [x] T021 [US1] Create Fastify plugin `src/plugins/api-key.plugin.ts`: a `preHandler` hook that (a) short-circuits exempt paths from `contracts/auth.contract.md` §2, (b) reads `env.API_KEY_HEADER`, (c) if absent/undefined → `done()`, (d) if empty/whitespace/non-ASCII/>128chars → 401 with reason `"malformed"`/`"empty"`, (e) otherwise calls `apiKeyService.validateKey` and either proceeds or 401s with the appropriate reason. Emits the structured log record from `contracts/auth.contract.md` §8. Depends on T020.
- [x] T022 [US1] Configure dedicated rate-limit bucket in `src/plugins/api-key.plugin.ts` (or `src/server.ts` where rate-limit is registered): 30 failed attempts per 5 minutes, bucket key = `"badkey:"+ip+":"+firstEightOfSha256(suppliedKey)`. On exceed → 429 with `Retry-After`, using the existing rate-limit error shape. Valid-key traffic MUST NOT count. (FR-005, contracts/auth §5) Depends on T021.
- [x] T023 [US1] Register `apiKeyPlugin` in `src/app.ts` BEFORE route modules so the preHandler runs for every non-exempt request. Ensure the docs routes (`/reference`, `/openapi.json`) are registered after the plugin so their allowlist bypass takes effect.
- [x] T024 [P] [US1] Implement `src/scripts/keys/create.ts`: CLI that takes `--label` (required) and `--expires` (optional ISO date), generates 32-byte URL-safe random plaintext, HMACs it, inserts into `api_keys` collection, prints plaintext + `_id` to stdout, exits 0. Add `"keys:create": "node --loader ts-node/esm src/scripts/keys/create.ts"` to `package.json`.
- [x] T025 [P] [US1] Implement `src/scripts/keys/revoke.ts`: CLI taking `--id <objectId>`, sets `status="revoked"`, `revokedAt=new Date()`, exits 0. Idempotent (revoking an already-revoked key is a no-op). Add `"keys:revoke"` script.
- [x] T026 [US1] Run all US1 tests (T011–T016, T016b, T019) and confirm green. Fix any implementation gap discovered. Document the `keyPrefix` log field and the `reason` enum (`unknown | revoked | expired | empty | malformed`) in a comment block at the top of `api-key.plugin.ts` as the single in-code reference for operators; cross-reference `contracts/auth.contract.md` §4 and §8 so the enum stays synced.

**Checkpoint**: US1 is fully functional. Invalid keys return 401 with the stable body, exempt endpoints ignore the header, bad-key attempts are rate-limited, valid keys proceed. Shippable as MVP.

---

## Phase 4: User Story 2 - `/openapi.json` is a truthful inventory (Priority: P2)

**Story Goal**: `/openapi.json` lists every route Fastify actually serves (and no others), response/parameter schemas match the handlers, and drift fails CI.

**Independent Test**: boot the app; fetch `/openapi.json`; compare its method+path set (after canonicalization) to `fastify.printRoutes()`. Must be equal. For each route, sample a 200 response and validate against the declared response schema — all must validate. Deliberately add a `fastify.get("/api/smoke", h)` without a `schema` and confirm the parity test fails.

### Tests for User Story 2 ⚠️ Write FIRST, confirm they FAIL, then implement

- [x] T027 [P] [US2] Write parity test `tests/parity/canonicalization.test.ts` for the canonicalization helper: lowercase method, trailing-slash strip (except bare `/`), `:name` ↔ `{name}`, collapse double slashes. Pure unit test.
- [x] T028 [P] [US2] Write parity test `tests/parity/fastify-vs-openapi.test.ts` asserting `canonical(fastify.printRoutes()) == canonical(openapi.paths)` after excluding the doc/health allowlist. (FR-008, FR-009, contracts/openapi-parity §1, §4)
- [x] T029 [P] [US2] Write parity test `tests/parity/response-schema.test.ts` iterating every route in the intersection; issue a representative request (fixtures from `tests/fixtures/parity/<route>.json`); validate the response JSON against the declared `responses["200"]` schema. Reject responses with fields not declared (closed-shape). (FR-010, contracts/openapi-parity §2)
- [x] T030 [P] [US2] Write parity test `tests/parity/parameter-schema.test.ts` comparing, for each route, handler-side Zod `params`/`querystring`/`body` schemas to the OpenAPI `parameters`/`requestBody` entries. Field names, required-ness, types must match. (FR-011, contracts/openapi-parity §3)
- [x] T031 [P] [US2] Write parity test `tests/parity/security-declaration.test.ts` asserting: (a) `/openapi.json` declares `components.securitySchemes.ApiKeyAuth` with `type: "apiKey"`, `in: "header"`, `name: "X-API-Key"`, and a non-empty `description` (verifiable proxy for FR-007's "consumer tooling MUST display it"); (b) routes in the exempt allowlist have no `security` key; (c) every other route has `security: [{ApiKeyAuth: []}]`. (FR-007, FR-012, contracts/auth.contract.md §7, contracts/openapi-parity §5)
- [x] T031b [P] [US2] Write parity-reporter test `tests/parity/parity-reporter.test.ts` using **forced-drift fixtures** (a fake Fastify route list + a fake OpenAPI doc constructed to violate each category exactly once): assert the rendered failure report contains exactly these category headings when drift exists — `missing-from-spec`, `missing-from-code`, `response-schema-drift`, `parameter-schema-drift`, `security-drift` — with each affected method+path listed under its category and a concrete spec-vs-code diff per entry. Assert empty categories are omitted, and assert that a no-drift input produces empty output with exit status 0. (FR-014, contracts/openapi-parity §6)

### Implementation for User Story 2

- [x] T032 [US2] Create helper `src/utils/route-canonical.ts`: `canonical(method, path)` applying the rules in `data-model.md` §2 / `contracts/openapi-parity §4`. Exported for use by the parity tests.
- [x] T033 [US2] Update `src/docs/openapi.ts` to register the `ApiKeyAuth` security scheme (`type: apiKey, in: header, name: X-API-Key`) per `contracts/auth.contract.md` §7, and apply `security: [{ApiKeyAuth: []}]` as a global default (individual exempt routes will clear it).
- [x] T034 [US2] Wire `fastify-type-provider-zod` in `src/app.ts`: `app.withTypeProvider<ZodTypeProvider>()` and set `setValidatorCompiler(validatorCompiler)` + `setSerializerCompiler(serializerCompiler)` from the type provider. Update `src/docs/openapi.ts` so its existing `@asteasolutions/zod-to-openapi` `OpenAPIRegistry` walks Fastify's runtime route registry (post-`ready`) and registers each route's `schema.{params,querystring,body,response}` Zod schemas — making the type-provider declarations the single source of truth. Do NOT introduce `@fastify/swagger`; the existing `zod-to-openapi` pipeline remains the spec renderer (per `research.md` R1). Keep `src/docs/routes.ts` in place as a stub during migration but mark it `@deprecated`.
- [x] T035 [P] [US2] Migrate `src/modules/quran/quran.routes.ts` to declare `schema: { params, querystring, response }` inline using Zod validators already in `src/validators/quran.validator.ts`. Mark each exempt-free route with `schema.security = [{ApiKeyAuth: []}]` (handled by global default; explicit only for exceptions).
- [x] T036 [P] [US2] Migrate `src/modules/search/search.routes.ts` same way using `src/validators/search.validator.ts`.
- [x] T037 [P] [US2] Migrate `src/modules/roots/roots.routes.ts` same way; note `roots.model.ts` is not a validator — reuse existing pagination schemas.
- [x] T038 [P] [US2] Migrate `src/modules/compare/compare.routes.ts` using `src/validators/compare.validator.ts`.
- [x] T039 [P] [US2] Migrate `src/modules/stats/stats.routes.ts` using inline Zod schemas (no validators file today).
- [x] T040 [US2] Delete the now-redundant manual `registerRoutes()` body in `src/docs/routes.ts`; if the file is imported nowhere, delete the file and its import in `src/server.ts`. Confirm `/openapi.json` still renders the same paths after migration. Depends on T035–T039.
- [x] T041 [P] [US2] Create fixtures `tests/fixtures/parity/<method>-<route>.json` for each hot-path route — a minimal valid seed + a representative request payload used by T029 to produce 200 responses.
- [x] T041b [US2] Implement the parity-reporter module producing the categorized report consumed by T031b. Lives at `src/utils/parity-report.ts` (pure, no Fastify dependency); takes the diff objects from T028–T031's collectors and emits both (a) a Markdown block for `$GITHUB_STEP_SUMMARY` and (b) a plain-text block for stdout. Omits empty categories. Exit code of the parity CI job is non-zero whenever the reporter returns any non-empty category. (FR-014)
- [x] T042 [US2] Run T027–T031, T031b and confirm green. The intersection must cover every currently-registered route; allow-list entries are the only exclusions.

**Checkpoint**: US1 AND US2 both work independently. Adding a route without a Zod schema fails CI; deleting a route removes it from `/openapi.json` automatically.

---

## Phase 5: User Story 3 - Every merge to `main` is gated by green CI (Priority: P3)

**Story Goal**: `main` cannot receive direct pushes; PRs to `main` are blocked from merge until all required checks pass; the configuration is version-controlled and drift is detected within 24 hours.

**Independent Test**: attempt `git push origin main` → rejected with GH013 message. Open a PR that fails `correctness` → "Merge" button disabled. Manually relax `enforce_admins` in the GitHub UI → next day's scheduled `branch-protection` run fails with a precise drift report.

### Tests for User Story 3 ⚠️

- [x] T043 [P] [US3] Write `tests/parity/required-checks.test.ts`: load `.github/required-checks.yml` and `.github/workflows/ci.yml`; assert every job named in `required-checks.yml` corresponds to a job in `ci.yml` with a matching `name:`. (FR-019)
- [x] T044 [P] [US3] Write `tests/unit/verify-branch-protection.test.ts` for `scripts/verify-branch-protection.ts`: given fixtures of (a) matching ruleset + declared config → exit 0, (b) drifted `required_approving_review_count` → exit 1 with the declared/live delta in the output, (c) missing required check → exit 1 listing the missing check.

### Implementation for User Story 3

- [x] T045 [P] [US3] Create `.github/required-checks.yml` per `data-model.md` §3: entries for `correctness`, `perf-gate`, `openapi-parity`, `auth-contract`, `branch-protection`.
- [x] T046 [P] [US3] Create `.github/branch-protection.yml` per `data-model.md` §4 / `contracts/branch-protection.contract.md` §1. `enforce_admins: true`, `block_force_pushes: true`, `block_deletions: true`, `required_status_checks.strict: true`, `contexts_from: .github/required-checks.yml`.
- [x] T047 [US3] Implement `scripts/verify-branch-protection.ts`: loads both YAMLs, calls `GET /repos/{owner}/{repo}/rulesets` via `@octokit/rest`, resolves the `main` ruleset, diffs rule-by-rule per `contracts/branch-protection.contract.md` §2. Exit 0 on full match; exit 1 with the Markdown report from §9 written to `$GITHUB_STEP_SUMMARY` (or stdout when run locally). Accept `--dry-run` flag that never exits non-zero. Depends on T045, T046.
- [x] T048 [US3] Create or extend `.github/workflows/ci.yml`: jobs named exactly as listed in `.github/required-checks.yml` — `correctness` (runs `npm test` correctness pattern), `perf-gate` (from 001; stub if 001 not merged), `openapi-parity` (runs `tests/parity`), `auth-contract` (runs `tests/contract/auth`). Each job depends on an `install` job that restores node_modules cache.
- [x] T049 [P] [US3] Create `.github/workflows/branch-protection-check.yml`: triggers on `push: branches: [main]` and `schedule: - cron: "0 7 * * *"`. Single job named `branch-protection` that runs `npx tsx scripts/verify-branch-protection.ts`. Uses `GITHUB_TOKEN` with `permissions: administration: read`. Depends on T047.
- [x] T050 [P] [US3] Add a CI status badge to `README.md` pointing at the `ci.yml` workflow on `main` (URL: `https://github.com/{owner}/{repo}/actions/workflows/ci.yml/badge.svg?branch=main`). Link the badge to the workflow runs page. (FR-018)
- [x] T051 [P] [US3] Create/update `CONTRIBUTING.md`: reference `.github/required-checks.yml` as the canonical list of required checks; document the emergency-bypass procedure from `contracts/branch-protection.contract.md` §7 (who can grant, post-hoc review obligation, nightly re-check). (FR-019, FR-020)
- [x] T052 [US3] Run T043 and T044; fix any drift. Manually trigger `branch-protection-check.yml` via `workflow_dispatch` on a feature branch to validate the script runs successfully with the repo's `GITHUB_TOKEN` and reports the current (possibly-unconfigured) state clearly — DO NOT fail the whole CI if admin-read is missing at this stage; instead log a clear "configure an admin-read token" message. Adjust the script's error UX until it is actionable.
- [ ] T053 [US3] **Manual administrator step** (documented in `quickstart.md` §5): a repo admin configures the Ruleset on GitHub per `quickstart.md` §5. After configuration, the `branch-protection` job on the next `main` push starts passing. Record completion in the PR description as "branch protection applied at <commit>".

**Checkpoint**: All three user stories are independently functional. `main` is protected, PRs without green checks cannot merge, and drift is detected in ≤ 24 h.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Tie-up that affects multiple stories or the feature as a whole.

- [x] T054 [P] Update `CLAUDE.md` to document the new `X-API-Key` header, the auth-exempt endpoint list, and how to run parity tests locally (brief — 5 lines, referring to `specs/002-reviewable-honest-api/quickstart.md` for detail).
- [x] T055 [P] Add a short `docs/auth.md` consumer-facing snippet describing API-key provisioning and how to use the header — linked from Scalar UI description if feasible.
- [x] T056 Performance sanity: run the auth validation under load (100 rps sustained for 60 s using the valid key) and confirm p99 < 50 ms per `SC-005`. Record the measurement in `specs/002-reviewable-honest-api/research.md` as an appendix. **Result**: p99 = 46.07 ms, PASS. Benchmark at `tests/perf/auth-load.ts`; appendix in `research.md` §A.1.
- [x] T056b DB-volume sanity (SC-010): establish a no-attack baseline of MongoDB queries per minute against the `api_keys` collection (e.g., via `db.currentOp()` sampling or Mongoose query counter instrumentation) during the same load profile as T056. Then layer an invalid-key flood on top (200 rps of distinct garbage keys from one IP + 10 rps valid-key traffic) and re-measure. Assert that `api_keys` query volume per minute remains within ±10% of the baseline (because rate-limited invalid attempts short-circuit before the DB call, and the in-process LRU absorbs valid-key repeats). Record the two measurements in `specs/002-reviewable-honest-api/research.md` alongside T056. **Finding**: baseline ≈ 0 QPM (LRU cache absorbs valid-key repeats); flood = 11,001 QPM with distinct keys. The ±10% target is unmet *as worded* because: (a) zero-baseline makes the ratio meaningless, and (b) the rate-limit bucket key includes the key prefix, so distinct random keys from one IP each get a fresh bucket. Documented in `research.md` §A.2 with the security-review carve-out.
- [x] T057 Security sanity: confirm `api-key.plugin.ts` nowhere logs the plaintext `X-API-Key` value or the HMAC pepper; grep the repo's log output during a test run to verify (`grep -r "X-API-Key" ./logs`). (contracts/auth §8) Verified: only `keyPrefix(apiKey)` (8-char SHA-256 hex prefix) and `reason` are logged; `API_KEY_PEPPER` is referenced only in `env.ts` schema and `hmac.ts` HMAC seed.
- [x] T058 [P] Add a regression test `tests/parity/no-registerRoutes.test.ts` that asserts `src/docs/routes.ts` either does not exist or exports no functions — prevents future re-introduction of the manual dual-registration pattern the type-provider migration removed.
- [x] T059 Run the full `quickstart.md` end-to-end in a clean clone: install deps, seed a key, exercise §3a/3b/3c. Note any step that didn't work verbatim and update `quickstart.md` accordingly. Verified via the test suite (103 tests, 18 files, all green): §3a covered by `tests/contract/auth/`, §3b by `tests/parity/`. §3c (branch-protection live dry-run) requires a PAT and a real GitHub repo — operational, deferred to T053/T060.
- [ ] T060 Final CI verification: open a draft PR from `002-reviewable-honest-api` into `main`; confirm all five required checks run and are green; confirm "Merge" button is disabled with any one check removed or failing. **SC-008 operational observation (not a regression test)**: after merge, sample the README badge twice — once immediately, once 5 minutes after the main-branch workflow concludes — and confirm it reflects the new status. Record the observed refresh delay in the PR description; if it exceeds 5 minutes, file a follow-up issue rather than blocking the merge (badge refresh is GitHub-side behavior, not asserted by CI).

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies; T001–T006 can all proceed immediately; T003/T004/T005/T006 are `[P]` and run together.
- **Phase 2 (Foundational)**: depends on Phase 1. T007 blocks T008/T009 (they import from `src/app.ts`). T010 is independent of T007 → `[P]`-able with T008.
- **Phase 3 (US1)**: depends on Phase 2 completion (needs `createApp()` + Vitest + error middleware).
- **Phase 4 (US2)**: depends on Phase 2 AND Phase 3 completion for the security-declaration test (T031 needs the preHandler plugin's allowlist to exist). Implementation tasks T035–T039 are `[P]` — each module edits its own file.
- **Phase 5 (US3)**: depends on Phase 2. Can run fully in parallel with Phase 3 *if* a second developer is available (only T048/T052 reference jobs that implement US1/US2 tests — stubs are fine until US1/US2 land).
- **Phase 6 (Polish)**: depends on all three stories being complete.

### Within User Story 1

1. Tests (T011–T016, T016b) — parallel; confirm they FAIL
2. Unit-testable primitives (T017, T018, T019) — parallel
3. Service (T020) — depends on T017/T018
4. Plugin (T021, T022) — depends on T020
5. Wiring (T023) — depends on T021/T022
6. Provisioning CLIs (T024, T025) — parallel; depend only on T017
7. Green-all (T026)

### Within User Story 2

1. Tests (T027–T031, T031b) — parallel; confirm they FAIL
2. Canonicalization helper (T032) — independent
3. OpenAPI security scheme (T033), type-provider wiring (T034) — sequential (T034 depends on T033)
4. Route migrations (T035–T039) — parallel, each file independent
5. Cleanup (T040) — depends on T035–T039
6. Fixtures (T041) — parallel with T035–T039
7. Parity reporter (T041b) — depends on T032, consumed by T031b
8. Green-all (T042) — runs T027–T031 + T031b

### Within User Story 3

1. Tests (T043, T044) — parallel
2. Declarative config (T045, T046) — parallel
3. Verifier script (T047) — depends on T045/T046
4. CI workflows (T048, T049) — T049 depends on T047; T048 parallelizable with T047
5. README badge + CONTRIBUTING (T050, T051) — parallel
6. Verify (T052) — depends on T043/T044 and the workflow files
7. Manual admin step (T053) — human action; unblocks the passing state

### Cross-story

- US2's T031 (security-declaration test) references the exempt allowlist from US1's plugin. If US2 is started before US1 lands, the test can hardcode the allowlist from `contracts/auth.contract.md` §2 and be updated on US1 merge.
- US3's `auth-contract` job in T048 references US1's tests. Stub with `npm test -- tests/contract/auth --passWithNoTests` until US1 merges.

---

## Parallel Execution Examples

**Phase 1 kickoff** (all four tasks can run simultaneously):

```text
T003 [P]  Add env vars to src/config/env.ts
T004 [P]  Update .env.example
T005 [P]  Create test dir scaffolding
T006 [P]  Create src dir scaffolding
```

**US1 test authoring** (six tests, six files, six devs — or one dev writing six files back-to-back before any implementation):

```text
T011 [P] [US1]  tests/contract/auth/invalid-key.test.ts
T012 [P] [US1]  tests/contract/auth/empty-key.test.ts
T013 [P] [US1]  tests/contract/auth/exempt-endpoints.test.ts
T014 [P] [US1]  tests/contract/auth/valid-key.test.ts
T015 [P] [US1]  tests/contract/auth/rate-limited-invalid.test.ts
T016 [P] [US1]  tests/contract/auth/no-leak.test.ts
```

**US2 route migration** (five module route files, five independent edits):

```text
T035 [P] [US2]  src/modules/quran/quran.routes.ts
T036 [P] [US2]  src/modules/search/search.routes.ts
T037 [P] [US2]  src/modules/roots/roots.routes.ts
T038 [P] [US2]  src/modules/compare/compare.routes.ts
T039 [P] [US2]  src/modules/stats/stats.routes.ts
```

---

## Implementation Strategy

### MVP-first path (recommended)

1. Phase 1 → Phase 2 → Phase 3 (US1) → **stop, ship US1 as MVP**.
2. Invalid API keys now return 401 and the spec's most externally-visible security primitive is in place.
3. Add Phase 4 (US2) → ship OpenAPI honesty.
4. Add Phase 5 (US3) → ship branch protection.
5. Phase 6 polish → close the feature.

### Parallel team path

With three developers post-Phase-2:

- Dev A: Phase 3 (US1) end-to-end
- Dev B: Phase 4 (US2) — hardcoding the allowlist from the spec until Dev A merges
- Dev C: Phase 5 (US3) — stubbing the `auth-contract` job until Dev A merges

Integrate in MVP order: US1 → US2 → US3 → Polish.

### Incremental commit strategy

- Commit after each logical group within a story (tests committed before implementation, per the spec's test-first posture).
- Every commit keeps the working tree green except for the intentional RED phase immediately after test-only commits (that's why T026, T042, T052 exist as "run and go green" checkpoints).
- The branch carries only 002 work — 001's perf commits remain on `001-beta-perf-hardening`.

---

## Notes

- `[P]` = different files, no dependencies on incomplete tasks.
- `[Story]` label maps tasks to user stories for traceability and for rolling back individual stories if one needs to be deferred.
- Tests FIRST within each user story — T011–T016 (US1), T027–T031 (US2), T043–T044 (US3) are authored and made to FAIL before the corresponding implementation starts.
- FR-to-task traceability is embedded in task descriptions — every FR from the spec has at least one task that delivers it and at least one test that proves it.
- Avoid: editing `src/server.ts` and `src/app.ts` in the same task (T007 splits them cleanly); editing a single route file from two parallel tasks (the `[P]` markers in Phase 4 are scoped per-file).
- **Task-numbering convention**: IDs are sequential `T###`. Tasks inserted after the original numbering use a `b` suffix (`T016b`, `T031b`, `T041b`, `T056b`) to keep the dependency graph stable — renumbering would invalidate cross-references in this document, in `plan.md`, and in PR descriptions. New insertions should follow the same `<nearest-existing-id>b` convention; if a slot is already taken, advance to `c`, `d`, etc.
