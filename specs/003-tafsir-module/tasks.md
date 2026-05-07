# Tasks — Tafsir (Quranic Exegesis) Module

**Branch**: `003-tafsir-module` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Phase 1 review status (2026-05-04)

Three issues raised during the Phase 1 review have been resolved in the design docs:

1. **Stale plan.md** → plan.md now has a "Scaffolding status" note acknowledging that the module shell, models, validators, compress registration, and `/api/v1/tafsir` mount are already in place on the branch.
2. **Spec ↔ research budget mismatch (3 s vs. 800 ms)** → research.md R3 now distinguishes the 3 s contractual ceiling (FR-023/SC-004) from the 800 ms internal default and notes the env override.
3. **FR-020b concurrent-ingestion lock unaddressed** → data-model.md adds `runningSince`/`runId` fields with claim/release semantics; research.md adds R12 explaining the atomic `findOneAndUpdate` lock primitive and the `--unlock` recovery flag.

Smaller nits also addressed: research.md R5 ETag now keys on `generation` not `ingestedAt`; verse-marker.md treats the route list as authoritative (no reflective discovery); tafsir-fetch.yaml 400 description now mentions per-surah ayah validation; data-model.md points `ayahCountFor` at `tafsir.service.ts:AYAH_COUNTS`; research.md R6 notes cross-module compression impact; T016 task body updated to include the lock primitive and `--unlock` flag.

The task checkboxes below reflect the actual on-branch implementation state. Tasks marked **Partial** in their body are scaffolded but need additional work to satisfy the contract (T003 lock fields, T010a `p-limit`, T018 `AbortSignal.timeout`, T019 ETag rewrite per updated R5).

## Implementation Strategy

Deliver incrementally: first the data layer + source-listing endpoint (US2), then the fetch endpoint (US1), then verse-endpoint integration (US3), then ingestion (US4), then extensibility validation (US5). Each phase produces a testable, independently verifiable increment. The MVP is US1 + US2 together — a consumer can discover sources and fetch tafsir.

---

## Phase 1: Setup

Goal: Create the module skeleton, models, and registration hooks so subsequent phases have a compilable, importable foundation.

- [x] T001 Create TafsirSource Mongoose model in `src/database/models/tafsir-source.model.ts` with schema per data-model.md (slug, name, author, language, direction, format, grouping, homepage, license, ingestedAt, generation) plus unique index on `{ slug: 1 }` and index on `{ language: 1 }`; use `mongoose.models.TafsirSource || model("tafsirsource", schema)` pattern
- [x] T002 Create Tafsir Mongoose model in `src/database/models/tafsir.model.ts` with schema per data-model.md (sourceSlug, surah, ayahStart, ayahEnd, text, ingestedAt) plus unique compound index on `{ sourceSlug: 1, surah: 1, ayahStart: 1, ayahEnd: 1 }`; use `mongoose.models.Tafsir || model("tafsir", schema)` pattern
- [x] T003 Create TafsirIngestionState Mongoose model in `src/database/models/tafsir-ingestion-state.model.ts` with schema per data-model.md (sourceSlug, lastSurahCompleted, updatedAt, **runningSince, runId**) plus unique index on `{ sourceSlug: 1 }`; use `mongoose.models.TafsirIngestionState || model("tafsiringestionstate", schema)` pattern
- [x] T004 [P] Export new models from `src/database/models/index.ts` by adding `export { TafsirSource } from "./tafsir-source.model.js"`, `export { Tafsir } from "./tafsir.model.js"`, and `export { TafsirIngestionState } from "./tafsir-ingestion-state.model.js"`
- [x] T005 [P] Create tafsir Zod validator file `src/validators/tafsir.validator.ts` defining `surahParamSchema` (z.coerce.number().int().min(1).max(114)), `ayahParamSchema` (z.coerce.number().int().min(1)), `sourcesQuerySchema` (z.string().optional()), `sourceListQuerySchema` (z.object({ language: z.string().optional() })), `tafsirSourceResponseSchema`, `tafsirBlockSchema`, `tafsirFetchResponseSchema`, and `verseTafsirMarkerSchema` per contracts; call `extendZodWithOpenApi(z)` and add `.openapi()` names
- [x] T006 Create tafsir service module `src/modules/tafsir/tafsir.service.ts` with stub functions: `listSources(language?)`, `fetchBundle(surah, ayah, sourceSlugs?)`, `getCoverageMapForSurahs(surahs)` — import TafsirSource and Tafsir models from `src/database/models/index.ts`
- [x] T007 Create tafsir controller module `src/modules/tafsir/tafsir.controller.ts` with stub handlers: `listSourcesHandler`, `fetchTafsirHandler` — import validators and service; handlers use `safeParse` for input validation
- [x] T008 Create tafsir routes module `src/modules/tafsir/tafsir.routes.ts` registering `GET /sources` and `GET /:surah/:ayah` with Zod schema, summary, description, tags, and `zodResponse`; call `registerCachePolicy()` per existing module pattern
- [x] T009 Register `tafsirRoutes` in `src/app.ts` with prefix `/api/v1/tafsir` alongside existing module registrations; register `@fastify/compress` plugin globally with `{ global: true, threshold: 1024, encodings: ['br', 'gzip'] }`
- [x] T010 [P] Add `--tafsir <slug>` and `--register-only` flag handling to `src/scripts/index.ts` CLI dispatcher — add a conditional block that imports and calls the tafsir ingestion runner (stub for now)
- [x] T010a Install new npm dependencies: `@fastify/compress` ^8.3.1 (installed) and `p-limit` ^7.3.0 (installed) are now in `dependencies`. `sanitize-html` is intentionally deferred per research.md R9 — it will be installed inline by the first HTML-format adapter (JSON has no comment syntax, so the deferral is documented in R9 + FR-019 rather than in package.json).

