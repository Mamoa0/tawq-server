# Contract: Verse-endpoint tafsir marker

## Scope

Additive payload shape on this **explicit** list of verse-returning routes under `/api/v1/quran`:

- `GET /api/v1/quran/surah/:s/ayah/:a`
- `GET /api/v1/quran/surah/:s/ayah/:a/navigation`
- `GET /api/v1/quran/surahs/:number/page/:page`
- `GET /api/v1/quran/page/:page`
- `GET /api/v1/quran/juz/:juz`
- `GET /api/v1/quran/hizb/:hizb`
- `GET /api/v1/quran/verses` (batch)
- `GET /api/v1/quran/random`
- `GET /api/v1/quran/daily`

The list above is authoritative. Adding a tenth verse-returning route in the future is an explicit decision: update this contract first, then the route. The contract test enumerates these nine endpoints by name (no reflective discovery) so coverage is visible in CI.

## Shape

Every ayah object in the response gains exactly one new property:

```json
{
  "tafsir": {
    "sources": ["muyassar", "mukhtasar", "tadabbur-wa-amal"]
  }
}
```

- `tafsir.sources` is an `Array<string>` of source slugs that have a stored entry covering the ayah.
- The array MUST be present on every ayah object (FR-014). It MUST NOT be `null` and the property MUST NOT be omitted.
- The array MUST be empty (`[]`) when no source has a covering entry.
- Slugs are sorted by the `tafsirsources.slug` natural order (alphabetical) so the response is byte-stable.
- `tafsir` carries no body content — only the slug list. Adding fields like `text`, `excerpt`, or `count` is out of scope and prohibited (FR-013).

## Computation

The marker is computed from a process-local coverage map keyed by `(surah, ayah) → Set<slug>`, built lazily on first request and invalidated by the per-source generation counter (see research.md R10). Per-ayah lookup is `O(1)` after the first build.

## Auth & OpenAPI

No change. The verse routes already require `X-API-Key` and are already registered with the parity check. The added `tafsir` field is documented by extending each route's `zodResponse` to include the new property.

## Backwards compatibility

Additive only. No existing field changes shape. Existing consumers that ignore unknown fields continue to work.
