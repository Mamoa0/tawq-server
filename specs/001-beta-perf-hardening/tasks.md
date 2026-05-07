---

description: "Task list for Beta Performance Hardening & Regression Safety Net"
---

# Tasks: Beta Performance Hardening & Regression Safety Net

**Input**: Design documents from `/specs/001-beta-perf-hardening/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Explicitly requested — correctness test suite (FR-008) and performance regression gate (FR-010).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths assume repository root as base

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install Vitest, configure test workspace, extract app factory, and add npm scripts

- [X] T001 Install Vitest, @vitest/coverage-v8, and mongodb-memory-server as dev dependencies in package.json
- [X] T002 [P] Create Vitest root config in vitest.config.ts with base TypeScript paths and coverage settings
- [X] T003 [P] Create Vitest workspace definition as inline projects in vitest.config.ts referencing correctness and perf projects
- [X] T004 [P] Create Vitest correctness project config (inline in vitest.config.ts) with mongodb-memory-server globalSetup and test isolation settings
- [X] T005 [P] Create Vitest perf project config (inline in vitest.config.ts) with longer timeouts and sequential test execution
- [X] T006 Extract createApp() factory from src/server.ts into src/app.ts — move Fastify plugin registration, CORS, helmet, rate-limit, and route registration into createApp(); leave only DB connection and listen() in src/server.ts
- [X] T007 [P] Create test app factory helper in tests/helpers/app.ts that calls createApp() with test config, sets logger:false, overrides rate-limit max, and exposes app.inject()
- [X] T008 [P] Create test global setup/teardown in tests/helpers/setup.ts that starts mongodb-memory-server beforeAll and stops it afterAll, exposing MONGO_URI for test config
- [X] T009 [P] Add npm test scripts to package.json: test (runs all), test:correctness (correctness only), test:perf (perf gate only), test:perf:update (update baselines), test:watch (correctness watch mode), test:coverage (coverage report)

**Checkpoint**: `npm run test:correctness` should discover 0 tests without errors; `createApp()` should be importable from `src/app.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented — indexes, utilities, plugins, and test fixtures

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T010 [P] Add MongoDB compound index `{ revelation_place: 1, revelation_order: 1 }` to surah.model.ts, compound indexes `{ juz: 1, surah: 1, ayah: 1 }` and `{ hizb: 1, surah: 1, ayah: 1 }` and text index `{ translation: "text" }` to verse.model.ts, and compound indexes `{ LEM: 1, ROOT: 1 }` and `{ POS: 1, ROOT: 1 }` to token.model.ts — all via schema.index() calls
- [X] T050 Document the official hot-path endpoint set in src/config/hotpaths.ts — export an array of hot-path endpoint identifiers with category (list/detail), slow threshold, and traffic share per data-model.md; this constitutes the FR-001 performance scope definition
- [X] T011 [P] Create singleFlight request deduplication utility in src/utils/singleFlight.ts
- [X] T012 [P] Create observeDb query tracking utility in src/utils/observe.ts
- [X] T013 [P] Create request logger Fastify plugin in src/plugins/request-logger.ts
- [X] T014 Create test fixture dataset and seeder in tests/fixtures/seed.ts — curated static dataset of 3 surahs (Al-Fatiha, Al-Ikhlas, first 10 verses of Al-Baqarah), ~25 verses, ~250 words, ~350 tokens, and associated roots; exports seedDatabase() and clearDatabase() functions using mongodb-memory-server connection
- [X] T015 Register request-logger plugin inside createApp() in src/app.ts — add request-logger plugin registration after other plugins in createApp(); src/server.ts was already updated by T006 to call createApp()
- [X] T047 Record "before" baseline measurements for all hot-path endpoints using createApp() and observeDb() — run each hot-path endpoint against seeded test data, record pre-optimization dbQueryCount and latency per endpoint into tests/perf/baselines/before-hardening.json; this establishes the FR-002 baseline for SC-004 (40% DB round-trip reduction claim)


**Checkpoint**: MongoDB indexes are defined; singleFlight and observeDb utilities are importable; request-logger plugin registers without errors; test fixtures seed cleanly; "before" baselines are recorded for later comparison

---

