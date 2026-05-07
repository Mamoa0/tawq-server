# Implementation Plan: Reviewable Changes & Honest API Contract

**Branch**: `002-reviewable-honest-api` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-reviewable-honest-api/spec.md`

## Summary

Deliver three independently-reviewable invariants: (1) invalid API keys return HTTP 401 via a new lightweight authentication plugin, (2) `/openapi.json` is a truthful inventory of every implemented endpoint enforced by a CI parity check, and (3) `main` is protected so changes only land through green pull requests. The technical approach avoids a heavy auth system: API keys are opaque strings stored as HMAC-SHA-256 digests in a new Mongoose model, validated via a Fastify `preHandler` hook that exempts the docs endpoints. OpenAPI drift is eliminated by migrating route registration to `fastify-type-provider-zod` (single registration for both routing and OpenAPI), supplemented by a parity test that diffs Fastify's runtime `printRoutes()` output against the generated spec. Branch protection is configured via a version-controlled GitHub Ruleset documented in `.github/branch-protection.yml` plus a CI job that verifies the live repo settings match the file on every push to main.

## Technical Context

**Language/Version**: TypeScript 5.9, Node.js 22 (ESM, NodeNext resolution)
**Primary Dependencies**: Fastify 5.8, Mongoose 8.23, Zod 4.3, `@asteasolutions/zod-to-openapi` 8.4, `@fastify/rate-limit` 10.3, `@scalar/fastify-api-reference` 1.46; **new**: `fastify-type-provider-zod` (runtime; for route/spec unification), `@octokit/rest` (dev-only; branch-protection verification), `mongodb-memory-server` (dev-only; test isolation seam for `buildTestApp()`)
**Storage**: MongoDB via Mongoose; **new** `api_keys` collection with unique index on `hashedKey`
**Testing**: Vitest (from 001) with contract tests under `tests/correctness/` and new parity tests under `tests/parity/`. Test isolation uses `mongodb-memory-server` (devDependency, owned by this feature — added explicitly here so the feature is not silently dependent on whether 001 introduced it). Tests connect via the env override `MONGO_URI_TEST` resolved by `buildTestApp()`.
**Target Platform**: Linux server (Docker on `node:22-alpine`), x86_64
**Project Type**: Web service (REST API)
**Performance Goals**: Auth lookup < 50 ms p99 per request; parity test runs in < 10 s; no additional latency on authenticated hot-path endpoints beyond the O(1) key lookup. Under invalid-key flood (rate-limited), MongoDB `api_keys` query volume per minute MUST remain within ±10% of its no-attack baseline — verified in Phase 6 polish (SC-010)
**Constraints**: Zero new runtime dependencies outside those listed; no change to existing response shapes; docs endpoints (`/reference`, `/openapi.json`) unauthenticated; preserves backward compatibility with anonymous callers
**Scale/Scope**: ~20 existing routes (to be fully inventoried in research), ~10–50 API keys in v1 (manual provisioning), 1 protected branch (`main`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution file (`.specify/memory/constitution.md`) is in template state with placeholder values. No concrete principles, sections, or governance rules have been ratified.

| Gate | Status | Notes |
|------|--------|-------|
| Principle compliance | PASS (no principles ratified) | Constitution is template-only |
| Testing mandate | PASS | Feature mandates contract + parity tests; aligns with 001's Vitest suite |
| Simplicity | PASS | Additive: one Mongoose model, one plugin, one CI job, one YAML config file |
| Observability | PASS | Auth failures emit structured log records with correlation IDs (reuses 001's request logger) |
| Security | PASS | API keys hashed before storage; no plaintext comparison; rate-limited invalid attempts |

**Post-Phase 1 re-check**: see bottom of this file.

## Project Structure

### Documentation (this feature)

```text
specs/002-reviewable-honest-api/
├── plan.md                  # This file
├── research.md              # Phase 0 output
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output
├── contracts/               # Phase 1 output
│   ├── auth.contract.md
│   ├── openapi-parity.contract.md
│   └── branch-protection.contract.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
.github/
├── workflows/
│   ├── ci.yml                         # EXISTING (from 001) — adds parity + auth contract jobs
│   └── branch-protection-check.yml    # NEW — verifies live rules match .github/branch-protection.yml
├── branch-protection.yml              # NEW — version-controlled required-checks + review rules
└── required-checks.yml                # NEW — single source of truth for required CI job names

