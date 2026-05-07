# Feature Specification: Beta Performance Hardening & Regression Safety Net

**Feature Branch**: `001-beta-perf-hardening`
**Created**: 2026-04-24
**Status**: Draft
**Input**: User description: "Establish a regression safety net and fix the worst hot-path performance issues so beta load doesn't melt MongoDB."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Beta traffic on hot-path endpoints stays responsive (Priority: P1)

During the beta, end users browse Surahs, read verses page-by-page, open word/token details, and run token-level searches. These read-heavy flows currently put disproportionate load on MongoDB — a small number of endpoints account for the majority of traffic and the majority of database work. Under realistic beta concurrency, latency must stay within targets and the database must not become the bottleneck that degrades every other request.

**Why this priority**: Beta launch is imminent. If the database saturates, the entire API becomes unusable for every user, not just the feature that triggered it. This is the single highest-impact, time-sensitive risk to a successful beta.

**Independent Test**: Run a load profile representative of beta traffic (mix biased toward verse-reading and search) against a pre-production environment using a full copy of production data. Confirm target latency and stability without any other changes from this feature.

**Acceptance Scenarios**:

1. **Given** beta-representative load on the top read endpoints (surah listing, verses by page/juz/hizb, word/token detail, search, roots listing), **When** sustained for 30 minutes at the target concurrency, **Then** p95 response time meets targets per endpoint class (see Success Criteria) and the error rate stays below 0.5%.
2. **Given** a cold-cache start (no in-process memoization warmed), **When** the top read endpoints are hit at target concurrency, **Then** MongoDB CPU stays below 70% average and no single query dominates the slow-query log.
3. **Given** two users requesting the same popular resource concurrently (e.g., the same Surah page), **When** the resource is cacheable, **Then** the system services both requests without duplicating the underlying database work.
4. **Given** a request that previously issued many sequential or N+1 database round-trips, **When** the same request is made after hardening, **Then** the number of database round-trips per request is materially reduced and measurably lower than before.

---

### User Story 2 - Automated regression safety net catches breakage before it ships (Priority: P1)

Today there is no automated test suite. Any change can silently break correctness (e.g., morphological filters, Arabic/Buckwalter conversion, pagination) or silently regress performance (e.g., a new query without an index). The team needs a safety net that runs on every change and blocks merges that break critical behavior or materially slow down hot-path endpoints.

**Why this priority**: Without this, every performance fix from Story 1 is at risk of silent regression the next time someone touches the code. The perf work only stays valuable if it's defended.

**Independent Test**: Intentionally introduce a known-bad change on a branch (e.g., remove an index hint, break a Buckwalter conversion edge case, break a filter) and confirm the safety net fails the build before merge.

**Acceptance Scenarios**:

1. **Given** a pull request that changes any module under `src/modules/`, `src/services/`, or `src/utils/`, **When** CI runs, **Then** the correctness test suite executes and must pass before the PR can be merged.
2. **Given** a change that causes a hot-path endpoint's measured response time or database round-trip count to exceed the agreed regression threshold, **When** CI runs the performance gate, **Then** the build fails with a clear message identifying the regressed endpoint and metric.
3. **Given** a change to Arabic/Buckwalter transliteration helpers, pagination logic, or search filters, **When** CI runs, **Then** dedicated tests covering edge cases (empty input, diacritics, multi-segment tokens, boundary pages) execute and fail if behavior changes unexpectedly.
4. **Given** a fresh checkout, **When** a developer runs the project's standard test command locally, **Then** the same suite runs without requiring credentials to external paid services.

---

### User Story 3 - Ops can see hot-path health in production (Priority: P2)

When beta is live, the team needs to see which endpoints are hot, which are slow, and when MongoDB is under pressure — without SSH-ing into the database. Basic visibility turns "the site feels slow" into an actionable signal.

**Why this priority**: Important but not launch-blocking. Without it, an incident takes longer to diagnose, but the beta can still launch and most problems will be caught by the safety net before they reach production.

**Independent Test**: Generate a burst of traffic that exceeds a defined slow-query threshold on one endpoint. Confirm the operator can identify the offending endpoint and query pattern from available telemetry within five minutes, without restarting the service.

**Acceptance Scenarios**:

1. **Given** a request that exceeds 500ms (the slow-endpoint threshold), **When** it completes, **Then** a structured record is emitted containing at minimum: endpoint, status, duration, and a correlation identifier.
2. **Given** a spike in database load, **When** an operator inspects the available telemetry, **Then** they can rank endpoints by contribution to database work for the spike window.

---

### Edge Cases

