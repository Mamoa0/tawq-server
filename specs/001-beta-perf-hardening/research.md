# Research: Beta Performance Hardening & Regression Safety Net

**Branch**: `001-beta-perf-hardening` | **Date**: 2026-04-24

## R1: Test Framework Selection

**Decision**: Vitest

**Rationale**:
- Native ESM + TypeScript support without loader hacks (esbuild/tsx transforms, zero config for `"type": "module"` + `NodeNext`)
- Fastify team officially recommends Vitest; `fastify.inject()` works identically in test and production
- `vitest bench` provides structured benchmarking; custom threshold gates are trivial to add
- Parallel test workers via esbuild transform keep the full suite well under the 5-minute CI target
- `mongodb-memory-server` integration via `globalSetup` is well-documented
- Workspace support (`vitest.workspace.ts`) enables separate correctness and perf projects with different timeouts and sequencing

**Alternatives considered**:
- **Jest**: ESM support is experimental (`--experimental-vm-modules`); `ts-jest` incompatible with `NodeNext`; slower transform; no built-in benchmarking
- **Node:test**: No TypeScript transform, no parallel workers, minimal reporter output, no workspace concept
- **Mocha+Chai**: Slow startup with `ts-node`, no built-in benchmarking, less structured for perf gates

## R2: MongoDB Performance Optimization

**Decision**: Multi-pronged approach — add missing indexes, parallelize sequential queries, replace searchTokens self-join, add single-flight deduplication, apply projections, add text index

### R2.1: Missing Indexes

**Decision**: Add 6 indexes (3 compound, 2 compound search, 1 text)

**Rationale**: Each query identified by `explain()` analysis as doing collection scans:

| Collection | Index | Reason |
|---|---|---|
| `verses` | `{ juz: 1, surah: 1, ayah: 1 }` | `getVersesByJuz()` filter+sort |
| `verses` | `{ hizb: 1, surah: 1, ayah: 1 }` | `getVersesByHizb()` filter+sort |
| `surahs` | `{ revelation_place: 1, revelation_order: 1 }` | `getSurahsByPlace()` filter+sort |
| `tokens` | `{ LEM: 1, ROOT: 1 }` | Autocomplete and search filter+projection |
| `tokens` | `{ POS: 1, ROOT: 1 }` | Morphology filter optimization |
| `verses` | `{ translation: "text" }` | Replace `$regex` full-scan with `$text` search |

**Alternatives considered**: Single-field indexes only (worse sort coverage); no text index (keeps slow $regex scans).

### R2.2: Parallelize Sequential Queries

**Decision**: Use `Promise.all()` for 4 of 5 identified sequential patterns

**Rationale**: Independent reads that don't depend on each other's results can safely run in parallel. The only exception is `getSurahWordFrequency()` where the existence check on `surah` guards an expensive aggregation.

| Function | Before | After |
|---|---|---|
| `getAyahWithWords()` | 2 sequential: verse → words | `Promise.all([verse, words])` |
| `getAyahAnalysis()` | 2 sequential: verse → tokens | `Promise.all([verse, tokens])` |
| `getRoot()` | 2 sequential: findOne → aggregate | `Promise.all([findOne, aggregate])` |
| `getRootNetwork()` | 2 sequential: aggregate → count | `Promise.all([aggregate, count])` |
| `getSurahWordFrequency()` | Keep sequential | Guard clause on surah existence |

Caveat: After parallelizing `getAyahWithWords()` and `getAyahAnalysis()`, a null verse still triggers a words/tokens query (cost: cheap indexed lookup returning empty). The parallel speedup outweighs this.

**Alternatives considered**: Keep all sequential (simpler but 2× latency on hot paths); use async generators (unnecessary complexity).

### R2.3: Fix searchTokens Self-Join N+1

**Decision**: Replace `$lookup` self-join on `tokens` collection with `$lookup` into `verses` collection

**Rationale**: The current pipeline does a self-join in `$facet.data` to reconstruct `fullAyah` from per-token `form` fields. This is O(N×M) where N = page size and M = tokens per ayah. The `verses` collection already stores `arabic` (the complete ayah text). A single-document lookup per result row replaces the multi-document group-and-concat self-join.