## Phase 2: Foundational

Goal: Implement the data-layer seeding and core service logic that all user stories depend on. After this phase, source listing works end-to-end.

- [x] T011 Implement `listSources(language?)` in `src/modules/tafsir/tafsir.service.ts` — query `TafsirSource.find(language ? { language } : {}).lean().sort({ slug: 1 })` and map to `SourceListItem` shape
- [x] T012 Implement `listSourcesHandler` in `src/modules/tafsir/tafsir.controller.ts` — parse optional `language` query param via `sourceListQuerySchema.safeParse(request.query)`, call `listSources()`, return `{ data }` envelope; handle 400 validation errors
- [x] T013 Implement `GET /api/v1/tafsir/sources` route in `src/modules/tafsir/tafsir.routes.ts` — wire `listSourcesHandler`, add `schema.summary: "List Tafsir Sources"`, `description`, `tags: ["Tafsir"]`, `querystring: sourceListQuerySchema`, `zodResponse`; add `IMMUTABLE` cache policy
- [x] T014 Seed the three v1 TafsirSource documents — create `src/scripts/tafsir/seed-sources.ts` that upserts `muyassar` (language: ar, direction: rtl, format: text, grouping: ayah), `mukhtasar` (same), and `tadabbur-wa-amal` (same but grouping: range) via `TafsirSource.findOneAndUpdate({ slug }, ..., { upsert: true })`; export and call from the `--tafsir --register-only` path in `src/scripts/index.ts`
- [x] T015 Write contract test `tests/contract/tafsir/sources.test.ts` — verifies: (1) 200 with all v1 source metadata when called with valid API key, (2) 401 with `InvalidApiKey` body when called without key, (3) `?language=ar` filters correctly, (4) response shape matches `SourceListItem` contract
- [x] T016 Create ingestion runner skeleton `src/scripts/tafsir/runner.ts` — this is a skeleton only: define `runIngestion(sourceSlug, options?)` signature, imports, types (`AdapterFn`, `IngestionOptions`), resume marker read/write via `TafsirIngestionState`, `p-limit(6)` setup, `TAFSIR_DB_LOOKUP_BUDGET_MS` env var read, `withTimeout()` helper (wired to `executeWithSignal()`), concurrent-run reject via `findOneAndUpdate` lock pattern (per R12 — claim via `{ runningSince: null }` predicate, release on completion/abort), `--from`/`--restart`/`--unlock` flag parsing, and logging infrastructure. The per-surah adapter dispatch loop, `getAdapter()` wiring, HTML-format guard, and upsert logic will be filled in by T035.

