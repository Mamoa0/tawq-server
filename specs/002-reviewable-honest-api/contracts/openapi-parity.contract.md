# Contract: OpenAPI Parity

**Feature**: `002-reviewable-honest-api` · **Satisfies**: FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014

The `openapi-parity` CI job asserts that `/openapi.json` is a truthful, complete inventory of the routes the running server serves. This document is the contract that job enforces.

---

## 1. Route inventory equality (FR-008, FR-009)

Let `A = canonical(fastify.printRoutes())` and `B = canonical(routes emitted in /openapi.json)`, where `canonical` applies the rules in §4.

- `A \ B` MUST be `∅` — every Fastify-registered route appears in the spec.
- `B \ A` MUST be `∅` — every spec entry corresponds to a registered route.
- Exempt-path allowlist (see `research.md` R6): `/health`, `/ready` are excluded from both sets before comparison (infrastructure, not public contract). `/reference`, `/reference/*`, `/openapi.json` are excluded because they are the docs themselves.

Failure message format (per route):

```text
[missing-from-spec]  GET  /api/v1/quran/surahs/{number}/pages
[missing-from-code]  POST /api/v1/roots
```

## 2. Response schema truthfulness (FR-010)

For each route in `A ∩ B`, the parity test:

1. Issues a representative successful request (fixtures committed under `tests/fixtures/parity/`).
2. Captures the actual response body.
3. Validates it against the `responses["200"].content["application/json"].schema` entry in `/openapi.json`.

All three steps MUST succeed. A 200 response that does not validate against its declared schema is a parity failure.

Allowed deviations (explicitly):

- Extra fields in the response that are NOT in the declared schema — FAIL (declared response is a closed shape).
- Fields in the declared schema marked `required` that are missing in the response — FAIL.
- Fields in the declared schema marked optional that are missing in the response — PASS.

## 3. Parameter schema truthfulness (FR-011)

For each route in `A ∩ B`, the parity test compares:

- Path parameter schemas declared in `/openapi.json` (`parameters[].in === "path"`) vs. the Zod `params` schema attached to the Fastify route definition.
- Query parameter schemas (`parameters[].in === "query"`) vs. the Zod `querystring` schema.
- Request body schemas (`requestBody.content["application/json"].schema`) vs. the Zod `body` schema.

"Equivalence" means:

- Same set of top-level field names.
- Same required/optional markings on each field.
- Same primitive types (`string`, `number`, `integer`, `boolean`) — enum member equality where applicable.
- For object-valued fields, recursive equivalence.

Differences in descriptions, examples, or unused keywords (`title`, `deprecated: false`) are ignored.

## 4. Canonicalization rules

Applied identically to both `A` and `B` before diffing:

| Rule | Example |
|---|---|
| HTTP method lowercased | `GET` → `get` |
| Trailing slash stripped (except bare `/`) | `/api/roots/` → `/api/roots` |
| Path parameters normalized to `{name}` | `/api/surahs/:number` → `/api/surahs/{number}` |
| Consecutive slashes collapsed | `/api//roots` → `/api/roots` |
| Host/base URL removed | full URL → path-only |

## 5. Security declaration parity (FR-012)

Already specified in `auth.contract.md` §7. The `tests/parity/security-declaration.test.ts` test cross-references the runtime auth-plugin exempt list against the `security` entries in `/openapi.json`:

- A route in the exempt allowlist MUST have `security: []` (or no `security` key) in the spec.
- A route NOT in the exempt allowlist MUST have `security: [{ ApiKeyAuth: [] }]` in the spec.
- Any mismatch is a parity failure.

## 6. CI integration (FR-013, FR-014)

- Job name: `openapi-parity` (matches `.github/required-checks.yml`).
- Runs on: every pull request, every push to `main`.
- Blocks merge on failure (via branch protection).
- Emits a human-readable report as a GitHub Actions job summary (Markdown) listing, per category (`missing-from-spec`, `missing-from-code`, `response-schema-drift`, `parameter-schema-drift`, `security-drift`), each affected route with the concrete diff.

## 7. Update procedure

When a route is added, removed, or renamed, the PR MUST include the corresponding update to the route handler's Zod schemas. Because route registration uses `fastify-type-provider-zod`, the OpenAPI document is regenerated automatically and no separate spec edit is needed. The parity job catches any author who bypasses the type provider (e.g., raw `app.get(path, handler)` without `schema`).

## 8. Parity test inventory (`tests/parity/`)

| Test file | Clause | What it proves |
|---|---|---|
| `fastify-vs-openapi.test.ts` | §1 | Inventory equality |
| `response-schema.test.ts` | §2 | Sample responses validate against declared schema |
| `parameter-schema.test.ts` | §3 | Request schemas match |
| `security-declaration.test.ts` | §5 | Security scheme references agree with runtime exemption list |
| `canonicalization.test.ts` | §4 | Unit tests for the canonicalization helper itself |

All tests run under Vitest in the `openapi-parity` CI job. Job wall time target: **< 10 s** (one Fastify boot + one spec generation + one pass over routes).