Implementation: Use `$lookup` with `let`/`pipeline` into `verses` collection, matching on `{surah, ayah}`, projecting only `arabic`. The existing `{surah:1, ayah:1}` unique index makes this a covered lookup.

**Alternatives considered**: Pre-compute `fullAyahBw` during seeding (adds schema field, migration needed); keep current pattern (O(N×M) unacceptable at scale).

### R2.4: Single-Flight Request Deduplication

**Decision**: Implement a `singleFlight` utility that deduplicates concurrent identical in-flight promises

**Rationale**: Under beta load, multiple clients may request the same popular resource simultaneously (e.g., Surah Al-Fatiha). Without deduplication, each request triggers separate DB work. `singleFlight` uses a `Map<string, Promise>` to share the first request's promise with subsequent identical requests. The map entry is cleaned up on promise settlement.

Wrap hot-path, deterministic-read endpoints: `getAyahWithWords`, `getAyahAnalysis`, `getWordDetails`, `getRoot`, `getSajdaVerses`, `getVersesByJuz`, `getVersesByHizb`.

Do NOT wrap search endpoints (variable pagination/filter combinations cause key explosion and memory leak risk).

**Alternatives considered**: Redis-based caching (out of scope per spec); in-memory TTL cache for responses (adds cache invalidation complexity); memoize-all pattern (memory concern for search results).

### R2.5: Projection Enforcement

**Decision**: Add explicit projections to all hot-path queries that currently return full documents

**Rationale**: The `tokens` collection has ~25 fields per document (18 booleans + metadata + timestamps). Returning full documents wastes network bandwidth and memory. The `surahs` list endpoint returns `top_roots` arrays unnecessarily. Projections reduce wire size by 30-50% on hot paths.

Key projections:
- `getAllSurahs()`: exclude `_id, top_roots, createdAt, updatedAt`
- `getVersesByJuz/Hizb()`: exclude `_id, createdAt, updatedAt`
- `searchTokens` pre-`$facet`: project to `{surah, ayah, word, segment, form, ROOT, LEM, POS, tag}`
- `getAyahAnalysis()`: exclude unnecessary boolean flags

**Alternatives considered**: Lean Mongoose queries (not applicable since services use raw driver); no projection (over-fetching confirmed by code analysis).

### R2.6: Text Index on `verses.translation`

**Decision**: Add `{ translation: "text" }` index; use `$text` search as primary path with `$regex` fallback for exact/phrase matching

**Rationale**: Current `searchPhrase()` and `searchVerses()` use `$regex` with case-insensitive flag, forcing a full collection scan on 6,236 documents. A text index enables `$text` search with relevance scoring (`$meta: "textScore"`). For quoted/exact phrase searches, fall back to `$regex`.

Only one text index allowed per collection, so use compound text index if Arabic text search is added later: `{ arabic: "text", translation: "text" }`.

**Alternatives considered**: Keep regex-only (no improvement); Elasticsearch/Meilisearch (out of scope).

### R2.7: Pagination Caps

**Decision**: Reduce search endpoint limits and add hard caps

**Rationale**: `searchTokens` self-join scales O(limit × ayah_token_count). Current max is 100; reduce to 50. Add `refs.length > 50` guard on `getVersesBatch`. Add rate limiting on aggregation-heavy endpoints.

**Alternatives considered**: Cursor-based pagination (more complex, not needed for current dataset size); unlimited (abuse risk).

## R3: Structured Request Logging & Observability

**Decision**: Fastify `onResponse` hook with Pino child logger, per-endpoint slow thresholds, `dbQueryCount` via Symbol-keyed request properties

### R3.1: Response Logging Pattern

**Decision**: Replace manual `onRequest`/`onSend` timing hooks with a single `onResponse` hook using `reply.elapsedTime`

**Rationale**: Fastify's `reply.elapsedTime` is measured by the framework using `process.hrtime()` — more accurate than manual `Date.now()` deltas. Using `onResponse` (instead of `onSend`) guarantees the final status code is available. One structured log line per request replaces the current manual timing approach.

