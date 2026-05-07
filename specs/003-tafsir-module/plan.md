# Implementation Plan: Tafsir (Quranic Exegesis) Module

**Branch**: `003-tafsir-module` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-tafsir-module/spec.md`

## Summary

Add a self-contained `tafsir` module to the Quran API that serves scholarly commentary for any ayah from a registry of pluggable sources. v1 ships three Arabic plain-text sources (`muyassar`, `mukhtasar`, `tadabbur-wa-amal`) populated from `tafsir.app`. The fetch endpoint bundles every requested source into one response with an explicit `missing` list so a slow or absent source never stalls the bundle. The verse endpoint gains a thin `tafsir.sources` marker (slug list only — no body). Adding a fourth source is a data row plus an adapter file — no route, controller, or service edit.

Two collections (`TafsirSource`, `Tafsir`) support both single-ayah and verse-range shapes through one indexed query (`ayahStart ≤ N ≤ ayahEnd`). Ingestion is idempotent (upsert by `(sourceSlug, surah, ayahStart, ayahEnd)`), resumable, throttled, and CI-isolated (fixtures only, never the live host). Auth, OpenAPI registration, and the existing parity check apply unchanged.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js (ES modules, NodeNext resolution)
**Primary Dependencies**: Fastify 5.8, Mongoose 8.23, Zod 4 + `@asteasolutions/zod-to-openapi` 8.4, Vitest 3, `mongodb-memory-server` 10
**New Dependencies**: `@fastify/compress` (HTTP compression), `p-limit` (ingestion concurrency cap), `sanitize-html` + `@types/sanitize-html` (deferred until first HTML source — wired only when needed)
**Storage**: MongoDB (existing instance, `MONGO_URI`). Two new collections: `tafsirsources`, `tafsirs`.
**Testing**: Vitest unit + contract + parity. New: `tests/contract/tafsir/*`, `tests/scripts/tafsir/*` (recorded fixtures).
**Target Platform**: Linux/Windows server (Node ≥ 20, ESM)
**Project Type**: Single web-service project (Fastify REST API)
**Performance Goals**: p95 < 50 ms for cache-warm `/api/v1/tafsir/:s/:a` bundle of three sources; per-source DB lookup budget 800 ms (configurable), bundle budget = perSourceBudget + small overhead; verse-marker overhead < 5 ms per ayah (memoized coverage map).
**Constraints**: Tafsir routes MUST require `X-API-Key` (no new exempt paths); OpenAPI ↔ Fastify parity test must pass without test-code edits; tafsir bodies MUST NOT be embedded in `/api/v1/quran` payloads; CI MUST NOT depend on `tafsir.app` reachability.
**Scale/Scope**: ~6,236 ayahs × 3 sources × 1–3 KB ≈ 30–60 MB v1 storage; ≤ 4 routes added; one new CLI flag (`--tafsir <slug>`).

### Deviation from brief: route prefix

Brief proposes `/api/tafsir/...`. Existing modules are mounted under `/api/v1/...` in `src/app.ts:223-227`. The plan uses `/api/v1/tafsir/...` to match the existing prefix convention. All other architectural decisions in the brief are encoded as-is.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The repository constitution (`.specify/memory/constitution.md`) is the unfilled template — no project-specific principles have been ratified. In its absence the plan applies the de facto gates already enforced by CI and existing code:

| Gate | Status | Note |
|---|---|---|
| OpenAPI ↔ Fastify parity (every non-exempt route registered with `schema.summary`, params/query/zodResponse) | PASS by design | Routes registered via the same Zod-to-OpenAPI plumbing as other modules; parity test picks them up automatically. |
| Auth: no new exempt paths | PASS | Tafsir routes inherit `apiKeyPlugin` enforcement; contract test asserts 401 on missing/invalid key. |
| Module pattern parity | PASS | `src/modules/tafsir/{routes,controller,service}.ts` + `src/validators/tafsir.validator.ts` mirrors quran/search/roots/compare/stats. |
| Idempotent data scripts | PASS | Adapter upserts on `(sourceSlug, surah, ayahStart, ayahEnd)`; resume marker per surah. |
| No CI dependency on third-party host | PASS | Adapter tests use recorded JSON fixtures; live HTTP only at operator-triggered ingestion time. |
| Simplicity / YAGNI | PASS | Single fetch query covers single-ayah and range shapes; no separate "range source" code path; HTML sanitizer deferred until first HTML source is added. |

**Gate Result**: PASS. No complexity deviations to track.

## Project Structure

### Documentation (this feature)

```text
specs/003-tafsir-module/
├── plan.md              # This file
├── spec.md              # Feature specification (already authored)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── tafsir-sources.yaml
│   ├── tafsir-fetch.yaml
│   └── verse-marker.md
└── tasks.md             # Phase 2 output (NOT created here)
```

### Source Code (repository root)

```text
src/
├── app.ts                                        # +register tafsirRoutes, +register @fastify/compress
├── database/models/
│   ├── index.ts                                  # +export tafsir-source, tafsir
│   ├── tafsir-source.model.ts                    # NEW — TafsirSource schema
│   └── tafsir.model.ts                           # NEW — Tafsir schema
├── modules/tafsir/                               # NEW — module
│   ├── tafsir.routes.ts
│   ├── tafsir.controller.ts
│   └── tafsir.service.ts
├── modules/quran/quran.controller.ts             # +inject tafsir.sources marker on verse-returning handlers
├── validators/
│   └── tafsir.validator.ts                       # NEW — Zod schemas (params/query/responses)
├── scripts/
│   ├── index.ts                                  # +--tafsir <slug> dispatcher
│   └── tafsir/                                   # NEW
│       ├── runner.ts                             # shared upsert + resume + throttle
│       ├── client.ts                             # tafsir.app HTTP client (DI for tests)
│       ├── muyassar.ts                           # adapter — single-ayah, plain text
│       ├── mukhtasar.ts                          # adapter — single-ayah, plain text
│       └── tadabbur-wa-amal.ts                   # adapter — range, plain text
└── utils/cache.ts                                # unchanged; tafsir uses module-local memoization (matches lemma/root pattern)

tests/
├── contract/tafsir/
│   ├── sources.test.ts                           # list shape, ?language filter, 401 gate
│   ├── ayah.test.ts                              # bundle, missing[], range-block invariance, slow-source budget, 401 gate
│   └── verse-marker.test.ts                      # /api/v1/quran/...ayah... payload includes tafsir.sources slug list
├── scripts/tafsir/
│   ├── muyassar.test.ts                          # adapter normalization from recorded fixture
│   ├── mukhtasar.test.ts
│   ├── tadabbur-wa-amal.test.ts                  # range source: count → ayahEnd derivation
│   └── runner.test.ts                            # idempotency + resume from interrupted state (mocked client)
└── parity/                                        # unchanged — picks up new routes via onRoute hook
```

**Structure Decision**: Single project (the existing one). New code is additive: one new feature module under `src/modules/tafsir/`, three new Mongoose models (`tafsir-source`, `tafsir`, `tafsir-ingestion-state`), one validator file, one ingestion subdirectory, two new contract test directories. The only edits to existing files are (a) registering the new module + `@fastify/compress` in `src/app.ts`, (b) adding `--tafsir <slug>` (with `--register-only`, `--from <surah>`, `--restart` modifiers) to `src/scripts/index.ts`, (c) adding the `tafsir.sources` marker to the verse-returning handlers in `src/modules/quran/quran.controller.ts`, and (d) re-exporting the new models from `src/database/models/index.ts`.

**Scaffolding status (as of this revision)**: The module shell has already landed on the branch — `src/modules/tafsir/{routes,controller,service}.ts`, the three Mongoose models, `src/validators/tafsir.validator.ts`, `@fastify/compress` registration, and the `/api/v1/tafsir` mount in `src/app.ts:238` are in place. Phase 2 (`/speckit.tasks`) fills in the bodies (ingestion runner, adapters, ETag generation refinements, coverage-map invalidation by `generation`, fetch budget enforcement, contract tests) rather than re-scaffolding files that already exist.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| —         | —          | —                                    |

## Phase 0: Research

See [research.md](./research.md) for resolved decisions on: range-vs-single query unification, per-source bundle budget, in-process cache scope and invalidation, ETag derivation, ingestion resume strategy, and the deferral of `sanitize-html` until the first HTML source ships.

## Phase 1: Design & Contracts

Outputs:
- [data-model.md](./data-model.md) — `TafsirSource`, `Tafsir` schemas, indexes, validation rules, lookup query.
- [contracts/tafsir-sources.yaml](./contracts/tafsir-sources.yaml) — `GET /api/v1/tafsir/sources`.
- [contracts/tafsir-fetch.yaml](./contracts/tafsir-fetch.yaml) — `GET /api/v1/tafsir/:surah/:ayah`.
- [contracts/verse-marker.md](./contracts/verse-marker.md) — additive payload shape on existing verse endpoints.
- [quickstart.md](./quickstart.md) — operator + consumer walkthrough.
- Agent context updated via `.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude`.

**Re-evaluation of Constitution Check post-design**: PASS (no schema migration to existing collections; no auth-exempt addition; one query covers both source shapes; new dependencies are additive and minimal).

## Phase 2 (next command)

`/speckit.tasks` will translate these artifacts into a discrete task list. Not produced by this command.
