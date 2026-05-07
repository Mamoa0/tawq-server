# Feature Specification: Reviewable Changes & Honest API Contract

**Feature Branch**: `002-reviewable-honest-api`
**Created**: 2026-04-25
**Status**: Draft
**Input**: User description: "Make every change reviewable. Make the API documentation honest. Definition of done: CI green on main, `/openapi.json` lists every implemented endpoint, invalid API keys return 401."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invalid API keys are rejected with 401 (Priority: P1)

Consumers of the Quran API that choose to authenticate (today anonymously, later via API key) must be able to distinguish between "you're not authenticated correctly" (their fault, fixable by fixing the key) and every other class of failure. Today the API has no auth surface at all, so a caller who sends an API-key header gets silently ignored. That is neither honest nor debuggable. When a caller sends an API key, the server must either accept it or reject it with a clear 401.

**Why this priority**: This is the single externally-observable security primitive in the Definition of Done. Getting it wrong silently accepts credentials that should be rejected — the worst possible class of auth bug. It is also the only story that introduces net-new request-handling behavior, so the risk of regression must be bounded early.

**Independent Test**: Register a valid API key; issue three requests to any endpoint — one with the valid key, one with a deliberately wrong key, one with no key at all. Confirm the valid key succeeds, the wrong key returns 401 with a consistent error body, and the missing-key request behaves according to the documented anonymous-access policy. No other stories need to ship for this to deliver value.

**Acceptance Scenarios**:

1. **Given** a registered, active API key, **When** a caller sends it in the designated header on any endpoint in scope, **Then** the request is processed normally and the response contains no auth-error indicator.
2. **Given** an API key that does not exist in the key registry, **When** a caller sends it in the designated header, **Then** the response is HTTP 401 with a stable, documented error body (error code, human message, correlation identifier).
3. **Given** an API key that was previously active but is now revoked or expired, **When** a caller sends it, **Then** the response is HTTP 401 (not 403 and not a silent success).
4. **Given** a caller supplies the auth header with an empty or whitespace-only value, **When** the server processes the request, **Then** the response is HTTP 401 — an empty credential is not equivalent to "no credential".
5. **Given** a caller makes repeated requests with invalid keys, **When** the count exceeds the configured rate-limit threshold, **Then** subsequent invalid-key attempts are rate-limited (429) without the server issuing a database lookup for each attempt.

---

### User Story 2 - `/openapi.json` is a truthful inventory of every implemented endpoint (Priority: P2)

API consumers and tooling (Scalar UI, codegen clients, contract tests) rely on `/openapi.json` to discover what the server can do. Today the published spec drifts from reality: routes exist in code that aren't in the spec, and response shapes declared in the spec don't always match what handlers return. An honest spec is the foundation for every external integration. Without it, "the docs said X" becomes a support burden and an incident vector.

**Why this priority**: This is a trust primitive for every API consumer. Drift between spec and implementation causes consumer bugs that the server team then has to debug. Fixing drift once, and gating it in CI so it cannot regress, eliminates a whole class of support tickets.

**Independent Test**: After registration of all route modules on a fresh server start, compare Fastify's internal route list (method + path pairs) to the routes emitted in `/openapi.json`. Confirm the two sets are equal. Then for each route, validate a sample successful response against the declared response schema. Both comparisons must match exactly.

**Acceptance Scenarios**:

1. **Given** the server has completed startup and all modules are registered, **When** `/openapi.json` is fetched, **Then** every method+path combination registered on the Fastify instance appears in the spec, and no method+path appears in the spec that is not registered.
2. **Given** an endpoint is added, removed, or renamed in the implementation, **When** CI runs on the PR, **Then** the parity check fails unless `/openapi.json` is updated in the same change.
3. **Given** an endpoint's successful response payload, **When** validated against the response schema declared in `/openapi.json`, **Then** the validation passes for every endpoint in scope.
4. **Given** an endpoint accepts query, path, or body parameters, **When** the declared parameter schema is compared to the handler's validator, **Then** the two are structurally equivalent (same field names, required-ness, and types).
5. **Given** an endpoint requires authentication, **When** its entry in `/openapi.json` is inspected, **Then** the entry declares a matching `security` requirement; public endpoints declare no security requirement.

---

### User Story 3 - Every merge to main is gated by green CI (Priority: P3)

For any of the above to stay true over time, the team cannot rely on discipline alone. "Main is green" must be a machine-enforced invariant: a pull request cannot merge to main while any required CI check is failing, and no one can push directly to main to bypass the check. This story builds on the CI pipeline delivered by feature 001 and adds the enforcement layer.