Each log line contains: `endpoint` (from `request.routeOptions.url`), `status`, `durationMs`, `slowThreshold`, `slow` (boolean), `dbQueryCount` (if tracked), `dbTimeMs` (if tracked), and `reqId` (auto from Pino child logger).

**Alternatives considered**: Custom Pino transport (unnecessary complexity); separate APM tool (out of scope).

### R3.2: Per-Endpoint Slow Thresholds

**Decision**: Flat configuration array of `{routePattern, slowMs}` entries, matched against `request.routeOptions.url`

**Rationale**: `request.routeOptions.url` is the Fastify-registered pattern (e.g., `/surah/:s/ayah/:a`), not the raw URL. This normalizes parameterized routes automatically. O(n) lookup with n < 30 routes is effectively free.

Default thresholds:
- Search/aggregation endpoints: 2000-3000ms
- Quran detail endpoints: 500-1000ms
- Global default: 2000ms

**Alternatives considered**: Regex matching (fragile); category-based thresholds (less precise); environment variable per-route (operational burden).

### R3.3: Slow-Request Signal

**Decision**: Dual signal — `warn` log level + `slow: true` structured boolean field

**Rationale**: The `warn` level triggers log-level-based alerting (CloudWatch, Datadog). The `slow: true` field enables log-query-based aggregation (e.g., `stats count by endpoint where slow=true`). Together they support both real-time alerting and historical analysis without a separate event system.

**Alternatives considered**: Custom Pino log level (requires registration, not cheap at runtime); dedicated EventEmitter (unnecessary complexity for log-level signal).

### R3.4: DB Query Count Tracking

**Decision**: Service-layer `observeDb()` wrapper that increments Symbol-keyed counters on the Fastify request object

**Rationale**: The codebase uses `mongoose.connection.collection()` (raw driver) for most queries, making Mongoose `pre`/`post` middleware unreliable. A lightweight wrapper at the controller/service boundary adds ~1µs overhead per call and provides per-request `dbQueryCount` and `dbTimeMs` without bridging Mongoose ↔ Fastify contexts.

The `requestLoggerPlugin` reads these Symbol-keyed properties in the `onResponse` hook and includes them in the structured log line.

For the performance regression gate, MongoDB driver `commandSucceeded` events provide accurate counts for `find`, `aggregate`, `countDocuments`, `distinct` operations.

