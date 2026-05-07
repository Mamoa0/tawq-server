# Data Model: Beta Performance Hardening & Regression Safety Net

**Branch**: `001-beta-perf-hardening` | **Date**: 2026-04-24

## Overview

This feature modifies existing data models (indexes and projections) and introduces new runtime/operational entities. No new persistent collections are created. The primary schema changes are additional MongoDB indexes and query projections. The new entities (performance baselines, test fixtures, slow thresholds) are configuration files and in-process state.

---

## Existing Entity Changes

### Surah (collection: `surahs`)

| Field | Type | Change |
|---|---|---|
| *(all existing fields unchanged)* | — | No schema changes |
| **New Index** | `{ revelation_place: 1, revelation_order: 1 }` | Compound, non-unique. Supports `getSurahsByPlace()` filter + sort |

**Projection changes** (query-time, not schema):
- `getAllSurahs()`: exclude `_id, top_roots, createdAt, updatedAt`

### Verse (collection: `verses`)

| Field | Type | Change |
|---|---|---|
| *(all existing fields unchanged)* | — | No schema changes |
| **New Index** | `{ juz: 1, surah: 1, ayah: 1 }` | Compound, non-unique. Supports `getVersesByJuz()` |
| **New Index** | `{ hizb: 1, surah: 1, ayah: 1 }` | Compound, non-unique. Supports `getVersesByHizb()` |
| **New Index** | `{ translation: "text" }` | Text index. Supports `$text` search replacing `$regex` |

**Projection changes** (query-time):
- `getVersesByJuz()`: exclude `_id, createdAt, updatedAt`
- `getVersesByHizb()`: exclude `_id, createdAt, updatedAt`

### Token (collection: `tokens`)

| Field | Type | Change |
|---|---|---|
| *(all existing fields unchanged)* | — | No schema changes |
| **New Index** | `{ LEM: 1, ROOT: 1 }` | Compound, non-unique. Supports autocomplete and search filter+projection |
| **New Index** | `{ POS: 1, ROOT: 1 }` | Compound, non-unique. Supports morphology filter optimization |

**Projection changes** (query-time):
- `searchTokens()` pre-`$facet`: project to `{surah, ayah, word, segment, form, ROOT, LEM, POS, tag}`
- `getAyahAnalysis()`: exclude unused boolean flags `{STEM, SUB, INC, RES, CIRC, REM, SUP, createdAt, updatedAt}`

### Word (collection: `words`)

No schema changes, no new indexes, no projection changes.

### Root (collection: `roots`)

No schema changes, no new indexes, no projection changes.

### RootMeaning (collection: `rootmeanings`)

No schema changes.

---

## New Entities

### Hot-Path Endpoint Set

**Purpose**: Documented list of endpoints in scope for performance hardening and regression gate.

| Attribute | Type | Description |
|---|---|---|
| id | string | Route pattern (e.g., `/surah/:s/ayah/:a`) |
| category | enum | `list` or `detail` (determines latency target) |
| trafficShare | number | Estimated % of total traffic |
| baselineP50 | number | Recorded P50 latency in ms |
| baselineP95 | number | Recorded P95 latency in ms |
| baselineDbQueries | number | Recorded median DB round-trips per request |

**Hot-path endpoints** (to be measured and populated during implementation):

| Endpoint | Category | Expected Traffic |
|---|---|---|
| `GET /api/v1/quran/surahs` | list | High |
| `GET /api/v1/quran/surahs/:number` | detail | High |
| `GET /api/v1/quran/surah/:s/ayah/:a` | detail | High |
| `GET /api/v1/quran/surah/:s/ayah/:a/word/:w` | detail | Medium |
| `GET /api/v1/quran/page/:page` | list | High |
| `GET /api/v1/search` | list | High |
| `GET /api/v1/search/lemmas` | list | Medium |
| `GET /api/v1/roots` | list | Medium |
| `GET /api/v1/roots/:root` | detail | Medium |
| `GET /api/v1/quran/surahs/:number/page/:page` | list | Medium |

**Relationships**: None — this is a configuration entity defining the scope of performance work.

### Performance Baseline (file: `tests/perf/baselines/baselines.json`)

**Purpose**: Recorded measurement against which future test runs are compared.

| Attribute | Type | Description |
|---|---|---|
| version | number | Schema version (currently 1) |
| generatedAt | string (ISO 8601) | When the baseline was measured |
| environment | string | CI environment description |
| scenarios | map | Keyed by endpoint pattern |
| scenarios[pattern].latencyP50 | number | P50 latency in ms |
| scenarios[pattern].latencyP95 | number | P95 latency in ms |
| scenarios[pattern].dbQueries | number | Median DB round-trips per request |

**State transitions**: Baseline is created → committed to git → compared against on each CI run → deliberately updated via `PERF_UPDATE_BASELINES=1` or auto-updated on merge to main.

**Validation rules**: 
- `version` must be 1
- All latency values must be positive numbers
- `dbQueries` must be non-negative integers

### Regression Threshold

**Purpose**: Tolerance band defining regression vs. noise.