- **Cold start / empty caches**: the in-process memoization for lemmas and roots starts empty after every deploy or restart. Targets must hold in the cold case, not just the warm case.
- **Pagination boundaries**: requests for the first page, the last page, and out-of-range pages must remain bounded in cost and correct.
- **Large result sets**: root/lemma listings and search results with unusually high match counts must not materialize unbounded arrays in memory or return unbounded payloads.
- **Buckwalter ↔ Arabic round-trip**: inputs with tashkeel (diacritics), edge characters, or already-transliterated content must be handled deterministically; regressions here corrupt every downstream lookup.
- **Concurrent identical requests**: bursts of identical popular requests (e.g., everyone opening Surah Al-Fatiha at once) must not multiply database work linearly.
- **Abusive / malformed input**: oversized query strings, deeply nested filters, or pathologically broad searches must be bounded so one caller cannot degrade service for everyone.
- **Rate-limited callers**: clients throttled by the existing rate limiter must continue to receive clear, cheap rejections without consuming database resources.
- **Flaky test environment**: the performance gate must distinguish a genuine regression from noise (e.g., via repeated runs or a tolerance band) to avoid eroding trust in CI.

## Requirements *(mandatory)*

### Functional Requirements

#### Hot-path performance

- **FR-001**: The system MUST identify the hot-path endpoints — the small set (expected 5–10) that account for the majority of beta traffic and database work — and record that list as the official performance scope for this feature.
- **FR-002**: For each hot-path endpoint, the system MUST have a documented, reproducible "before" measurement (latency percentiles, database round-trip count, slow-query contribution) taken against a full dataset under representative load.
- **FR-003**: The system MUST reduce per-request database work on hot-path endpoints by eliminating avoidable round-trips (e.g., N+1 patterns, repeated lookups within one request) and by relying on appropriate indexes rather than collection scans.
- **FR-004**: The system MUST cap the maximum amount of data returned by any hot-path endpoint in a single response (enforced page size / result limit) so a single request cannot force an unbounded scan or response.
- **FR-005**: The system MUST service bursts of identical popular read requests without issuing duplicated database work for each concurrent caller, using request coalescing (deduplication of in-flight identical queries so concurrent callers share one database flight; no response TTL — fresh data on each new request after the flight completes).
- **FR-006**: The system MUST leave existing correct behavior unchanged for every endpoint in scope — response shape, field names, ordering, and pagination semantics MUST match pre-hardening behavior except where a behavior change is explicitly called out.
- **FR-007**: The system MUST continue to enforce the existing rate-limiting policy and MUST reject over-limit requests without consuming database resources.

#### Regression safety net

- **FR-008**: The project MUST provide an automated correctness test suite runnable locally with a single standard command and runnable in CI without manual intervention.
- **FR-009**: The correctness suite MUST cover, at minimum: every hot-path endpoint's contract (status, response shape, pagination), Arabic ↔ Buckwalter conversion edge cases, and morphological filter behavior on Token queries.
- **FR-010**: The project MUST provide an automated performance regression gate that measures hot-path endpoints against recorded baselines and fails the build when an endpoint exceeds the agreed regression threshold on latency or database round-trip count.
- **FR-011**: The regression gate MUST produce a clear, human-readable failure report identifying the regressed endpoint, the metric, the baseline, and the observed value.
- **FR-012**: The project MUST document how to update performance baselines deliberately (for legitimate changes) so the gate doesn't force stale baselines on the team.
- **FR-013**: The test suite MUST NOT require production credentials, paid third-party API keys, or the live Gemini key to run the default CI profile; any test that requires such access MUST be opt-in and skipped by default.
- **FR-014**: The safety net MUST run automatically on every pull request targeting the main branch and MUST block merge on failure.

#### Observability (supporting)

- **FR-015**: The system MUST emit structured, per-request log records for hot-path endpoints including at minimum endpoint, status, duration, and a correlation identifier.
- **FR-016**: The system MUST emit a distinct signal when any request exceeds 500ms (the slow-endpoint threshold), suitable for later aggregation.

### Key Entities *(include if feature involves data)*

