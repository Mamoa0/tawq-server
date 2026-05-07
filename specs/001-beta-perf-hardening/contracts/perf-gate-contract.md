# Performance Gate Contract: Baselines & Thresholds

**Branch**: `001-beta-perf-hardening` | **Date**: 2026-04-24

## Baseline Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["version", "generatedAt", "scenarios"],
  "properties": {
    "version": { "type": "integer", "const": 1 },
    "generatedAt": { "type": "string", "format": "date-time" },
    "environment": { "type": "string" },
    "scenarios": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["latencyP50", "latencyP95", "dbQueries"],
        "properties": {
          "latencyP50": { "type": "number", "exclusiveMinimum": 0 },
          "latencyP95": { "type": "number", "exclusiveMinimum": 0 },
          "dbQueries": { "type": "integer", "minimum": 0 }
        }
      }
    }
  }
}
```

## Regression Threshold Configuration

```typescript
interface RegressionThreshold {
  latencyTolerancePercent: number;   // default: 25
  latencyAbsoluteFloorMs: number;    // default: 50 — minimum latency increase that triggers regression
  dbQueryTolerance: number;          // default: 1
  warmupRuns: number;                // default: 3
  measuredRuns: number;              // default: 5
  statisticPercentile: number;       // default: 50 (median)
}
```

## Gate Output Report Schema

```markdown
# Performance Gate Report

| Endpoint | P50 (ms) | Baseline P50 | P95 (ms) | Baseline P95 | DB Queries | Baseline Queries | Status |
|---|---|---|---|---|---|---|---|
| GET /api/v1/quran/surahs | 18.2 | 18 | 44.5 | 45 | 1 | 1 | PASS |

ALL CHECKS PASSED
```

or

```markdown
# Performance Gate Report

| Endpoint | P50 (ms) | Baseline P50 | P95 (ms) | Baseline P95 | DB Queries | Baseline Queries | Status |
|---|---|---|---|---|---|---|---|
| GET /api/v1/quran/surahs/:number | 62.1 | 25 | 145.3 | 55 | 4 | 2 | FAIL |

**GET /api/v1/quran/surahs/:number REGRESSIONS:**
- P50 latency: 62.1ms exceeds baseline 25ms (threshold: max(25×1.25, 25+50ms) = 50ms)
- DB queries: 4 exceeds baseline 2 (max allowed: 3)

SOME CHECKS FAILED
```

## Baseline Update Protocol

1. **Never edit `baselines.json` manually** without running the perf suite against a seeded database
2. **Always run `PERF_UPDATE_BASELINES=1 npm run test:perf -- --update`** to regenerate baselines
3. **Review the diff** before committing — baselines should decrease (improvement) or stay the same, not increase
4. **Commit message format**: `perf: update baselines [reason]` or `chore(perf): update baselines [skip ci]`

## Scenario Identification

Scenarios are keyed by the Fastify route pattern (from `request.routeOptions.url`), not the raw URL. This normalizes parameterized routes:

| Raw URL Example | Scenario Key |
|---|---|
| `/api/v1/quran/surahs/1` | `/surahs/:number` |
| `/api/v1/quran/surah/1/ayah/1` | `/surah/:s/ayah/:a` |
| `/api/v1/search?POS=N&limit=20` | `/` (under `/api/v1/search` prefix) |