## Phase 3: User Story 1 — Hot-path performance stays responsive (Priority: P1) 🎯 MVP

**Goal**: Reduce per-request database work on hot-path endpoints by eliminating N+1 queries, adding missing indexes, parallelizing sequential calls, deduplicating concurrent reads, capping response sizes, and enforcing projections

**Independent Test**: Run a load profile representative of beta traffic against a full dataset. Confirm p95 latency targets (list < 300ms, detail < 150ms) and that concurrent identical requests share DB work without duplication

### Implementation for User Story 1

- [X] T016 [US1] Optimize src/modules/quran/quran.service.ts — parallelize getAyahWithWords() and getAyahAnalysis() with Promise.all; add exclusion projections to getAllSurahs() (exclude _id, top_roots, createdAt, updatedAt), getVersesByJuz() and getVersesByHizb() (exclude _id, createdAt, updatedAt), getAyahAnalysis() (exclude STEM, SUB, INC, RES, CIRC, REM, SUP, createdAt, updatedAt); wrap getAyahWithWords, getAyahAnalysis, getWordDetails (defined in quran.service.ts), getVersesByJuz, getVersesByHizb with singleFlight — note: getSajdaVerses is also in quran.service.ts and should be wrapped here
- [X] T017 [P] [US1] Add observeDb tracking to quran controller in src/modules/quran/quran.controller.ts — wrap service calls for hot-path endpoints (getAyahWithWords, getAyahAnalysis, getWordDetails, getSurahByNumber, getSurahs, getVersesByJuz, getVersesByHizb) with observeDb()
- [X] T018 [P] [US1] Optimize src/modules/roots/roots.service.ts — parallelize getRoot() (findOne + aggregate with Promise.all) and getRootNetwork() (aggregate + count with Promise.all); wrap getRoot and getRootNetwork with singleFlight — note: getSajdaVerses is in quran.service.ts, wrapped by T016
- [X] T019 [P] [US1] Add observeDb tracking to roots routes in src/modules/roots/roots.routes.ts — since roots module has no controller, wrap service calls in route handlers with observeDb() for getRoot and getRootNetwork; note: getSajdaVerses is in quran module and tracked by T017
- [X] T020 [US1] Optimize src/modules/search/search.service.ts — replace searchTokens self-join ($lookup into tokens) with $lookup into verses collection matching on {surah, ayah} projecting only arabic field; add pre-$facet projection to searchTokens limiting to {surah, ayah, word, segment, form, ROOT, LEM, POS, tag}; add $text search path for searchVerses() using verses.text index with $regex fallback for exact/phrase matching; cap search limit max to 50
- [X] T021 [P] [US1] Add observeDb tracking to search controller in src/modules/search/search.controller.ts — wrap service calls for searchTokens, searchLemmas, searchVerses, getDistinctLemmas with observeDb()
- [X] T022 [P] [US1] Reduce search token limit max from 100 to 50 in src/validators/search.validator.ts — update Zod schema for limit parameter max to 50
- [X] T023 [P] [US1] Add max refs cap (50) on getVersesBatch in src/validators/quran.validator.ts — add Zod validation that refs array length cannot exceed 50, return 400 Bad Request if exceeded
- [X] T024 [P] [US1] Add observeDb tracking to compare controller in src/modules/compare/compare.controller.ts — wrap service calls with observeDb()

**Checkpoint**: All hot-path endpoints return correct responses; DB round-trips measurably reduced; concurrent identical requests share a single DB flight; search limit capped at 50; batch refs capped at 50

---

## Phase 4: User Story 2 — Automated regression safety net catches breakage before it ships (Priority: P1)

**Goal**: Provide an automated correctness test suite and performance regression gate that runs on every PR and blocks merge on failure

**Independent Test**: Intentionally introduce a known-bad change (remove an index hint, break a Buckwalter edge case) and confirm the safety net fails the build

### Tests for User Story 2