**Why this priority**: This is the meta-requirement that keeps the other two honest. It is last because the previous feature (001) already stood up the CI pipeline itself — what's missing is the branch-protection enforcement plus a visible signal of health. Without this, Stories 1 and 2 can silently regress the next time someone merges without running CI.

**Independent Test**: Attempt to push directly to main with a trivial change and confirm the push is rejected. Open a PR with a deliberate test failure and confirm the "Merge" button is disabled until the failing check is fixed. A health badge (in the README or equivalent) reflects the main branch's latest CI status within 5 minutes of workflow completion (see SC-008 for the bound and rationale).

**Acceptance Scenarios**:

1. **Given** a contributor with write access, **When** they attempt `git push origin main` with any change, **Then** the push is rejected by the remote because branch protection requires a pull request.
2. **Given** an open pull request targeting main with one or more required checks failing, **When** a reviewer attempts to merge it, **Then** the merge is blocked until the failing checks pass.
3. **Given** a pull request targeting main, **When** CI runs, **Then** the set of required checks includes at minimum: the correctness suite from feature 001, the OpenAPI parity check from Story 2, and the auth contract check from Story 1.
4. **Given** a new commit is pushed to a PR branch, **When** the branch is behind main, **Then** the PR cannot merge until it is brought up to date with main (or a configured equivalent policy).
5. **Given** a merge to main completes, **When** the main-branch CI run finishes, **Then** the public status badge reflects the result within 5 minutes (see SC-008 for the mechanism and rationale).

---

### Edge Cases

- **Auth header on an unauthenticated endpoint**: a caller sends a valid API key on a public endpoint — the key is still honored (for quota / identification), never silently stripped.
- **Auth header on the docs endpoints themselves** (`/reference`, `/openapi.json`): these endpoints are exempt from auth so clients can always discover the contract; an invalid key on these endpoints is ignored, not rejected with 401.
- **Route registered without OpenAPI metadata**: adding a route via `fastify.get(...)` with no Zod schema must cause the parity check to fail — "undocumented by accident" is indistinguishable from "undocumented on purpose" at the consumer.
- **Route declared in OpenAPI but not registered**: a stale entry in the spec (copy-paste remnant, deleted route) must cause the parity check to fail.
- **Case sensitivity and trailing slashes in paths**: the parity check treats paths canonically so that `/api/roots` and `/api/roots/` do not falsely report drift.
- **Parameter schema drift**: a handler validator that accepts `page: number` while the OpenAPI spec declares `page: string` must be treated as drift, not a cosmetic mismatch.
- **Required check list gets out of sync**: when a new CI job is added, branch protection must be updated to include it in required checks; the team needs a checkable source of truth for the required-check list.
- **Branch protection bypass by admins**: repository admins can usually override branch protection — this must be explicitly forbidden by policy (branch-protection rule applied to admins).
- **Rate limiting of bad keys**: a caller brute-forcing keys must not degrade service or exhaust database lookups; bad-key 401s are cheap and rate-limited.
- **Flapping badge**: the main-branch health badge must not flicker because of transient check queueing delays; it reflects the latest completed main-branch workflow result.

## Requirements *(mandatory)*

### Functional Requirements

#### API key authentication

- **FR-001**: The system MUST accept an API key transmitted ONLY via the `X-API-Key` request header. The system MUST NOT read the API key from query strings, request bodies, cookies, `Authorization`-family headers, or any other source. A key supplied exclusively via query string or body MUST be treated as if no key were supplied (request processed as anonymous, not authenticated). When a valid key accompanies a request to a non-exempt endpoint, the server MUST attach the resolved key context to the request (for downstream quota / identification) and MUST NOT silently strip it, including for public read endpoints.
- **FR-002**: When an API key is supplied and does not match an active entry in the key registry, the system MUST return HTTP 401 with a stable, documented error body containing: (a) `error`: the literal string `"InvalidApiKey"` (client-stable discriminator), (b) `message`: a generic human-readable string that MUST NOT vary by failure reason, and (c) `requestId`: the correlation UUID also present in server logs. The internal failure reason (one of: `unknown`, `revoked`, `expired`, `empty`, `malformed`) is recorded in logs only and MUST NEVER appear in the response body. The canonical body shape is defined in `contracts/auth.contract.md` §4.
- **FR-003**: When an API key is supplied with an empty or whitespace-only value, the system MUST treat it as invalid and return HTTP 401 (not fall through to anonymous access).
- **FR-004**: Revoked or expired API keys MUST produce a 401 response whose body is byte-identical (excluding `requestId`) to the body returned for an unknown key; the response MUST NOT leak whether a given key once existed.
- **FR-005**: API key validation MUST complete in O(1) database work per request (single indexed lookup, cached in-process where safe) and MUST be rate-limited so that a caller hammering invalid keys cannot exhaust the database. The specific threshold (30 failed attempts per bucket per 5 minutes) and bucket key — `"badkey:" + client-ip + ":" + firstEightHexCharsOfSha256(suppliedKey)` (an irreversible hashed prefix, NOT the plaintext key prefix) — are defined authoritatively in `contracts/auth.contract.md` §5 and are part of the externally-observable contract.
- **FR-006**: The docs and infrastructure endpoints MUST be reachable without authentication. The canonical exempt set is `GET /openapi.json`, `GET /reference` and all paths under `/reference/*`, `GET /health`, and `GET /ready` — defined authoritatively in `contracts/auth.contract.md` §2. An invalid, empty, revoked, or expired `X-API-Key` header supplied to any exempt endpoint MUST NOT alter the response (no 401, no side effects).
- **FR-007**: The system MUST document (in `/openapi.json` via a `security` scheme) how API keys are supplied; consumer tooling (Scalar UI, codegen) MUST display it.