---

## Phase 3: User Story 1 + 2 (P1) — Fetch & List Tafsir

**Story Goal**: A consumer can discover available tafsir sources and fetch ayah-level commentary from multiple sources in a single bundled request with an explicit `missing` list, bounded per-source latency, and ETag caching.

**Independent Test**: Issue `GET /api/v1/tafsir/sources` with a valid API key and confirm three source entries; then issue `GET /api/v1/tafsir/2/20?sources=muyassar,mukhtasar,tadabbur-wa-amal` and confirm response contains available blocks plus a `missing` array for sources without data.

### US2 — List available tafsir sources

- [x] T017 [US2] Wire seeded source data into running server — verify `GET /api/v1/tafsir/sources` returns the three v1 sources end-to-end in dev environment

### US1 — Fetch ayah-level tafsir from multiple sources

- [x] T018 [US1] Implement `fetchBundle(surah, ayah, requestedSlugs?)` in `src/modules/tafsir/tafsir.service.ts` — resolve all registered source slugs if none requested; for each source, execute `findOne({ sourceSlug, surah, ayahStart: { $lte: ayah }, ayahEnd: { $gte: ayah } })` with per-source `AbortSignal.timeout(budget)` where budget defaults to 800 ms (env `TAFSIR_DB_LOOKUP_BUDGET_MS`; this is the internal DB query timeout — distinct from the 3-second user-visible SLA per source per SC-004, which accounts for DB lookup + serialization + network overhead); collect resolved entries into `results[]` and timed-out/errored/unknown slugs into `missing[]`. **Partial**: query, results/missing collection, and unknown-slug-as-missing already implemented; AbortSignal.timeout enforcement of `TAFSIR_DB_LOOKUP_BUDGET_MS` still missing — current code reads the env var but does not wire it into the query.
- [x] T019 [US1] Implement ETag generation in `src/modules/tafsir/tafsir.service.ts` — compute `W/"<hex>"` from SHA-1 of sorted `"<slug>:<generation>"` pairs across responding sources plus sorted missing slug list (per research.md R5 — uses `generation` not `ingestedAt`); add `If-None-Match` handling in controller to return 304. **Note**: current controller has a placeholder ETag that uses `text.length` as a date — buggy and based on the old R5 design; replace per the updated R5.
- [x] T020 [US1] Implement `fetchTafsirHandler` in `src/modules/tafsir/tafsir.controller.ts` — validate `surahParamSchema` + `ayahParamSchema` (reject invalid surah/ayah with 400), parse optional `sources` query via comma-split, call `fetchBundle()`, set `ETag` and `Cache-Control: public, max-age=3600, stale-while-revalidate=86400` headers, return `{ surah, ayah, results, missing }` envelope
- [x] T021 [US1] Implement `GET /api/v1/tafsir/:surah/:ayah` route in `src/modules/tafsir/tafsir.routes.ts` — wire handler, add schema with summary, description, tags `["Tafsir"]`, `params: { surah: surahParamSchema, ayah: ayahParamSchema }`, `querystring: sourcesQuerySchema`, `zodResponse`; add `SEARCH` cache policy
- [x] T022 [US1] Add surah ayah-count validation in `src/modules/tafsir/tafsir.service.ts` — import or derive `ayahCountFor(surah)` map to reject ayah values that exceed the surah's actual ayah count; export helper `validateSurahAyah(surah, ayah)` returning `null` or error message; use in controller to return 400 distinguishable from "valid ayah, no tafsir"
- [x] T023 [US1] Implement in-process cache for tafsir fetch results in `src/modules/tafsir/tafsir.service.ts` — module-local `Map<string, CachedEntry>` keyed by `${sourceSlug}|${surah}|${ayah}` with 50K entry cap and FIFO overflow; cache prefix includes source `generation` counter so re-ingest invalidates only that source; cache MISS sentinel for ayahs with no entry
- [x] T024 [US1] Write contract test `tests/contract/tafsir/ayah.test.ts` — verifies: (1) 200 with results + missing for valid ayah, (2) 200 with all sources in missing when no data exists, (3) 400 for invalid surah/ayah, (4) 401 for missing/invalid API key, (5) range-shaped entry returns actual ayahStart/ayahEnd across different requested ayahs, (6) ETag + 304 behavior, (7) `?sources=` comma-separated filtering, (8) default to all registered sources when `sources` omitted, (9) unknown slug appears in `missing`, (10) multi-source fetch completes within 3s × source_count + 1s overhead even when one source times out (asserts SC-004 budget)
- [x] T025 [US1] Verify OpenAPI parity — run `npm test -- tests/parity` and confirm new tafsir routes appear in `/openapi.json` with correct schemas and pass the parity check with no new exempt paths