- [X] T025 [P] [US2] Create correctness tests for surah endpoints in tests/correctness/quran/surah.test.ts — test GET /surahs (paginated, sorted), GET /surahs/:number (valid, 404, 400), GET /surahs/:number/page/:page (valid, out-of-range, 404)
- [X] T026 [P] [US2] Create correctness tests for verse/word/token endpoints in tests/correctness/quran/verse.test.ts — test GET /surah/:s/ayah/:a (200, 404), GET /surah/:s/ayah/:a/word/:w (200, 404), GET /page/:page (200, sorted)
- [X] T027 [P] [US2] Create correctness tests for search endpoints in tests/correctness/search/search.test.ts — test GET /search with POS filter (morphological filter edge cases: N, V, PN with and without ROOT; empty filter returning paginated results), limit cap at 50 (400 if exceeded), GET /search/lemmas, GET /search/lemmas/autocomplete, pagination
- [X] T028 [P] [US2] Create correctness tests for roots endpoints in tests/correctness/roots/roots.test.ts — test GET /roots (paginated), GET /roots/:root (200, 404), GET /roots/:root/occurrences
- [X] T029 [P] [US2] Create correctness tests for compare endpoints in tests/correctness/compare/compare.test.ts — test GET /compare/surahs, GET /compare/roots with valid and edge-case inputs
- [X] T030 [P] [US2] Create correctness tests for stats endpoints in tests/correctness/stats/stats.test.ts — test global stats response shape and field completeness
- [X] T031 [P] [US2] Create Buckwalter conversion edge-case tests in tests/correctness/utils/buckwalter.test.ts — test round-trip identity, tashkeel preservation, empty input, unknown char passthrough, LRU cache correctness per contracts/buckwalter-contract.md
- [X] T032 [P] [US2] Create pagination boundary correctness tests in tests/correctness/pagination.test.ts — test page=1, page=totalPages, page=0 (400), page=999999 (empty data, accurate totalCount), limit=0 (400)
- [X] T048 [P] [US2] Create rate-limit skip verification test in tests/correctness/rate-limit.test.ts — verify that rate-limited requests (429 responses) do not trigger database queries, confirming FR-007 is preserved after hardening changes
- [X] T033 [US2] Create DB query tracker test helper in tests/helpers/query-tracker.ts — uses MongoDB driver commandSucceeded events to count find, aggregate, countDocuments, distinct operations per test scenario
- [X] T034 [US2] Create performance gate comparison logic and report generator in tests/perf/gate.ts — load baselines.json, compare observed P50/P95/dbQueries against baselines using 25% relative tolerance on latency with 50ms absolute floor and +1 query tolerance per spec.md clarified thresholds, generate Markdown report with PASS/FAIL per endpoint
- [X] T035 [US2] Create perf runner scenario orchestration in tests/perf/perf-runner.ts — 3 warmup runs (discarded), 5 measured runs, report median, sequential execution, integration with query-tracker helper
- [X] T036 [P] [US2] Create quran hot-path perf scenarios in tests/perf/scenarios/quran-hotpaths.perf.ts — scenarios for GET /surahs, GET /surahs/:number, GET /surah/:s/ayah/:a, GET /surah/:s/ayah/:a/word/:w, GET /surahs/:number/page/:page, GET /page/:page, GET /juz/:juz, GET /hizb/:hizb
- [X] T037 [P] [US2] Create search hot-path perf scenarios in tests/perf/scenarios/search-hotpaths.perf.ts — scenarios for GET /search with various filters, GET /search/lemmas, GET /search/lemmas/autocomplete
- [X] T038 [P] [US2] Create roots hot-path perf scenarios in tests/perf/scenarios/roots-hotpaths.perf.ts — scenarios for GET /roots, GET /roots/:root, GET /roots/:root/occurrences
- [X] T049 [US2] Create cold-start performance scenario in tests/perf/scenarios/cold-start.perf.ts — measure first-request latency for each hot-path endpoint immediately after app.ready() without any prior requests, verify that p95 cold-start latency stays within 2× the warm p95 target per SC-005
- [X] T039 [US2] Create structural scaffold for tests/perf/baselines/baselines.json per contracts/perf-gate-contract.md schema — include all hot-path endpoint scenario keys with placeholder latency values (to be populated by running PERF_UPDATE_BASELINES=1 npm run test:perf after US1 hardening is complete; before-hardening baselines are recorded by T047)
- [X] T040 [US2] Create GitHub Actions CI workflow in .github/workflows/ci.yml — Node 22, mongo:7 service container, steps: type-check (tsc --noEmit), correctness tests (npm run test:correctness), performance gate (npm run test:perf), upload perf report artifact on failure

