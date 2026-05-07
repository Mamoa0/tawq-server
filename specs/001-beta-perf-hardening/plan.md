# Implementation Plan: Beta Performance Hardening & Regression Safety Net

**Branch**: `001-beta-perf-hardening` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-beta-perf-hardening/spec.md`

## Summary

Establish a regression safety net and fix the worst hot-path performance issues so beta load doesn't melt MongoDB. The technical approach involves: (1) identifying hot-path endpoints, measuring baselines, and eliminating N+1 queries and missing indexes; (2) adding an automated correctness + performance regression test suite with Vitest; (3) adding structured request logging for observability. Key changes: parallelize sequential DB calls, add missing MongoDB indexes, implement request deduplication for concurrent identical reads, cap response sizes, and build a Vitest-based test suite with a performance gate.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 22 (ESM, NodeNext resolution)
**Primary Dependencies**: Fastify 5.8, Mongoose 8.23, Zod 4.3, @asteasolutions/zod-to-openapi 8.4, @fastify/rate-limit 10.3, @fastify/cors 11.2, @fastify/helmet 13.0
**Storage**: MongoDB (via Mongoose 8.23 ODM; most queries use native driver via `mongoose.connection.collection()`)
**Testing**: Vitest with @vitest/coverage-v8; mongodb-memory-server for local runs; GitHub Actions mongo:7 service container for CI
**Target Platform**: Linux server (Docker on node:22-alpine with tini), x86_64
**Project Type**: Web service (REST API)
**Performance Goals**: p95 < 300ms (list/paginate), p95 < 150ms (single resource), p99 < 800ms, error rate < 0.5%, MongoDB CPU < 70% avg / < 90% peak under beta load (~100-500 concurrent users, ~200 rps burst)
**Constraints**: Cold-start p95 < 2× warm target; test suite < 5 min CI run; no external paid services in default test profile; responses must remain backward-compatible
**Scale/Scope**: ~6,236 verses, ~77,430 words, ~128,760 tokens, ~1,800 roots; 5-10 hot-path endpoints; ~100-500 concurrent beta users

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution file (`memory/constitution.md`) is in template state with placeholder values. No concrete principles, sections, or governance rules have been ratified. This means:

- **No gates can fail** — there are no ratified constraints to violate
- **No complexity violations** — no principle limits on project count, testing approach, or abstraction patterns
- **Proceeding with reasonable defaults** derived from the spec and project context:

| Gate | Status | Notes |
|------|--------|-------|
| Principle compliance | PASS (no principles ratified) | Constitution is template-only; no gates to enforce |
| Testing mandate | PASS (no TDD mandate yet) | Spec requires test suite; Vitest recommended |
| Simplicity | PASS (no ratified complexity limit) | Proposed changes are additive, no architectural overhaul |
| Observability | PASS (no ratified standard) | Spec requires structured logging; Pino already in use |

**Post-Phase 1 re-check**: Re-evaluate if any design decisions conflict with subsequently ratified constitution principles.

## Project Structure

### Documentation (this feature)

```text
specs/001-beta-perf-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── app.ts                          # NEW — Fastify app factory (extracted from server.ts)
├── server.ts                    # Fastify bootstrap, rate limiting, hooks
├── config/
│   ├── env.ts                   # Zod-validated env config
│   └── hotpaths.ts              # NEW — hot-path endpoint set (FR-001 scope)
├── constants/
│   ├── buckwalter.map.ts
│   ├── sajda.map.ts
│   ├── form.map.ts
│   ├── gander.map.ts
│   ├── grammar.map.ts
│   └── number.map.ts
├── database/
│   ├── connection.ts            # Mongoose connection + raw DB access
│   └── models/
│       ├── surah.model.ts
│       ├── verse.model.ts
│       ├── word.model.ts
│       ├── token.model.ts
│       ├── root.model.ts
│       ├── root-meaning.model.ts
│       └── index.ts
├── docs/
│   ├── openapi.ts
│   └── routes.ts
├── middlewares/
│   └── error.middleware.ts
├── modules/
│   ├── quran/
│   │   ├── quran.routes.ts
│   │   ├── quran.controller.ts
│   │   └── quran.service.ts
│   ├── search/
│   │   ├── search.routes.ts
│   │   ├── search.controller.ts
│   │   └── search.service.ts
│   ├── roots/
│   │   ├── roots.routes.ts
│   │   ├── roots.service.ts
│   │   └── roots.model.ts
│   ├── compare/
│   │   ├── compare.routes.ts
│   │   ├── compare.controller.ts
│   │   └── compare.service.ts
│   └── stats/
│       ├── stats.routes.ts
│       └── stats.service.ts
├── plugins/
│   └── request-logger.ts           # NEW — onResponse structured logging
├── scripts/                     # Data seeding (out of perf scope)
│   └── ...
├── utils/
│   ├── arabicToBuckwalter.ts
│   ├── buckwalterToArabic.ts
│   ├── cache.ts
│   ├── singleFlight.ts            # NEW — concurrent request deduplication
│   ├── observe.ts                  # NEW — DB query observation wrapper
│   ├── reply.ts
│   └── validation.ts
└── validators/
    ├── quran.validator.ts
    ├── search.validator.ts
    ├── compare.validator.ts
    └── pagination.ts

tests/                           # NEW — to be created
├── correctness/                 # Correctness tests (contract, edge cases)
│   ├── quran/
│   ├── search/
│   ├── roots/
│   ├── compare/
│   ├── stats/
│   └── utils/
├── perf/                        # Performance regression gate
│   ├── baselines/
│   │   └── baselines.json
│   ├── gate.ts
│   ├── perf-runner.ts
│   └── scenarios/
│       ├── quran-hotpaths.perf.ts
│       ├── search-hotpaths.perf.ts
│       ├── roots-hotpaths.perf.ts
│       └── cold-start.perf.ts
├── helpers/
│   ├── app.ts
│   ├── setup.ts
│   └── query-tracker.ts
└── fixtures/
    └── seed.ts
```

**Structure Decision**: Single project (Option 1). The existing `src/` layout is preserved. A new `tests/` directory is added at the root for the test suite, following Node.js convention and separating test code from production code.

## Complexity Tracking

> No constitution violations — constitution is in template state. No entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |