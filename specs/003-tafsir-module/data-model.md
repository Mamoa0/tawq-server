# Phase 1 Data Model — Tafsir Module

Two new collections plus one tiny operational collection. No schema changes to existing collections.

## Collection: `tafsirsources`

Registry of every commentary source the API can serve. One row per source.

| Field        | Type                                | Required | Notes                                                   |
|--------------|-------------------------------------|----------|---------------------------------------------------------|
| `slug`       | `string`                            | yes      | Unique, kebab-case (`muyassar`, `mukhtasar`, …). Stable identifier; never changes. |
| `name`       | `{ ar?: string; en?: string }`      | yes      | Display name per language. At least one of `ar`/`en` MUST be set. |
| `author`     | `string`                            | yes      | Free-form attribution.                                  |
| `language`   | `'ar' \| 'en' \| string`            | yes      | BCP-47 short tag. v1 always `'ar'`.                     |
| `direction`  | `'rtl' \| 'ltr'`                    | yes      | Render hint for clients.                                |
| `format`     | `'text' \| 'html'`                  | yes      | v1 always `'text'`. Drives sanitizer behavior at ingest. |
| `grouping`   | `'ayah' \| 'range'`                 | yes      | Metadata only — fetch query is the same for both.       |
| `homepage`   | `string \| undefined`               | no       | Optional URL.                                           |
| `license`    | `string \| undefined`               | no       | SPDX or free-form.                                      |
| `ingestedAt` | `Date`                              | yes      | Bumped at the end of every successful ingestion run for that slug. Drives ETag and cache invalidation. |
| `generation` | `number`                            | yes      | Monotonic counter incremented on every successful ingest. Used as cache-key prefix (R4). |
| `createdAt`  | `Date` (timestamps)                 | auto     | Mongoose `{ timestamps: true }`.                        |
| `updatedAt`  | `Date` (timestamps)                 | auto     |                                                         |

**Indexes**:
- `{ slug: 1 }` unique
- `{ language: 1 }` (for `?language=ar` filter on the list endpoint)

**Validation rules**:
- `slug` matches `/^[a-z0-9](-?[a-z0-9])*$/`.
- `name.ar` or `name.en` is non-empty.
- `format ∈ {'text','html'}`; `direction ∈ {'rtl','ltr'}`; `grouping ∈ {'ayah','range'}`.

## Collection: `tafsirs`

One row per `(source, surah, ayahStart, ayahEnd)` tuple.

| Field        | Type     | Required | Notes                                                                              |
|--------------|----------|----------|------------------------------------------------------------------------------------|
| `sourceSlug` | `string` | yes      | References `TafsirSource.slug`. Not a hard FK (Mongo) but enforced at read.        |
| `surah`      | `number` | yes      | 1–114.                                                                             |
| `ayahStart`  | `number` | yes      | 1-based ayah number. For single-ayah sources, equals `ayahEnd`.                    |
| `ayahEnd`    | `number` | yes      | `>= ayahStart`. For range sources, derived from `ayahs_start + count - 1` upstream. |
| `text`       | `string` | yes      | Body. Plain text for v1. For HTML sources (future), sanitized at ingest.           |
| `ingestedAt` | `Date`   | yes      | Time of last upsert from upstream. Used to compute ETag.                           |
| `createdAt`  | `Date`   | auto     |                                                                                    |
| `updatedAt`  | `Date`   | auto     |                                                                                    |

**Indexes**:
- `{ sourceSlug: 1, surah: 1, ayahStart: 1, ayahEnd: 1 }` unique — enforces idempotency of re-ingestion.
- The same compound index serves the lookup query (no second non-unique index needed).

**Lookup query (one shape covers both grouping kinds)**:
```js
TafsirModel.findOne({
  sourceSlug,
  surah,
  ayahStart: { $lte: N },
  ayahEnd:   { $gte: N }
}).lean();
```