**Checkpoint**: `npm test` runs full suite in < 5 minutes; correctness tests cover all hot-path endpoint contracts; perf gate compares against baselines and produces Markdown report; CI passes on a clean branch

---

## Phase 5: User Story 3 — Ops can see hot-path health in production (Priority: P2)

**Goal**: Every hot-path request emits a structured log with endpoint, status, duration, and correlation ID; requests exceeding endpoint-specific slow thresholds emit a distinct warn-level signal

**Independent Test**: Generate a burst of requests exceeding 500ms on one endpoint; confirm the offending endpoint and query pattern are identifiable from log output within 5 minutes

### Implementation for User Story 3

- [X] T041 [US3] Verify request logger plugin emits structured per-request logs for all hot-path endpoints — exercise each hot-path endpoint and confirm log output contains reqId, endpoint (route pattern), status, durationMs, slowThreshold, slow (boolean) per contracts/api-contract.md section 6
- [X] T042 [US3] Verify slow-request signal fires correctly — make requests exceeding endpoint-specific slow thresholds defined in data-model.md slow-request threshold table; confirm warn level (40) and slow:true in log output
- [X] T043 [US3] Verify observeDb tracking reports dbQueryCount and dbTimeMs in structured logs — exercise endpoints wrapped with observeDb() and confirm dbQueryCount and dbTimeMs fields appear in their structured log lines; confirm endpoints NOT wrapped with observeDb omit these fields

**Checkpoint**: All hot-path endpoints emit structured logs; slow requests trigger warn level with slow:true; dbQueryCount and dbTimeMs appear for wrapped endpoints

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, edge-case checks, and documentation alignment

- [X] T044 [P] Validate quickstart.md instructions — seed test database, run all test commands (test, test:correctness, test:perf, test:perf:update), verify CI workflow runs locally with act or equivalent
- [X] T045 [P] Run end-to-end load verification against full dataset — confirm p95 latency targets per endpoint class (list < 300ms, detail < 150ms, p99 < 800ms) and error rate < 0.5%; confirm concurrent identical requests share DB work via singleFlight
- [X] T046 Final review — ensure no response shapes have changed, all indexes are defined in models, performance baselines are recorded, and test suite passes cleanly on CI

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (indexes, singleFlight, observeDb)
- **User Story 2 (Phase 4)**: Depends on Foundational (test helpers, fixtures) and ideally US1 (correctness tests validate hardening changes)
- **User Story 3 (Phase 5)**: Depends on Foundational (request logger) and US1 (observeDb integration) — verification only
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational (Phase 2) — No dependencies on other stories
- **US2 (P1)**: Can start after Foundational (Phase 2) — Correctness tests are more meaningful after US1 changes land but can be written against current API contracts first
- **US3 (P2)**: Can start after Foundational — Implementation is complete after Phases 2 + 3; Phase 5 is verification only

### Within Each User Story

- Phase 2: T047 (before-hardening baselines) must execute BEFORE any Phase 3 hardening; T050 (hotpath scope) should be completed before T013 and T036–T038
- Phase 3 (US1): T016 must complete before T017 (controller depends on service changes); T018/T019 can run in parallel with T016/T017; T020 should complete before T021
- Phase 4 (US2): T025–T032 and T048 can all run in parallel after T014 (fixtures) and T007/T008 (helpers); T033–T035 must complete before T036–T038 and T049; T039 must be created after first perf run; T040 can run after T002–T005
- Phase 5 (US3): T041–T043 are sequential verification tasks

### Parallel Opportunities

- **Phase 1**: T002, T003, T004, T005, T007, T008, T009 can all run in parallel
- **Phase 2**: T010, T011, T012, T013, T050 can run in parallel (different files, no dependencies); T047 depends on T007 and T014
- **Phase 3**: T017, T018, T019, T021, T022, T023, T024 can run in parallel with each other (different files); T016 and T020 are sequential within their files
- **Phase 4**: T025–T032 and T048 can all run in parallel (different test files); T036, T037, T038 can run in parallel; T049 can run in parallel with T036–T038

---

## Parallel Example: Phase 2 (Foundational)