src/
├── server.ts                          # MODIFIED — registers api-key plugin, switches to fastify-type-provider-zod
├── config/
│   └── env.ts                         # MODIFIED — adds API_KEY_PEPPER, API_KEY_HEADER
├── database/
│   └── models/
│       └── api-key.model.ts           # NEW — Mongoose model, hashedKey unique index
├── docs/
│   ├── openapi.ts                     # MODIFIED — accepts security schemes
│   └── routes.ts                      # REPLACED — route registration folded into module routes files via type provider
├── middlewares/
│   └── error.middleware.ts            # MODIFIED — ensures 401 responses use stable error body
├── modules/
│   ├── quran/quran.routes.ts          # MODIFIED — route declaration carries Zod schemas; OpenAPI derived automatically
│   ├── search/search.routes.ts        # MODIFIED — same
│   ├── roots/roots.routes.ts          # MODIFIED — same
│   ├── compare/compare.routes.ts      # MODIFIED — same
│   └── stats/stats.routes.ts          # MODIFIED — same
├── plugins/
│   └── api-key.plugin.ts              # NEW — Fastify preHandler that validates X-API-Key, exempts docs
└── services/
    └── api-key.service.ts             # NEW — key validation logic, HMAC digest, O(1) lookup

tests/
├── parity/                            # NEW
│   ├── canonicalization.test.ts       # FR-008, FR-009 (helper unit test)
│   ├── fastify-vs-openapi.test.ts     # FR-008, FR-009
│   ├── response-schema.test.ts        # FR-010
│   ├── parameter-schema.test.ts       # FR-011
│   ├── security-declaration.test.ts   # FR-012
│   ├── parity-reporter.test.ts        # FR-014 (forced-drift fixtures → categorized report)
│   ├── required-checks.test.ts        # FR-019
│   └── no-registerRoutes.test.ts      # regression guard for type-provider migration
├── contract/auth/                     # NEW
│   ├── invalid-key.test.ts            # FR-002, FR-004
│   ├── empty-key.test.ts              # FR-003
│   ├── exempt-endpoints.test.ts       # FR-006
│   ├── rate-limited-invalid.test.ts   # FR-005
│   ├── valid-key.test.ts              # FR-001 (positive path + key context on public endpoints)
│   ├── no-leak.test.ts                # FR-004
│   └── transport-only-header.test.ts  # FR-001 (rejects key via query/body)
├── unit/                              # NEW
│   ├── hmac.test.ts                   # src/utils/hmac.ts
│   └── verify-branch-protection.test.ts  # scripts/verify-branch-protection.ts
├── fixtures/
│   └── parity/                        # per-route representative request payloads (FR-010)
└── helpers/
    ├── app.ts                         # buildTestApp() factory seam
    └── test-keys.ts                   # Test fixture helper for seeding API keys

scripts/
└── verify-branch-protection.ts        # NEW — GitHub API check driven by .github/branch-protection.yml
```

**Structure Decision**: Single project (Option 1). The existing `src/` layout is preserved. This feature adds **one** Mongoose model, **one** Fastify plugin, **one** service, **one** new test directory (`tests/parity/`), and **three** `.github/` configuration files. Route registration changes are in-place edits to existing `*.routes.ts` files — no new module directories. The `tests/` directory is expected to already exist from 001; if 001 has not landed, this feature stands it up.

## Complexity Tracking

> No constitution violations — constitution is in template state. No entries needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none)    | —          | —                                   |

## Post-Phase 1 Re-check

To be completed after `data-model.md`, `contracts/`, and `quickstart.md` are generated. Expected gates (principle compliance, simplicity, observability, security) remain PASS — the Phase 1 design keeps the feature additive, reuses existing request-logger and rate-limiter, and introduces no new external dependencies beyond those listed in Technical Context.

**Result after Phase 1**: All gates PASS. See `research.md` for the concrete trade-off analysis behind each design choice; see `contracts/` for the externally-observable contracts the feature commits to.
