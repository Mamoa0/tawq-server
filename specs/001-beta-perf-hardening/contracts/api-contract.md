# API Contract: Beta Performance Hardening

**Branch**: `001-beta-perf-hardening` | **Date**: 2026-04-24

## Contract Stability Guarantees

All changes in this feature are **backward-compatible**. No existing response shapes, field names, ordering, or pagination semantics will change. The contract documents:

1. **Performance-invisible changes**: Internal query optimization, caching, and parallelization that do NOT alter the external API contract
2. **New headers**: Added to responses for observability
3. **Constraint changes**: Tighter server-side limits on previously unbounded parameters

---

## 1. Response Headers (New)

### 1.1 Slow-Request Indicator

All hot-path endpoints now include a `X-Response-Time` header (already exists) and structured log emission. No new HTTP response headers are added for the slow-request signal — it is emitted via Pino log at `warn` level only.

**Existing headers (unchanged)**:
- `X-Response-Time: <ms>` — present on all responses
- `X-Request-Id: <uuid>` — present on all responses
- `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After` — present on rate-limited responses

---

## 2. Endpoint Constraint Changes

### 2.1 Search Token Limit Reduction

| Endpoint | Parameter | Before | After |
|---|---|---|---|
| `GET /api/v1/search` | `limit` | max 100, default 20 | max 50, default 20 |
| `GET /api/v1/search/morphology` | `limit` | max 100, default 20 | max 50, default 20 |

**Rationale**: The `searchTokens` self-join pipeline scales O(limit × ayah_token_count). Capping at 50 prevents O(500+) pipeline lookups per request.

**Backward compatibility**: Clients sending `limit=51-100` will receive a **400 Bad Request** with Zod validation error instead of a slower response. This is a **breaking constraint change** but within acceptable bounds since:
- The spec states responses must be bounded (FR-004)
- Clients requesting >50 tokens per page are likely misusing the API
- Pagination offset (`page` parameter) is unaffected

### 2.2 Batch Verse Limit Cap

| Endpoint | Parameter | Before | After |
|---|---|---|---|
| `GET /api/v1/quran/verses` | `refs` (query body) | No cap | max 50 references |

**Rationale**: `getVersesBatch()` constructs an `$or` query with one clause per reference. Uncapped, this allows O(10,000) clause MongoDB queries. Capped at 50.

**Backward compatibility**: Clients sending >50 references will receive a **400 Bad Request**. This is a new validation constraint (FR-004).

---

## 3. Unchanged API Contracts

The following endpoint contracts remain **exactly** as they are today. No field additions, removals, or type changes:

| Method | Path | Response Shape | Pagination |
|---|---|---|---|
| GET | `/api/v1/quran/surahs` | `{ data: Surah[] }` | Paginated (page/limit) |
| GET | `/api/v1/quran/surahs/:number` | `{ data: Surah }` | N/A |
| GET | `/api/v1/quran/surahs/:number/page/:page` | `{ data: Verse[], meta }` | Paginated |
| GET | `/api/v1/quran/surah/:s/ayah/:a` | `{ data: { verse, words } }` | N/A |
| GET | `/api/v1/quran/surah/:s/ayah/:a/word/:w` | `{ data: WordDetail }` | N/A |
| GET | `/api/v1/quran/page/:page` | `{ data: Verse[] }` | N/A |
| GET | `/api/v1/quran/juz/:juz` | `{ data: Verse[] }` | N/A |
| GET | `/api/v1/quran/hizb/:hizb` | `{ data: Verse[] }` | N/A |
| GET | `/api/v1/roots` | `{ data: string[], meta }` | Paginated |
| GET | `/api/v1/roots/:root` | `{ data: RootDetail }` | N/A |
| GET | `/api/v1/search` | `{ data: TokenResult[], meta }` | Paginated |
| GET | `/api/v1/search/lemmas` | `{ data: string[], meta }` | Paginated |

**Field order** within response objects may change due to projection changes, but **all fields** currently returned will continue to be returned. This means:
- Fields excluded by projection are only `_id`, `createdAt`, `updatedAt`, and unused morphological flags
- No field that a client currently consumes will be removed

---

## 4. Correctness Test Contract

The correctness test suite validates API contracts. Each test corresponds to an endpoint's contract:

### 4.1 Surah Endpoints

```
GET /api/v1/quran/surahs
  → 200, { data: Surah[] }
  → Surah objects contain: number, name_arabic, name_simple, verses_count, revelation_place
  → Sorted by number ascending
  → Paginated with page/limit, default limit=100

GET /api/v1/quran/surahs/:number
  → 200, { data: Surah } for valid number (1-114)
  → 404 for invalid number
  → 400 for non-numeric number

GET /api/v1/quran/surahs/:number/page/:page
  → 200, { data: Verse[], meta } for valid number and page
  → 404 for surah not found
  → 400 for page out of range (1-604)
```

### 4.2 Verse/Word/Token Endpoints