#### OpenAPI parity (honest documentation)

- **FR-008**: `/openapi.json` MUST include every method+path combination registered on the running Fastify instance at server startup; no registered route may be absent from the emitted spec.
- **FR-009**: `/openapi.json` MUST NOT include any method+path combination that is not registered on the running instance; stale entries are a failure.
- **FR-010**: For each endpoint, the declared success response schema in `/openapi.json` MUST validate against a real response produced by the handler in the correctness test suite; mismatch fails CI.
- **FR-011**: For each endpoint, the declared query, path, and body parameter schemas in `/openapi.json` MUST be structurally equivalent (field names, required-ness, types) to the validators the handler actually uses.
- **FR-012**: Every endpoint that requires authentication MUST declare a matching `security` requirement in its OpenAPI operation; every public endpoint MUST declare no `security` requirement. Mismatch fails CI.
- **FR-013**: The parity check MUST execute as an automated CI job on every pull request and every push to `main`, and its exit status MUST drive a required check. (FR-016 separately requires that the required-check list be version-controlled; this requirement is about the job itself running and producing a pass/fail signal.)
- **FR-014**: On failure, the parity check MUST produce a human-readable report (rendered to the CI job summary and to stdout) that groups findings into exactly these categories — `missing-from-spec`, `missing-from-code`, `response-schema-drift`, `parameter-schema-drift`, `security-drift` — and, for each affected route under each category, lists the method+path and the concrete diff (what the spec says vs. what the code says). An empty category MUST be omitted from the report; a non-empty category MUST list every affected route individually (not a truncated summary). The report format is verified by an automated test using a forced-drift fixture, so accidental regressions in the reporter itself are caught.

#### Reviewability (CI gating on main)

- **FR-015**: The `main` branch MUST be protected so that direct pushes are rejected by the remote and changes land only via pull requests.
- **FR-016**: The `main` branch's protection rules MUST require all required CI checks to pass before merge; at minimum the required checks are: the correctness suite (from 001), the performance regression gate (from 001), the OpenAPI parity check (Story 2), and the auth contract check (Story 1).
- **FR-017**: The `main` branch's protection rules MUST require at least one approving review and MUST apply the same rules to repository administrators in normal operation (no routine admin bypass; `enforce_admins: true`). An emergency-bypass procedure MAY exist (see FR-020) but MUST be an auditable, time-bounded exception — not a standing allowance — and MUST leave a record that the next scheduled drift check will surface if the bypass is not reverted.
- **FR-018**: A visible, up-to-date status signal (CI badge in the project README or equivalent) MUST reflect the latest completed main-branch CI result. The target refresh time is within 5 minutes of workflow completion (see SC-008 for the bound and rationale). The badge MUST NOT remain stuck on a prior result after the next main-branch workflow concludes.
- **FR-019**: The project MUST include a single, version-controlled source of truth listing the currently required CI checks so that when a new job is added, the team can detect missing branch-protection updates in review rather than after regression.
- **FR-020**: The project MUST document (in the contributing guide or equivalent) how to update required-check configuration and how to request a branch-protection bypass for a genuine emergency, including who can grant it and the follow-up review obligation.

### Key Entities *(include if feature involves data)*