| Attribute | Type | Description |
|---|---|---|
| latencyTolerancePercent | number | ±% tolerance on P50 and P95 latency (default: 25) |
| latencyAbsoluteFloorMs | number | Minimum latency increase in ms that triggers a regression (default: 50) |
| dbQueryTolerance | number | +N tolerance on DB query count (default: 1) |
| warmupRuns | number | Discarded runs before measurement (default: 3) |
| measuredRuns | number | Runs included in measurement (default: 5) |
| percentile | enum | Statistic for comparison: `median` (default) |

**Validation rules**: 
- `latencyTolerancePercent` must be 0-100
- `latencyAbsoluteFloorMs` must be > 0
- `dbQueryTolerance` must be ≥ 0
- `warmupRuns` must be ≥ 1
- `measuredRuns` must be ≥ 3

### Slow-Request Threshold (file: `src/plugins/request-logger.ts`)

**Purpose**: Per-endpoint threshold for emitting slow-request signals.

| Attribute | Type | Description |
|---|---|---|
| routePattern | string | Must match `request.routeOptions.url` |
| slowMs | number | Duration threshold in milliseconds |

**Default thresholds**:

| Route Pattern | Slow Threshold (ms) |
|---|---|
| `/search/morphology` | 3000 |
| `/search/verses` | 2000 |
| `/search/phrase` | 2500 |
| `/surah/:s/ayah/:a` | 500 |
| `/surahs` | 1000 |
| `/compare/surahs` | 3000 |
| `/compare/roots` | 3000 |
| *(default)* | 2000 |

**Validation rules**: 
- `slowMs` must be > 0
- `routePattern` must be a valid Fastify route pattern string

### Test Fixture Dataset

**Purpose**: Small, representative dataset for CI correctness and performance tests.

| Attribute | Type | Description |
|---|---|---|
| surahs | Surah[] | 3 surah documents (Al-Fatiha, Al-Ikhlas, Al-Baqarah metadata) |
| verses | Verse[] | ~25 verse documents |
| words | Word[] | ~250 word documents |
| tokens | Token[] | ~350 token documents |
| roots | Root[] | Roots appearing in the above tokens |
| seedCommand | string | `npm run test:seed` or `vitest setup` |

**Validation rules**: 
- Must include at least 2 surahs with different `revelation_place` values
- Must include verses spanning at least 2 juz values
- Must include tokens with varied POS values (at least N, V, PN)
- Must include roots with co-occurring patterns
- Total document count must stay under 1,000 for <1s seeding

### Single-Flight Cache Key

**Purpose**: In-process Map key for deduplicating concurrent identical reads.

| Attribute | Type | Description |
|---|---|---|
| key | string | Composite: `${prefix}:${params}` (e.g., `ayah:1:1`) |
| value | Promise\<T\> | The in-flight promise, deleted on settlement |

**State transitions**: None → Map entry created → Promise settles → Map entry deleted.

**Validation rules**: 
- Key must be deterministic for identical input parameters
- Map entry must be deleted regardless of promise outcome (resolve/reject)
- Map must not grow unboundedly (only hot-path, deterministic endpoints)

---

## Entity Relationship Summary

```
Hot-Path Endpoint Set ─────────────────────────────────┐
  │ (defines scope)                                     │
  ▼                                                     │
Performance Baseline ◄──── compares ──── Perf Gate     │
  │ (file: baselines.json)                              │
  │                                                     │
  ▼                                                     │
Regression Threshold ◄── reads by ── Perf Gate          │
  │ (embedded in gate.ts)                               │
                                                       │
Source Code Changes ◄──────────────────────────────────┘
  │
  ├── Model Indexes (surahs, verses, tokens)
  ├── Query Projections (all hot-path services)
  ├── Promise.all Parallelization (quran, roots services)
  ├── Single-Flight Dedup (src/utils/singleFlight.ts)
  ├── Request Logger Plugin (src/plugins/request-logger.ts)
  ├── DB Instrumentation (src/utils/observe.ts)
  └── App Factory (src/app.ts extraction)

Test Infrastructure New
  ├── Vitest Config (vitest.config.ts, vitest.workspace.ts)
  ├── Test Helpers (tests/helpers/)
  ├── Fixtures (tests/fixtures/)
  ├── Correctness Suite (tests/correctness/)
  ├── Perf Gate (tests/perf/)
  └── CI Workflow (.github/workflows/ci.yml)
```

---

## Index Addition Summary

| Collection | Index | Type | Purpose |
|---|---|---|---|
| `surahs` | `{ revelation_place: 1, revelation_order: 1 }` | Compound | `getSurahsByPlace()` |
| `verses` | `{ juz: 1, surah: 1, ayah: 1 }` | Compound | `getVersesByJuz()` |
| `verses` | `{ hizb: 1, surah: 1, ayah: 1 }` | Compound | `getVersesByHizb()` |
| `verses` | `{ translation: "text" }` | Text | `$text` search |
| `tokens` | `{ LEM: 1, ROOT: 1 }` | Compound | Autocomplete, search |
| `tokens` | `{ POS: 1, ROOT: 1 }` | Compound | Morphology filter |