```
GET /api/v1/quran/surah/:s/ayah/:a
  → 200, { data: { verse, words } }
  → verse contains: surah, ayah, arabic, translation, page
  → words is array sorted by word number
  → 404 for non-existent (surah, ayah) combination

GET /api/v1/quran/surah/:s/ayah/:a/word/:w
  → 200, { data: { word, tokens } }
  → tokens is array sorted by segment number
  → Each token contains: form, POS, ROOT, LEM

GET /api/v1/quran/page/:page
  → 200, { data: Verse[] }
  → Verses sorted by surah, then ayah
```

### 4.3 Search Endpoints

```
GET /api/v1/search?POS=N&limit=20
  → 200, { data: TokenResult[], meta }
  → meta contains page, limit, totalCount, totalPages
  → limit capped at 50 (was 100)

GET /api/v1/search/lemmas
  → 200, { data: string[], meta }
  → Lemmas sorted alphabetically

GET /api/v1/search/lemmas/autocomplete?q=ktb
  → 200, { data: string[] }
  → Max 100 results
```

### 4.4 Root Endpoints

```
GET /api/v1/roots
  → 200, { data: string[], meta }
  → Paginated, default limit=100

GET /api/v1/roots/:root
  → 200, { data: RootDetail }
  → RootDetail contains: root, meaning, lemmas, forms, count, surahs_count
  → 404 for non-existent root

GET /api/v1/roots/:root/occurrences
  → 200, { data: Occurrence[] }
```

### 4.5 Edge Case Tests

```
Arabic ↔ Buckwalter round-trip:
  → arabicToBuckwalter(buckwalterToArabic(str)) === str for valid Arabic
  → buckwalterToArabic(arabicToBuckwalter(str)) === str for valid Buckwalter
  → Handles tashkeel (diacritics) without corruption
  → Handles empty string
  → Handles already-transliterated input

Pagination boundaries:
  → page=1 returns first page
  → page=totalPages returns last page
  → page=0 returns 400 validation error
  → page=999999 returns empty data with totalCount still accurate

Search with broad filters:
  → Search with no filters returns paginated results (not unbounded)
  → Search with limit > 50 returns 400 validation error
  → Search with limit=0 returns 400 validation error
```

---

## 5. Performance Gate Contract

The performance gate compares measured results against baselines:

### 5.1 Baseline Format

```json
{
  "version": 1,
  "generatedAt": "2026-04-24T00:00:00Z",
  "environment": "ci-environment-description",
  "scenarios": {
    "GET /api/v1/quran/surahs": {
      "latencyP50": 18,
      "latencyP95": 45,
      "dbQueries": 1
    }
  }
}
```

### 5.2 Gate Rules

| Metric | Threshold | Failure Condition |
|---|---|---|
| P50 latency | baseline × 1.25 OR baseline + 50ms (whichever is greater) | Observed P50 > max(baseline P50 × 1.25, baseline P50 + 50ms) |
| P95 latency | baseline × 1.25 OR baseline + 50ms (whichever is greater) | Observed P95 > max(baseline P95 × 1.25, baseline P95 + 50ms) |
| DB queries | baseline + 1 | Observed queries > baseline queries + 1 |

### 5.3 Measurement Protocol

- 3 warmup runs (discarded)
- 5 measured runs
- Report median of measured values
- Sequential execution (no parallelism)

### 5.4 Baseline Update Process

1. **Automated**: On merge to `main`, CI regenerates baselines and commits with `[skip ci]` message
2. **Manual**: Developer runs `PERF_UPDATE_BASELINES=1 npm run test:perf -- --update`, reviews diff, commits

---

## 6. Observability Contract

### 6.1 Structured Log Line Format

Every hot-path request emits one structured log line on completion:

```json
{
  "level": 30,
  "time": 1713945600000,
  "reqId": "uuid-v4",
  "endpoint": "/surah/:s/ayah/:a",
  "status": 200,
  "durationMs": 45,
  "slowThreshold": 500,
  "slow": false,
  "dbQueryCount": 2,
  "dbTimeMs": 38,
  "msg": "request completed"
}
```

Slow requests emit at `warn` level (level: 40) with `"slow": true` and `"msg": "slow request"`.

### 6.2 Fields

| Field | Type | Always Present | Description |
|---|---|---|---|
| reqId | string | Yes | Correlation ID (from `x-request-id` or generated) |
| endpoint | string | Yes | Fastify route pattern (not raw URL) |
| status | number | Yes | HTTP status code |
| durationMs | number | Yes | Total request duration in ms (from `reply.elapsedTime`) |
| slowThreshold | number | Yes | Configured slow threshold for this endpoint |
| slow | boolean | Yes | `true` if `durationMs > slowThreshold` |
| dbQueryCount | number | No* | Number of DB round-trips in this request |
| dbTimeMs | number | No* | Total DB time in this request |

*`dbQueryCount` and `dbTimeMs` are present only for endpoints wrapped with `observeDb()`.