---

## Phase 4: User Story 3 (P2) — Verse-endpoint Tafsir Marker

**Story Goal**: A consumer rendering a verse view sees a `tafsir.sources` slug list on each ayah without loading full tafsir bodies, enabling progressive-disclosure UI.

**Independent Test**: Request a verse from the existing verse endpoint and confirm the per-ayah payload contains a `tafsir.sources` array matching the set of sources that return content for that ayah via the tafsir fetch endpoint.

- [x] T026 [US3] Implement coverage map builder in `src/modules/tafsir/tafsir.service.ts` — `buildCoverageMap()` queries all `Tafsir` documents projecting `{ sourceSlug, surah, ayahStart, ayahEnd }` and builds `Map<string, Map<number, Map<number, Set<string>>>>` (keyed by surah → ayah → slug set); lazy-initialized on first call, invalidated by generation counter; export `getTafsirSourcesForAyah(surah, ayah): string[]` returning alphabetically sorted slug list
- [x] T027 [US3] Integrate `getTafsirSourcesForAyah` into `src/modules/quran/quran.controller.ts` — on every verse-returning handler, call `getTafsirSourcesForAyah(surah, ayah)` for each ayah in the response and attach `{ tafsir: { sources: [...] } }` to each ayah object; ensure empty `[]` when no sources cover the ayah (FR-014)
- [x] T028 [US3] Update quran Zod validators in `src/validators/quran.validator.ts` — add `verseTafsirMarkerSchema` (`z.object({ tafsir: z.object({ sources: z.array(z.string()) }) })`) and extend the relevant response schemas to include the `tafsir` field on ayah-shaped objects
- [x] T029 [US3] Write contract test `tests/contract/tafsir/verse-marker.test.ts` — verifies: (1) verse endpoint response includes `tafsir.sources` array on each ayah, (2) array matches tafsir fetch results for that ayah, (3) empty array `[]` (not null, not omitted) when no tafsir exists, (4) no tafsir body text appears in verse endpoint payload, (5) slugs are alphabetically sorted
- [x] T030 [US3] Verify OpenAPI parity — run parity tests to confirm verse endpoint schemas now include the `tafsir` property with no parity failures

---

## Phase 5: User Story 4 (P2) — Idempotent Ingestion

**Story Goal**: An operator can run, re-run, and resume ingestion for any source without producing duplicates, without needing manual cleanup, and without partial-state corruption.

**Independent Test**: Run ingestion for a source twice and confirm entry count is unchanged with no duplicate `(source, ayahStart, ayahEnd)` tuples.

