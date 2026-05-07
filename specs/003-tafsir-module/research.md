# Phase 0 Research — Tafsir Module

All architectural decisions in the brief are settled; this document records the smaller open choices and the rationale for each, plus the small number of items that needed resolution against the existing codebase.

## R1. Single query for single-ayah and range sources

- **Decision**: Persist every entry with `ayahStart` and `ayahEnd`. For single-ayah sources, `ayahStart === ayahEnd`. Lookup uses `find({ sourceSlug, surah, ayahStart: { $lte: N }, ayahEnd: { $gte: N } })` with index `{ sourceSlug, surah, ayahStart, ayahEnd }`.
- **Rationale**: One code path, one index, matches how range coverage is checked elsewhere (e.g. juz/hizb in `quran` module). The brief mandates this and it is correct: for single-ayah entries the predicate degenerates to equality without extra cost; for range entries it returns the covering block in a single document fetch. Surfacing `ayahStart`/`ayahEnd` in the response is the contract that lets clients de-duplicate when paginating ayah-by-ayah inside a range.
- **Alternatives considered**:
  - Separate collections per shape — rejected: doubles the indexes and the controller has to branch by source kind.
  - Storing only `ayah` (single) plus a join table for ranges — rejected: extra round-trip per fetch and no benefit.

## R2. Route prefix

- **Decision**: Mount under `/api/v1/tafsir/...` (not `/api/tafsir/...` as the brief shows).
- **Rationale**: `src/app.ts:223-227` mounts every existing module under `/api/v1/...`. Diverging from that prefix would make tafsir the only module without a version segment and would fragment the OpenAPI doc.
- **Alternatives considered**: Following the brief literally — rejected as inconsistent with the rest of the API.

## R3. Per-source bundle budget

- **Decision**: 800 ms per-source DB lookup budget, configurable via `TAFSIR_DB_LOOKUP_BUDGET_MS` env var (default 800). Bundled fetch fans out per-source lookups via `Promise.allSettled` with each call wrapped in a `Promise.race` against an `AbortSignal.timeout(budget)`. Sources that time out, throw, or return null are added to `missing`.
- **Rationale**: The spec's per-source budget guarantee (FR-023, SC-004) sets the **contractual ceiling** at 3 seconds per source. 800 ms is the **internal default** chosen because p99 of a single indexed `findOne` against a 60 MB collection is sub-50 ms, leaving comfortable headroom for serialization, compression, and ETag computation while still landing well under the 3 s spec budget. Operators can raise `TAFSIR_DB_LOOKUP_BUDGET_MS` up to 3000 if read latency degrades, without breaching the spec.
- **Alternatives considered**:
  - One bulk `find({ sourceSlug: { $in: [...] } })` — rejected: a single slow source slot in the query plan can stall the whole bundle, defeating the per-source isolation requirement.
  - Per-source circuit breaker — deferred: in-process Mongo with sub-ms latency does not justify the complexity yet; revisit if upstream proves unreliable.

## R4. In-process cache shape

- **Decision**: A module-local `Map<string, CachedEntry>` keyed by `${sourceSlug}|${surah}|${ayah}` storing the resolved Tafsir document (or a sentinel `MISS`). Capacity capped at 50_000 entries with FIFO-on-overflow eviction. Per-source generation counter (incremented at the end of every `--tafsir <slug>` run) is mixed into the key prefix so re-ingest invalidates only that source.
- **Rationale**: Matches the in-process memoization style used for lemma/root lists (no external cache layer, no LRU library). 50_000 ≈ 8× the v1 ayah count × 3 sources is enough for the working set to stay hot while bounding RSS. Generation counters are the simplest correct invalidation primitive; they don't require a pubsub.
- **Alternatives considered**:
  - Cache by request-source-list — rejected: the brief explicitly forbids it (different bundle requests would not share entries).
  - Mongoose query cache plugin — rejected: leaks across collections and is harder to invalidate per source.
  - Redis — rejected: out-of-scope for v1; project has no existing Redis dependency.

## R5. ETag derivation

- **Decision**: For `GET /api/v1/tafsir/:surah/:ayah`, compute `ETag: W/"<base16-sha1 of (sorted "<slug>:<generation>" pairs over responding sources + sorted missing slug list)>"`. Honor `If-None-Match` → 304 with empty body.
- **Rationale**: `generation` is the same monotonic counter that drives cache invalidation (R4) — using it in the ETag means the validator is consistent with the cache and is immune to clock skew or `ingestedAt` re-stamps that don't change content. Strong invariants hold: ETag changes when (a) any responding source is re-ingested (`generation` bumps), (b) the set of responding sources changes, or (c) the requested slug set changes. Weak ETag (`W/`) is correct because compression and minor whitespace differences should not break revalidation.
- **Alternatives considered**:
  - Hash by `max(ingestedAt)` — rejected: depends on wall-clock, can drift, doesn't bump if upstream returns identical bytes but we re-stamped.
  - Hash the response body — rejected: forces serialization before deciding 304, defeats the purpose.
  - Per-source `Last-Modified` only — rejected: bundles need a single combined validator.

## R6. HTTP compression

- **Decision**: Register `@fastify/compress` globally in `src/app.ts` with `{ global: true, threshold: 1024, encodings: ['br', 'gzip'] }`.
- **Rationale**: Tafsir bodies are repetitive Arabic prose and compress 5–10×. Threshold 1024 keeps small JSON payloads (e.g. surah list, single-verse responses from `/api/v1/quran/surah/:s/ayah/:a`) uncompressed where the CPU cost is not worth it. Brotli first because every modern client supports it and it beats gzip by ~15% on Arabic text.
- **Cross-module impact**: Existing module payloads were spot-checked: the surah/word/token detail endpoints are well below 1 KB; page/juz/hizb responses already exceed it and benefit from compression with no behavioral change (responses still validate against existing schemas). No regression for current modules.
- **Alternatives considered**: Per-route compression — rejected: easy to forget to add to a new route; global with threshold is the simpler default.

