# Quickstart: Beta Performance Hardening & Regression Safety Net

**Branch**: `001-beta-perf-hardening` | **Date**: 2026-04-24

## Prerequisites

- Node.js 22+
- MongoDB 7+ (local or Docker)
- npm

## Setup

```bash
# Install dependencies (including new dev dependencies)
npm install

# Ensure MongoDB is running
# Local: mongod running on localhost:27017
# Docker: docker run -d -p 27017:27017 mongo:7

# Seed the database (if not already done)
node --loader ts-node/esm src/scripts/index.ts --surahs
node --loader ts-node/esm src/scripts/index.ts --verses
node --loader ts-node/esm src/scripts/index.ts --words
node --loader ts-node/esm src/scripts/index.ts --tokens
node --loader ts-node/esm src/scripts/index.ts --roots
node --loader ts-node/esm src/scripts/index.ts --verify
```

## Running the Test Suite

```bash
# Run all tests (correctness + performance gate)
npm test

# Run only correctness tests
npm run test:correctness

# Run only the performance regression gate
npm run test:perf

# Run tests in watch mode (correctness only)
npm run test:watch

# Run with coverage report
npm run test:coverage

# Update performance baselines (run deliberately when perf improves)
npm run test:perf:update
```

### Test Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `MONGO_URI` | `mongodb://localhost:27017/quran_test` | Test database connection |
| `PORT` | `5001` | Test server port |
| `NODE_ENV` | `test` | Environment mode |
| `CORS_ORIGIN` | `*` | CORS origin for tests |
| `PERF_UPDATE_BASELINES` | `0` | Set to `1` to update baselines instead of comparing |

## Running in CI (GitHub Actions)

The CI workflow (`.github/workflows/ci.yml`) handles:

1. **Type check**: `npx tsc --noEmit`
2. **Correctness tests**: `npm run test:correctness`
3. **Performance gate**: `npm run test:perf`
4. **Upload perf report**: On failure, uploads `tests/perf/perf-report.md` as an artifact

The CI uses a MongoDB service container; no local MongoDB needed.

## Updating Performance Baselines

Baselines should be updated when:

1. **A legitimate performance improvement** is merged — CI auto-updates on `main`
2. **A schema or index change** affects query plans — developer manually updates:
   ```bash
   PERF_UPDATE_BASELINES=1 npm run test:perf
   # Review the diff in tests/perf/baselines/baselines.json
   git add tests/perf/baselines/baselines.json
   git commit -m "perf: update baselines for new index on verses.juz"
   ```
3. **Never update baselines to mask a regression** — the tolerance band (±25% on latency, +1 on DB queries) handles normal CI variance

## Key Architecture Decisions

### App Factory Pattern

Production entry point (`src/server.ts`) calls `createApp()` from `src/app.ts`. Tests use the same factory without `listen()`:

```typescript
// Production: src/server.ts
import { createApp } from "./app.js";
const app = await createApp({ logger: true });
// ... connect DB, listen

// Tests: tests/helpers/app.ts
import { createApp } from "../../src/app.js";
const app = await createApp({ logger: false });
await app.ready();
const response = await app.inject({ method: "GET", url: "/api/v1/quran/surahs" });
```

### Single-Flight Deduplication

Hot-path endpoints use `singleFlight()` to prevent duplicate DB work on concurrent identical requests:

```typescript
import { singleFlight } from "../../utils/singleFlight.js";

export async function getAyahWithWords(surah: number, ayah: number) {
  return singleFlight(`ayah:${surah}:${ayah}`, async () => {
    // ... parallelized DB queries
  });
}
```

### Performance Observability

Every hot-path request emits a structured log line. Slow requests emit at `warn` level:

```json
{"level":40,"reqId":"abc","endpoint":"/surah/:s/ayah/:a","status":200,"durationMs":650,"slowThreshold":500,"slow":true,"msg":"slow request"}
```

Search logs for slow requests: `grep '"slow":true'` or filter in log aggregation tools.

### DB Query Tracking

Controllers wrap service calls with `observeDb()` to track per-request DB round-trips:

```typescript
const result = await observeDb(request, "getAyahWithWords", () =>
  quranService.getAyahWithWords(surah, ayah),
);
```

This data appears in structured logs as `dbQueryCount` and `dbTimeMs` fields.

## Project Structure (New Files)

```
src/
├── app.ts                          # NEW — extracted Fastify app factory
├── plugins/
│   └── request-logger.ts           # NEW — onResponse structured logging
├── utils/
│   ├── singleFlight.ts             # NEW — concurrent request deduplication
│   └── observe.ts                  # NEW — DB query observation wrapper
├── database/models/
│   ├── surah.model.ts              # MODIFIED — new index
│   ├── verse.model.ts             # MODIFIED — new indexes
│   └── token.model.ts             # MODIFIED — new indexes
├── modules/quran/quran.service.ts  # MODIFIED — Promise.all, projections
├── modules/search/search.service.ts # MODIFIED — searchTokens fix, limit cap
├── modules/roots/roots.service.ts   # MODIFIED — Promise.all, singleFlight
├── modules/compare/compare.service.ts # MODIFIED — Promise.all
└── server.ts                       # MODIFIED — uses createApp, plugins

tests/
├── helpers/
│   ├── app.ts                      # NEW — test app factory
│   ├── setup.ts                    # NEW — Vitest global setup
│   └── query-tracker.ts           # NEW — DB query counter
├── fixtures/
│   └── seed.ts                     # NEW — test dataset seeder
├── correctness/
│   ├── quran.test.ts              # NEW — surah, verse, word, token tests
│   ├── search.test.ts             # NEW — search, lemmas, morphology tests
│   ├── roots.test.ts              # NEW — root endpoint tests
│   ├── compare.test.ts            # NEW — comparison endpoint tests
│   ├── stats.test.ts              # NEW — global stats tests
│   └── utils/
│       └── buckwalter.test.ts      # NEW — conversion edge cases
├── perf/
│   ├── baselines/
│   │   └── baselines.json          # NEW — committed baseline file
│   ├── gate.ts                     # NEW — comparison & report logic
│   ├── perf-runner.ts              # NEW — scenario orchestration
│   ├── scenarios/
│   │   ├── quran-hotpaths.perf.ts   # NEW — quran perf scenarios
│   │   ├── search-hotpaths.perf.ts  # NEW — search perf scenarios
│   │   └── roots-hotpaths.perf.ts   # NEW — roots perf scenarios
│   └── vitest.config.ts            # NEW — perf project config
├── correctness/vitest.config.ts    # NEW — correctness project config
vitest.config.ts                    # NEW — root config
vitest.workspace.ts                 # NEW — workspace definition
.github/workflows/ci.yml            # NEW — CI pipeline
```

## Troubleshooting

### Tests fail with "Connection refused" on MongoDB

Ensure MongoDB is running: `mongosh --eval "db.runCommand({ping:1})"` or start Docker container.

### Performance gate failures on CI

1. Check the `perf-report.md` artifact for which endpoints regressed
2. Compare observed values against baselines + 25% tolerance
3. If the regression is legitimate, fix the code, don't update baselines
4. If CI variance, re-run the workflow (tolerance should handle normal variance)

### Baselines need updating after code change

```bash
PERF_UPDATE_BASELINES=1 npm run test:perf
# Review: git diff tests/perf/baselines/baselines.json
# Commit if values are reasonable (should decrease or stay flat)
```