- [x] T031 [US4] Implement tafsir.app HTTP client `src/scripts/tafsir/client.ts` — export `createTafsirAppClient()` that returns a function `fetchAyah(slug, surah, ayah)` making a single HTTP GET to `https://tafsir.app/get.php?src=<slug>&s=<surah>&a=<ayah>&ver=1`; include configurable retry (1 retry), timeout (5s per request), and rate-limit spacing (250ms between consecutive requests to same host via simple token bucket); accept a DI base URL and fetch function for testing
- [x] T032 [US4] Implement `muyassar` adapter `src/scripts/tafsir/muyassar.ts` — export `normalizeMuyassar(rawResponse, surah)` that translates a single-ayah upstream response into `{ sourceSlug: "muyassar", surah, ayahStart: number, ayahEnd: number, text: string }`; handle empty-body case by returning `null` (do not store); register in runner as a known adapter
- [x] T033 [P] [US4] Implement `mukhtasar` adapter `src/scripts/tafsir/mukhtasar.ts` — same shape as muyassar adapter but with `sourceSlug: "mukhtasar"`
- [x] T034 [P] [US4] Implement `tadabbur-wa-amal` adapter `src/scripts/tafsir/tadabbur-wa-amal.ts` — this is a range-shaped source; normalize upstream response that includes `ayahs_start` and `count` fields into `{ sourceSlug: "tadabbur-wa-amal", surah, ayahStart, ayahEnd: ayahs_start + count - 1, text }`; handle count-derivation and single-ayah-within-range edge cases
- [x] T035 [US4] Complete the ingestion runner `src/scripts/tafsir/runner.ts` — implement per-ayah fan-out: for each surah (starting from resume marker + 1), iterate all ayahs, call the registered adapter (from `ADAPTER_MAP`) for each with `executeWithSignal()` wrapping, upsert results into `Tafsir` model via `findOneAndUpdate({ sourceSlug, surah, ayahStart, ayahEnd }, { $set: { text, ingestedAt } }, { upsert: true })`; skip and log entries where adapter returns `null`; after each surah completes, update `TafsirIngestionState.lastSurahCompleted` and `updatedAt`; after all surahs, bump `TafsirSource.generation` and `ingestedAt`; implement HTML-format guard per T035a. Note: per-surah loop structure, `p-limit(6)`, lock claim/release, and resume marker infrastructure were already scaffolded in T016.
- [x] T035a [US4] Add HTML-format guard in `src/scripts/tafsir/runner.ts` — before storing an entry, check the source's `format` field: if `format === 'html'`, reject the ingestion with a clear error message stating that HTML sanitization is not yet implemented (per FR-019 deferral); this ensures unsanitized HTML never reaches storage (satisfies spec edge case L101 and SC-008 spirit for v1); when a future HTML source is onboarded, this guard is replaced by the actual `sanitize-html` pipeline
- [x] T036 [US4] Wire ingestion CLI in `src/scripts/index.ts` — complete the `--tafsir <slug>` path to call `runIngestion(slug, options)`; support `--register-only` flag to only seed source without ingesting; support `--from <surah>` and `--restart` flags; validate slug is a registered source
- [x] T037 [US4] Write ingestion adapter tests `tests/scripts/tafsir/muyassar.test.ts` — test normalization from a recorded JSON fixture (no live HTTP); verify single-ayah shape, empty-body null handling, correct `ayahStart === ayahEnd`
- [x] T038 [P] [US4] Write ingestion adapter test `tests/scripts/tafsir/mukhtasar.test.ts` — same pattern as muyassar test with mukhtasar fixtures
- [x] T039 [P] [US4] Write ingestion adapter test `tests/scripts/tafsir/tadabbur-wa-amal.test.ts` — test range normalization from fixture; verify `ayahEnd = ayahs_start + count - 1` derivation; verify single-ayah-within-range behavior
- [x] T040 [US4] Write runner test `tests/scripts/tafsir/runner.test.ts` — test: (1) idempotency — run twice, confirm zero new/modified entries, (2) resume — mock client to fail at surah 50, re-run, confirm completion from surah 51, (3) concurrent-run rejection — start two runs, confirm second gets a clear error, (4) skip-and-log — mock client to return empty for one ayah, confirm no document stored and log entry produced

---

## Phase 6: User Story 5 (P3) — Extensibility (Fourth Source Without Code Changes)

**Story Goal**: Adding a new tafsir source requires only a registry row + an adapter file — no changes to routes, controllers, services, or models.

**Independent Test**: Add a hypothetical fourth source (registry row + adapter file), run ingestion, and verify it appears in source listings and the fetch endpoint returns its content — all without modifying any existing route, controller, model, or service file.

- [ ] T041 [US5] Extract adapter registry map in `src/scripts/tafsir/runner.ts` — replace direct imports of individual adapters with a dynamic `Map<string, AdapterFn>` that is populated by each adapter file self-registering; the runner resolves adapter by `sourceSlug` from this map; verify that adding a new adapter file and registering it requires zero edits to runner logic
- [ ] T042 [US5] Create documentation comment or README section in `src/scripts/tafsir/` explaining the adapter contract: export a function matching `AdapterFn` signature, import and register in the adapter map; demonstrate that any new adapter file + seed row works with no other edits
- [ ] T043 [US5] Write integration test that simulates adding a fourth source — register a mock source row, create a test adapter, run ingestion with recorded fixtures, verify source appears in `GET /api/v1/tafsir/sources`, verify fetch returns content from that source; confirm `git diff` on `src/modules/`, `src/validators/`, `src/database/models/`, and `src/app.ts` shows no modifications