- **Hot-path endpoint set**: The documented list of endpoints in scope for performance hardening and for the performance regression gate. Attributes: endpoint identifier, traffic-share assumption, baseline latency percentiles, baseline database round-trip count.
- **Performance baseline**: A recorded measurement against a specific dataset size and load profile that future runs are compared to. Attributes: endpoint, metric, value, dataset snapshot reference, measurement date.
- **Regression threshold**: The tolerance band that defines what counts as a regression vs. noise. Attributes: metric, absolute floor, relative percentage, consecutive-run requirement (if any). Defaults: 25% relative increase over baseline with a 50ms absolute floor for latency; 25% relative / +1 round-trip tolerance for database round-trip count.
- **Test fixture dataset**: The data used by the correctness suite, sized and shaped to cover edge cases without requiring the full corpus. A curated static fixture seeded from a production export, version-controlled and checked into the repo, covering all edge cases (pagination boundaries, diacritics, empty inputs, etc.).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Under beta-representative sustained load, p95 response time for "list / paginate" hot-path endpoints stays under 300 ms and p95 for "single resource detail" endpoints stays under 150 ms, measured end-to-end from the API boundary.
- **SC-002**: Under beta-representative sustained load, p99 response time for any hot-path endpoint stays under 800 ms.
- **SC-003**: Under beta-representative sustained load for 30 minutes, the error rate across hot-path endpoints stays below 0.5% and MongoDB CPU stays below 70% average and below 90% peak.
- **SC-004**: For each hot-path endpoint, the number of database round-trips per request after hardening is at least 40% lower than the recorded baseline, or already at its theoretical minimum (documented if so).
- **SC-005**: On a cold process (no in-memory caches warmed), the first request to each hot-path endpoint completes within 2× the warm p95 target, not the 10×+ seen today on the worst endpoints.
- **SC-006**: 100% of hot-path endpoints are covered by at least one correctness test and at least one performance regression test before beta launch.
- **SC-007**: The full default test suite runs end-to-end in under 5 minutes on CI so developers actually wait for it.
- **SC-008**: A deliberately introduced performance regression on any hot-path endpoint (exceeding the threshold) is caught by CI within the same build — not in production.
- **SC-009**: A deliberately introduced correctness regression in Arabic/Buckwalter conversion, pagination, or a morphological filter is caught by the correctness suite within the same build.
- **SC-010**: Time-to-identify the offending endpoint during a simulated production slowdown is under 5 minutes using only the telemetry this feature adds.

## Clarifications

### Session 2026-04-24

- Q: What TTL/window should define "short window" for hot-path request deduplication? → A: Request coalescing (no TTL) — deduplicate in-flight identical queries so concurrent callers share one flight, but each new request after the flight completes fetches fresh data.
- Q: Where should the CI pipeline run? → A: GitHub Actions — native MongoDB service container, free for public repos, widely familiar.
- Q: What latency regression threshold should trigger a CI build failure? → A: 25% relative increase with 50ms absolute floor (accounts for CI shared-runner variance of ±15-20%).
- Q: What should qualify as a "slow request" that triggers the elevated log signal? → A: 500ms — between p95 and p99 targets; catches genuine outliers without noise.
- Q: What approach should the test fixture dataset use? → A: Curated static fixture — small, version-controlled dataset seeded from a production export, covering all edge cases, checked into the repo.

## Assumptions

- **Beta load profile**: "Beta" is assumed to mean roughly 100–500 concurrent active users with bursts up to ~200 requests per second, biased toward reads (verse/page/word/search). If actual beta load is materially different, baselines and thresholds will be revisited before launch.
- **Hot-path scope**: The hot-path endpoint set is assumed to be a subset of the existing `/api/quran/*` (surah/verse/page/word/token lookups), `/api/search/*` (token search, distinct lemmas), and `/api/roots/*` (roots listing). `/api/compare/*` is treated as lower-traffic and is in scope for safety-net coverage but not for the performance gate unless measurement shows otherwise.
- **Dataset**: Performance measurements use a full corpus dataset comparable to production. The correctness suite uses a smaller, fixed fixture sized for fast CI runs.
- **Test framework choice**: Selection of the specific test runner and load-measurement tooling is an implementation decision; the spec defines only the behaviors and gates, not the tools.
- **Caching scope**: Short-window caching of popular read responses is acceptable; stronger cross-process caching (e.g., Redis) is out of scope for this feature unless in-process approaches prove insufficient.
- **No schema changes required by default**: Fixes are expected to come from query shape, indexes, projection, pagination enforcement, and request-level memoization. If a data model change becomes necessary for a specific endpoint, it will be called out during planning and not assumed here.
- **CI provider**: The project uses GitHub Actions as the CI provider, running Node.js and MongoDB via service containers. Standing up the initial CI workflow configuration is part of this feature's delivery.
- **Observability sink**: Structured logs are assumed to be sufficient for Story 3; integration with a specific APM/metrics vendor is out of scope unless explicitly added.
- **Out of scope**: write-path endpoints, authentication/authorization changes, UI/client work, the data-seeding scripts under `src/scripts/`, and translation/enrichment scripts that depend on paid third-party APIs.