**Validation rules**:
- `surah ∈ [1,114]`.
- `ayahStart ∈ [1, ayahCountFor(surah)]`, `ayahEnd ∈ [ayahStart, ayahCountFor(surah)]`. The `ayahCountFor(surah)` mapping lives in `src/modules/tafsir/tafsir.service.ts` as the `AYAH_COUNTS` const (114-entry literal). Same constant is consumed by both ingestion-side validation and the request-time `validateSurahAyah` helper used by the fetch controller.
- `text.length > 0` (FR-020 — empty bodies are not stored).

## Collection: `tafsir_ingestion_state` (operational metadata)

Per-source resume marker **and concurrent-run lock** for the ingestion runner. Not exposed by any route.

| Field                | Type             | Required | Notes                                                                                          |
|----------------------|------------------|----------|------------------------------------------------------------------------------------------------|
| `sourceSlug`         | `string`         | yes      | Unique.                                                                                        |
| `lastSurahCompleted` | `number`         | yes      | 0 if no surah has completed; otherwise 1–114.                                                  |
| `runningSince`       | `Date \| null`   | yes      | `null` when no run is active. Set to `now()` at run start, cleared to `null` on completion or abort. Drives FR-020b concurrent-run rejection. |
| `runId`              | `string \| null` | yes      | UUID assigned at run start, cleared at end. Lets a stale-lock force-clear (`--unlock`) target a specific run. |
| `updatedAt`          | `Date`           | yes      |                                                                                                |

**Index**: `{ sourceSlug: 1 }` unique.

**Lock semantics (FR-020b)**:
- Run start atomically claims the lock via `findOneAndUpdate({ sourceSlug, runningSince: null }, { $set: { runningSince: now, runId: uuid } }, { upsert: true })`. If the document exists with `runningSince !== null`, the update matches zero docs and the runner exits with a clear error.
- Run end (success, error, or signal handler) clears the lock with `findOneAndUpdate({ sourceSlug, runId }, { $set: { runningSince: null, runId: null } })`.
- Stale-lock recovery: a run started more than `TAFSIR_LOCK_STALE_MS` ago (default 6 h) is treated as stale; operator runs `--unlock <slug>` to clear it.

## Relationships

```
TafsirSource (1) ─── slug ───► (many) Tafsir
TafsirSource (1) ─── slug ───► (1)    TafsirIngestionState
```

`Verse` (existing) is augmented at *response time only* — no new field on the persisted document. The verse-endpoint marker is computed from a coverage map built off `tafsirs` (see research.md R10).

## State transitions

`Tafsir` document lifecycle:

```
[absent] ──ingest upsert──► [present]
[present] ──ingest upsert with new text──► [present, text updated]
[present] ──no longer in upstream──► [stays present]   (no deletion in v1)
```

`TafsirSource.generation`:

```
generation = N
  ──successful --tafsir <slug> run──► generation = N+1
                                       ingestedAt = now
                                       in-process cache entries with prefix
                                       "<slug>|N|..." become unreachable
```

## Derived shapes (for the API contract)

These are not persisted — they are computed by the controller from the collections above.

```ts
// GET /api/v1/tafsir/sources response item
type SourceListItem = Pick<TafsirSource,
  'slug' | 'name' | 'author' | 'language' | 'direction' | 'format' | 'grouping'
>;

// GET /api/v1/tafsir/:surah/:ayah response
type FetchResponse = {
  surah: number;
  ayah: number;
  results: Array<{
    source: Pick<TafsirSource, 'slug' | 'name' | 'language' | 'direction' | 'format'>;
    ayahStart: number;
    ayahEnd: number;
    text: string;
  }>;
  missing: string[]; // requested slugs that had no covering entry, were unknown, or exceeded the per-source budget
};

// Verse-endpoint marker (additive on existing payloads)
type AyahTafsirMarker = { sources: string[] }; // empty array, never null/omitted
```