**Alternatives considered**: Mongoose global middleware (doesn't capture raw driver calls); APM client (out of scope, adds dependency); monkey-patching collection methods (fragile, breaks between driver versions).

## R4: CI & Performance Regression Gate

**Decision**: GitHub Actions with MongoDB service container, Vitest workspace (correctness + perf projects), JSON baseline file, median-of-5 with ±25% tolerance and 50ms absolute floor on latency

### R4.1: CI Configuration

**Decision**: GitHub Actions workflow with `mongo:7` service container, Node 22, separate correctness and perf test jobs

**Rationale**: GitHub Actions is the most common CI for Node.js projects. MongoDB service container avoids needing `mongodb-memory-server` in CI. Workflow separates type-check, correctness tests, and perf gate into sequential steps within a single job (within 8-minute timeout, targeting <5 min actual).

**Alternatives considered**: CircleCI (less common for Node); GitLab CI (not GitHub-native); Docker Compose in CI (heavier, longer startup).

### R4.2: Performance Gate Architecture

**Decision**: Committed `baselines.json` file compared against measured results with ±25% tolerance on latency (plus 50ms absolute floor) and +1 on DB query count

**Rationale**: A JSON baseline file is version-controlled, auditable via git diff, and simple. The ±25% tolerance handles GitHub Actions shared-runner variance (typically ±15-20%). The +1 query tolerance handles occasional Mongoose index-check queries. Median of 5 runs (after 3 warmup) is robust against outliers.

The gate produces a human-readable Markdown report with a table of: endpoint, observed P50/P95, baseline P50/P95, DB query count, and PASS/FAIL status.

**Alternatives considered**: Statistical t-test (overkill for 5 samples); absolute threshold only (too brittle across CI runners); no baseline (can't detect regressions).

### R4.3: Baseline Update Workflow

**Decision**: Two mechanisms — (A) auto-update on merge to `main` via CI job, (B) manual `PERF_UPDATE_BASELINES=1 npm run test:perf -- --update`

**Rationale**: Automated baseline updates on `main` ensure baselines track legitimate performance improvements. Manual updates allow developers to deliberately adjust baselines for architectural changes. Both approaches commit to `baselines.json` with clear messages.

The documentation (in `quickstart.md`) will explain: (1) when and how to update baselines, (2) what the tolerance values mean, (3) how to interpret the gate report.

**Alternatives considered**: Baselines stored in CI artifacts (not auditable, lost between runs); baselines stored in external database (unnecessary infrastructure).

### R4.4: Test Data Fixtures

**Decision**: Hardcoded fixture with 3 surahs (Al-Fatiha, Al-Ikhlas, first 10 verses of Al-Baqarah), ~25 verses, ~250 words, ~350 tokens

**Rationale**: Covers short surah, medium surah, Meccan + Medinan, cross-surah queries, juz/hizb boundaries, search endpoints, root/lemma lookups, and compare endpoints. Seeds in <1 second. Total fixture file <50KB.

A one-time script (`scripts/generate-fixtures.ts`) extracts the subset from a full production DB.

**Alternatives considered**: Use full dataset in CI (>30s seed time, exceeds budget); `mongodb-memory-server` (heavier, adds dependency; note: for CI we use the service container instead, but `mongodb-memory-server` can be used for local test runs).

### R4.5: DB Round-Trip Measurement

**Decision**: MongoDB driver `commandSucceeded` event monitoring for the perf gate; service-layer `observeDb()` wrapper for runtime observability

**Rationale**: `commandSucceeded` captures all operations including raw `collection()` calls without code changes. It's an official MongoDB Node.js driver feature (not a monkey-patch). For the perf gate, we start monitoring before each scenario and count matching command names.

For runtime observability (the structured logging from R3), the `observeDb()` wrapper at the controller layer is lightweight and explicit about what's measured.

**Alternatives considered**: Mongoose middleware (doesn't capture raw driver calls); manual `performance.now()` around each service call (verbose, error-prone).

### R4.6: App Factory for Testing

**Decision**: Extract `createApp()` from `server.ts` into `src/app.ts`, reuse in both production and test

**Rationale**: The current `server.ts` couples app creation with MongoDB connection and `listen()`. Tests need `app.inject()` without `listen()`. Extraction enables:
- Tests create a Fastify instance with all plugins/routes registered but no network listener
- Tests use `app.inject()` for in-process HTTP testing (fast, no port binding)
- Production code remains unchanged in behavior
- Rate limiting can be disabled in tests (set `max: 9999`)

**Alternatives considered**: Duplicate plugin registration in test file (violates DRY, drifts from production); `supertest` with real HTTP (slower, port conflicts).

### R4.7: Timing Budget

| Phase | Estimated Time |
|---|---|
| `npm ci` + `tsc --noEmit` | 45s |
| MongoDB service container startup | 10s |
| Seed test fixtures | 2s |
| Correctness tests (all endpoints) | 30s |
| Performance warmup + 5 runs × 10 endpoints | 60s |
| Report generation | 1s |
| **Total** | **~2.5 min** |

Headroom: 2.5 min (50% of the 5-minute target).

## Research Conclusions

All NEEDS CLARIFICATION items resolved:
1. **Testing framework**: Vitest with `@vitest/coverage-v8`
2. **Performance optimization approach**: 7 concrete changes (indexes, parallelization, self-join fix, single-flight, projections, text index, pagination caps)
3. **Observability**: onResponse hook with Pino child logger, per-endpoint thresholds, Symbol-keyed DB tracking
4. **CI & perf gate**: GitHub Actions + Vitest workspace + baselines.json + median-of-5 ±25%
5. **Test fixtures**: 3-surah hardcoded dataset seeded in <1s