---

## Phase 7: Polish & Cross-Cutting Concerns

Goal: Ensure all routes pass the OpenAPI parity check, all auth gates work, and the full test suite is green.

- [ ] T044 Run full parity test `npm test -- tests/parity` and confirm zero failures — all tafsir routes registered with `schema.summary`, params, querystring, and `zodResponse`; no new exempt paths
- [ ] T045 Run full contract test `npm test -- tests/contract` and confirm all existing + new tafsir contract tests pass; verify 401 shape on all tafsir routes matches `InvalidApiKey` body
- [ ] T046 Verify verse-endpoint tafsir marker does not regress existing quran tests — run `npm test` full suite and confirm all existing tests still pass
- [ ] T047 Review and clean up any `TODO` markers in delivered code; ensure all JSDoc comments on public functions are present; remove debug logging from runner
- [ ] T048 Run `npm run build` and confirm zero TypeScript compilation errors; run `npm test` and confirm full suite is green

---

## Dependencies

```text
Phase 1 (Setup)
  └── Phase 2 (Foundational) — depends on models and module skeleton
      └── Phase 3 (US1 + US2) — depends on service stubs and seeded sources
          └── Phase 4 (US3) — depends on fetch endpoint for cross-validation
              └── Phase 5 (US4) — depends on models for upsert operations
                  └── Phase 6 (US5) — depends on completed ingestion for extensibility demo
                      └── Phase 7 (Polish) — depends on all features complete
```

## Parallel Execution Examples

**Phase 1 (all tasks parallelizable where marked)**:
- T001, T002, T003 can run in parallel (different model files)
- T004, T005 can run in parallel after T001–T003 (different files)
- T006 + T007 after T005 (validator needed by controller)
- T008 after T006 + T007 (routes import controller)
- T009 after T008 (app.ts registration)
- T010, T010a in parallel with T006–T009 (scripts and deps are separate from module code)

**Phase 3 (US1 + US2)**:
- T017 can run immediately after Phase 2
- T018 → T019 → T020 → T021 sequential (service → ETag → controller → route)
- T022, T023 can run in parallel with T018–T021 (validation + cache are additive)

**Phase 5 (US4)**:
- T032, T033, T034 can run in parallel (three adapter files)
- T037, T038, T039 can run in parallel after their respective adapters

**Phase 6 (US5)**:
- T041 + T042 can run in parallel (refactor + docs)
- T043 after T041 (test validates the refactor)

## MVP Scope

**US1 + US2** (Phase 2 + Phase 3): Source listing + tafsir fetch. This delivers the core value — consumers can discover sources and fetch commentary. Ship as the first increment.

---

## Summary

| Phase | Story | Task Count | Parallelizable Tasks |
|-------|-------|-----------|---------------------|
| 1 | Setup | 11 | T004, T005, T010, T010a |
| 2 | Foundational | 6 | none (sequential seeding) |
| 3 | US1 + US2 | 9 | T022, T023 |
| 4 | US3 | 5 | none |
| 5 | US4 | 11 | T033, T034, T038, T039 |
| 6 | US5 | 3 | T041, T042 |
| 7 | Polish | 5 | T044–T048 (can run in parallel) |
| **Total** | | **50** | |

Independent test criteria per story:

- **US1**: `GET /api/v1/tafsir/2/20?sources=muyassar,mukhtasar,tadabbur-wa-amal` returns available blocks + `missing` array; 304 on revalidation; range invariance across different ayahs
- **US2**: `GET /api/v1/tafsir/sources` returns three v1 source entries with full metadata; 401 without API key
- **US3**: `GET /api/v1/quran/surah/2/ayah/20` includes `tafsir.sources` matching tafsir fetch results; empty `[]` when no tafsir
- **US4**: Run `--tafsir muyassar` twice → zero new/modified entries; resume after interruption; concurrent-run rejection
- **US5**: Add source + adapter → works end-to-end with zero edits to existing route/controller/service/model files