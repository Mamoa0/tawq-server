# Correctness Test Contract: Buckwalter ↔ Arabic Conversion

**Branch**: `001-beta-perf-hardening` | **Date**: 2026-04-24

## Utility Under Test

- `arabicToBuckwalter(arabic: string): string` — `src/utils/arabicToBuckwalter.ts`
- `buckwalterToArabic(buckwalter: string): string` — `src/utils/buckwalterToArabic.ts`

## Contract Rules

### Rule 1: Round-Trip Identity

For all valid Arabic input strings containing only characters in `BUCKWALTER_MAP`:

```
buckwalterToArabic(arabicToBuckwalter(arabic)) === arabic
```

For all valid Buckwalter input strings containing only ASCII characters in the Buckwalter alphabet:

```
arabicToBuckwalter(buckwalterToArabic(buckwalter)) === buckwalter
```

### Rule 2: Tashkeel (Diacritics) Handling

- Arabic strings with fathah (َ), dammah (ُ), kasrah (ِ), shaddah (ّ), sukūn (ْ), and other diacritical marks must be handled without corruption
- Characters not in the Buckwalter map pass through unchanged in both directions
- The LRU caches (5,000 entries each) must not affect correctness — only performance

### Rule 3: Empty and Boundary Input

- `arabicToBuckwalter("")` → `""`
- `buckwalterToArabic("")` → `""`
- Input with mixed Arabic + ASCII passes through non-map characters unchanged

### Rule 4: Deterministic Output

Given the same input, both functions must always produce the same output regardless of:
- Cache state (cold vs warm)
- Number of prior calls
- Concurrent access

## Test Cases

| Test Name | Input | Expected Output |
|---|---|---|
| round-trip Arabic | `"بسم"` | `"بسم"` after both conversions |
| round-trip Buckwalter | `"bsm"` | `"bsm"` after both conversions |
| empty string | `""` | `""` |
| tashkeel preservation | `"بِسْمِ"` | round-trips to `"بِسْمِ"` (tashkeel preserved) |
| unknown char passthrough | `"abc123"` | `"abc123"` (ASCII unchanged) |
| LRU cache correctness | 5,001 unique inputs | last 5,000 cached correctly, first evicted re-computed |
| root lookup integration | Root `"ktb"` → Arabic → Buckwalter | ✅ matches original `"ktb"` |

## Integration with Root Lookups

The `arabicToBuckwalter` function is used in root-related endpoints to convert Arabic root parameters to Buckwalter format for MongoDB queries. The correctness of these endpoints depends on:

1. Arabic input → Buckwalter conversion is correct
2. Buckwalter root → MongoDB query returns expected document
3. Response includes the correct Arabic root name

Test coverage must include end-to-end scenarios like:
- `GET /api/v1/roots/كتب` — Arabic root parameter
- `GET /api/v1/roots/ktb` — Buckwalter root parameter
- Both must return the same root document