```bash
# Launch all foundational utilities together (different files, no dependencies):
Task T010: "Add MongoDB indexes to surah.model.ts, verse.model.ts, token.model.ts"
Task T011: "Create singleFlight utility in src/utils/singleFlight.ts"
Task T012: "Create observeDb utility in src/utils/observe.ts"
Task T013: "Create request logger plugin in src/plugins/request-logger.ts"
Task T050: "Document hot-path endpoint set in src/config/hotpaths.ts"

# Then record before-hardening baselines (requires T007, T014):
Task T047: "Record 'before' baseline measurements for all hot-path endpoints"
```

## Parallel Example: Phase 3 (US1 — Service Optimization)

```bash
# Launch service optimizations in parallel (different modules):
Task T016: "Optimize quran.service.ts"
Task T018: "Optimize roots.service.ts"
Task T020: "Optimize search.service.ts"

# Then in parallel (different controller/route files):
Task T017: "Add observeDb to quran.controller.ts"
Task T019: "Add observeDb to roots.routes.ts"
Task T021: "Add observeDb to search.controller.ts"
Task T022: "Update search.validator.ts"
Task T023: "Update quran.validator.ts"
Task T024: "Add observeDb to compare.controller.ts"
```

## Parallel Example: Phase 4 (US2 — Correctness Tests)

```bash
# Launch all correctness tests in parallel (different test files):
Task T025: "Create tests/correctness/quran/surah.test.ts"
Task T026: "Create tests/correctness/quran/verse.test.ts"
Task T027: "Create tests/correctness/search/search.test.ts"
Task T028: "Create tests/correctness/roots/roots.test.ts"
Task T029: "Create tests/correctness/compare/compare.test.ts"
Task T030: "Create tests/correctness/stats/stats.test.ts"
Task T031: "Create tests/correctness/utils/buckwalter.test.ts"
Task T032: "Create tests/correctness/pagination.test.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 — Hot-path performance hardening
4. Complete Phase 4: User Story 2 — Regression safety net
5. **STOP and VALIDATE**: Run full test suite, perf gate, and load test
6. Deploy beta with confidence

### Incremental Delivery

1. Setup + Foundational → Test infrastructure ready
2. Add US1 → Hot-path endpoints performant and measured → Deploy/Demo
3. Add US2 → Safety net defends correctness and performance → Deploy/Demo
4. Verify US3 → Observability validated in staging → Deploy/Demo
5. Polish → Final review and CI validation → Launch

### Parallel Team Strategy

With multiple developers after Foundational phase:

1. **Developer A**: US1 — service optimizations (T016–T024)
2. **Developer B**: US2 — correctness tests (T025–T032)
3. **After both**: US2 — perf gate infrastructure (T033–T040)
4. **After US1+US2**: US3 verification (T041–T043)

---

## Notes

- **[P]** tasks touch different files with no shared dependencies — safe to parallelize
- **[Story]** labels map to spec.md user stories for traceability
- User Stories 1 and 2 are both P1 — US1 should complete before US2 correctness tests are finalized, but US2 infrastructure (Vitest config, helpers, fixtures) can start immediately after Foundational
- US3 is verification-only — all implementation is delivered by Phases 2 and 3
- The roots module has no controller (routes call service directly), so observeDb is integrated in routes
- The stats module has no controller either — it's not a hot-path endpoint so no observeDb wrapping needed
- Commit after each task or logical group; stop at any checkpoint to validate independently
- Validate that response shapes remain unchanged after each service optimization
- **T047** (before-hardening baselines) must execute BEFORE T016–T024 hardening changes to establish the FR-002 baseline; T039 baselines.json uses placeholder values until hardening is complete, then T047's before-hardening.json enables SC-004 verification
- **T050** (hotpath scope) should be completed early so the request-logger plugin (T013) and perf scenarios (T036–T038) can reference the canonical endpoint list
- **getSajdaVerses** is defined in quran.service.ts, so singleFlight wrapping and observeDb tracking for it belong in T016/T017, not in roots module tasks
- **Regression threshold**: 25% relative tolerance on latency with 50ms absolute floor, +1 on DB query count — this reconciles the spec clarification with practical CI variance (research R4.2)