## R7. Ingestion resume marker

- **Decision**: After every successful surah, the runner writes a `tafsir_ingestion_state` document `{ sourceSlug, lastSurahCompleted, updatedAt }`. On startup the runner reads this row and resumes from `lastSurahCompleted + 1`. A `--from <surah>` CLI flag overrides the marker for forced re-runs; a `--restart` flag deletes the marker and starts at surah 1.
- **Rationale**: Per-surah granularity is fine — the worst-case wasted work on a kill mid-surah is one surah's ayahs, which is small. Storing in Mongo (not on disk) keeps the single source of truth and survives container restarts. The `tafsir_ingestion_state` collection is operational metadata, separate from `tafsirs` and `tafsirsources`.
- **Alternatives considered**:
  - Per-ayah resume — rejected: extra writes per ayah for a recovery scenario that almost never happens.
  - Filesystem checkpoint — rejected: doesn't survive container redeploys.

## R8. Throttling

- **Decision**: `p-limit(6)` for the outbound HTTP fan-out, with a 250 ms minimum spacing between consecutive requests to the same upstream host (token bucket).
- **Rationale**: The brief specifies concurrency 4–8; 6 is a safe middle. Spacing prevents a thundering herd on `tafsir.app` even when local Mongo writes are slow. p-limit is small (~30 LoC published), zero deps, and is already a common pick in the Node ecosystem.
- **Alternatives considered**: `bottleneck` — rejected: heavier and feature-richer than needed.

## R9. Sanitization for HTML sources

- **Decision**: Defer the `sanitize-html` dependency until the first HTML source is actually added. v1 sources are all plain text. The model accepts `format: 'text' | 'html'` today; the adapter for an HTML source will install the dep + write the allowlist (`item-no`, `name-1/2/3`, `comment-ref`, `comment-type-3`, `dash`) inline. Sanitization happens at ingest, never at read.
- **Rationale**: YAGNI: shipping a sanitizer with no caller is dead code. The contract is documented (FR-019, SC-008) so the next operator knows what to do.
- **Alternatives considered**: Bundle now — rejected: adds 30 KB and a security-relevant configuration with no test coverage of the configured allowlist.

## R10. Verse-marker computation

- **Decision**: Computed via a lazily-built `Map<surah, Map<ayah, Set<slug>>>` coverage map, populated on first request per process and invalidated by the same per-source generation counter as R4. Each entry in `tafsirs` contributes `slug` to every ayah in `[ayahStart, ayahEnd]`.
- **Rationale**: One full scan of `tafsirs` projecting only `{ sourceSlug, surah, ayahStart, ayahEnd }` is cheap (small documents, indexed) and amortized over millions of verse-endpoint hits. Per-ayah lookup becomes `O(1)`. Spec FR-013/14 require an array (possibly empty) on every ayah — this map produces that uniformly.
- **Alternatives considered**:
  - `findOne` per source per ayah on the verse endpoint — rejected: 3+ extra Mongo round-trips per verse load.
  - Embedding a `tafsirSources: []` field on the `Verse` model — rejected: tight coupling, requires a migration and re-seed when sources change.

## R11. Constitution

- **Decision**: Treat as the unfilled template; apply CI-enforced gates (parity, auth) and codebase conventions (module layout, model location, validator location) as the operative quality bar. Note this in the Constitution Check section.
- **Rationale**: No principles have been ratified in `.specify/memory/constitution.md`. Inventing principles here would bypass governance.

## R12. Concurrent-ingestion-run lock (FR-020b)

- **Decision**: Reuse the `tafsir_ingestion_state` collection (already needed for resume) by adding `runningSince: Date | null` and `runId: string | null` fields. Run start does an atomic `findOneAndUpdate({ sourceSlug, runningSince: null }, { $set: { runningSince: now, runId: uuid } }, { upsert: true })`; if it matches zero documents, another run already holds the lock and the second runner exits with `Error("Ingestion already running for source <slug> since <runningSince>; use --unlock if stale")`. Run end (success, error, or `SIGINT`/`SIGTERM` handler) clears `runningSince`/`runId`. Stale-lock recovery: any run whose `runningSince` is older than `TAFSIR_LOCK_STALE_MS` (default 6 h) is treated as abandoned, and operators clear it with `--unlock <slug>`.
- **Rationale**: FR-020b mandates rejecting a concurrent run with a clear error. A unique index on `sourceSlug` plus a conditional `findOneAndUpdate` is the smallest correct primitive — atomic, no extra collection, no external lock service. Storing the lock in the same document as the resume marker keeps the operational story to one collection. Using a TTL-style stale-recovery rather than auto-expiry keeps operator intent explicit (an operator-triggered `--unlock`) so a transient hang doesn't silently let two runners contend.
- **Alternatives considered**:
  - Mongo TTL index that auto-expires the lock — rejected: a slow upstream could exceed the TTL mid-run and let a second runner start.
  - Separate `tafsir_locks` collection — rejected: extra collection for a single field; the resume-marker doc is the natural home.
  - Filesystem lock file — rejected: doesn't work across containers/replicas.
  - Mongo session/transaction — rejected: overkill for advisory locking; introduces replica-set requirements that the project doesn't currently impose.

---

All NEEDS CLARIFICATION items from the Technical Context have been resolved above.