- **API key**: an opaque string credential, stored server-side with metadata — identifier, status (active / revoked / expired), owner or label, creation and revocation timestamps. Lookups are by the hashed key value (indexed). The plaintext key is shown once at creation time and never persisted in plaintext.
- **Route inventory**: the canonical set of method+path pairs known to the running server. Derived from Fastify's `printRoutes` / route registry at startup. Used as the ground truth for the OpenAPI parity check.
- **Required CI check list**: a version-controlled declaration (e.g., a YAML or JSON file committed to the repo) of which CI job names are required for merge to main. Serves as the reference the parity / configuration check compares against.
- **Branch protection rule**: an external GitHub-side configuration governing the `main` branch. Not stored in the repository itself but its expected state is documented and can be diffed against actual state via the GitHub API.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Fastify-registered routes are present in `/openapi.json`, and 100% of `/openapi.json` entries correspond to a registered route, verified by an automated parity test on every CI run.
- **SC-002**: 100% of endpoints in scope return HTTP 401 (not 200, not 403, not 500) when presented with an invalid, revoked, empty, or whitespace-only API key, verified by contract tests against every endpoint.
- **SC-003**: 0 direct pushes to `main` succeed over a 30-day rolling window after branch protection goes live.
- **SC-004**: 0 pull requests are merged to `main` while any required check is failing or pending, over a 30-day rolling window.
- **SC-005**: Invalid-key rejection responds in under 50 ms at p99 under the same load profile used in feature 001.
- **SC-006**: Every endpoint in `/openapi.json` that declares authentication has a matching server-side enforcement, and every endpoint without an OpenAPI security requirement accepts anonymous access — verified automatically, failures block merge.
- **SC-007**: A deliberately-introduced drift — a new route without an OpenAPI entry, a stale OpenAPI entry for a deleted route, or a mismatched parameter schema — is caught by CI within the same build, not by a downstream consumer.
- **SC-008**: The public main-branch health signal reflects the latest completed main-branch CI result within 5 minutes of completion (best-effort on GitHub's default workflow badge; the 5-minute bound accounts for GitHub's shields/badge refresh cadence), observable by a contributor without logging in. The signal MUST NOT remain stuck on a previous green/red state after the next main-branch workflow concludes.
- **SC-009**: A new contributor following the contributing guide can, within 10 minutes of reading it, identify which CI checks are required for merge and how to request an emergency bypass.
- **SC-010**: API key enumeration via rate-limited invalid attempts does not cause MongoDB CPU or query volume to deviate measurably from baseline — verified by repeating the measurement from feature 001 while invalid-key traffic is present.

## Assumptions

- **API key transport**: keys are supplied via the `X-API-Key` HTTP header. `Authorization: Bearer <token>` is not used in v1 to keep the scheme distinct from future session-based auth and to avoid accidental parsing by middleware that treats `Authorization` as OAuth2.
- **Auth posture**: API key authentication is **optional** on currently-public read endpoints; a valid key is an identity/quota mechanism, not a gate. Invalid or empty keys are always rejected (401) regardless of endpoint. Mandatory-auth endpoints, if any, are declared individually via OpenAPI `security` and enforced server-side.
- **Key storage**: keys are persisted in a MongoDB collection with an index on the hashed key value; plaintext is not stored. Self-service signup, key rotation tooling, and quota accounting are out of scope for this feature — keys are provisioned manually by an administrator.
- **OpenAPI generation**: the existing `@asteasolutions/zod-to-openapi` + Zod validators remain the source of truth for the spec; the parity check compares Fastify's runtime route list to the emitted spec plus validates the schemas the codebase already declares.
- **CI provider & gate stack**: GitHub Actions, per feature 001. Branch-protection rules are configured in the GitHub repository settings; their expected state is documented in the repo but the settings themselves are applied by a repository administrator.
- **Main branch**: `main` is the protected, always-deployable branch. `001-beta-perf-hardening` is expected to merge to main before or alongside this feature so that the correctness and performance gates referenced in FR-016 are available as required checks.
- **Dependencies on 001**: this feature depends on 001 having landed the correctness suite and performance regression gate; if 001 is in flight, this feature's required-check list is added incrementally as 001's checks become available.
- **Admin bypass policy**: admins cannot bypass branch protection in normal operation. An emergency-bypass procedure exists but requires a post-hoc review within one business day, documented in the contributing guide.
- **Public exemptions**: the Scalar UI at `/reference`, `/openapi.json`, and health / readiness endpoints are explicitly exempt from auth.
- **Out of scope**: user accounts, sessions, OAuth2, JWTs, self-service key provisioning / rotation UI, per-key quota accounting, write-path endpoints (the API remains read-only in this feature), and enforcement of auth on write endpoints that do not yet exist.
