# Feature Specification: Tafsir (Quranic Exegesis) Module

**Feature Branch**: `003-tafsir-module`
**Created**: 2026-05-04
**Status**: Draft
**Input**: User description: "Add tafsir (Quranic exegesis) to the Quran API as a new feature module."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fetch ayah-level tafsir from multiple sources in one request (Priority: P1)

A consumer building a Quran reading product wants to display scholarly commentary alongside an ayah. In a single API call they pass a surah, an ayah, and the set of tafsir sources they want, and the response returns the available commentary text from each source plus an explicit list of any requested source that had no entry for that ayah. The consumer never has to retry, never has to check sources one-by-one, and never has to interpret a 404 as ambiguous (missing source vs missing ayah vs missing endpoint).

**Why this priority**: This is the core value of the feature — every consumer integrating tafsir needs this single endpoint. Without it, the rest of the module has no purpose. A working version of just this endpoint, even with a single source, already delivers user-visible value.

**Independent Test**: Can be fully tested by issuing a request for surah 2 ayah 20 with all three v1 sources named, and confirming the response contains the resolved commentary blocks from sources that have data and a `missing` array naming any source that does not. The test passes without any other endpoints existing.

**Acceptance Scenarios**:

1. **Given** all three v1 sources have data for surah 2 ayah 20, **When** a consumer requests tafsir for that ayah naming all three sources, **Then** the response is a 200 containing three commentary blocks (one per source) and an empty `missing` array.
2. **Given** two of three requested sources have data for the ayah and one does not, **When** the consumer requests all three, **Then** the response is a 200 with two commentary blocks and a `missing` array containing the slug of the source with no entry.
3. **Given** a source covers the requested ayah as part of a verse range (e.g. ayahs 17–23), **When** the consumer requests that ayah, **Then** the returned block exposes the actual `ayahStart` and `ayahEnd` of the covering range, not just the requested ayah.
4. **Given** the consumer requests two different ayahs that fall inside the same range block (e.g. ayah 18 and ayah 21 both inside a 17–23 block), **When** comparing the two responses, **Then** the returned block for that source has the same `ayahStart`, `ayahEnd`, and body in both responses, so the consumer can detect the duplicate.
5. **Given** one of the requested sources is slow or upstream-erroring at request time (when serving from cache fails), **When** the consumer makes a multi-source bundled request, **Then** the response still returns within a bounded time and lists the slow/erroring source in `missing` rather than blocking the response on it.

---

### User Story 2 - List available tafsir sources (Priority: P1)

A consumer needs to discover which tafsir sources the API exposes before they can request commentary. They call a single endpoint and receive a list of sources, each describing its slug, display name, author, language, text direction, and content format (plain text or HTML). With this list the consumer can render selection UI, filter by language, and decide whether their renderer needs to handle HTML.

**Why this priority**: Discovery is a prerequisite for the fetch endpoint. Without it, consumers must hard-code source slugs, which defeats the extensibility goal — when a fourth source is added, every consumer would need a code change to know about it.

**Independent Test**: Can be fully tested by calling the source-listing endpoint with a valid API key and verifying the response contains exactly the three v1 sources with the correct metadata for each, before any tafsir entries are fetched or ingested.

**Acceptance Scenarios**:

1. **Given** the v1 sources are registered, **When** a consumer calls the source-listing endpoint with a valid API key, **Then** the response is a 200 containing three entries with `slug`, `name`, `author`, `language`, `direction`, and `format` populated for each.
2. **Given** an unauthenticated request, **When** a consumer calls the source-listing endpoint without an API key, **Then** the response is a 401 with the existing API-wide invalid-key body shape.
3. **Given** a fourth source is registered later via data-only configuration, **When** a consumer calls the source-listing endpoint, **Then** the new source appears in the response with no API-side code changes required.

---

### User Story 3 - See on the verse endpoint which sources have tafsir for an ayah (Priority: P2)

A consumer rendering a verse view wants to show a "Tafsir available from: …" indicator without paying the cost of loading every tafsir body. The existing verse endpoint returns small per-ayah hints listing the slugs of sources that have commentary for that ayah, so the consumer can render an icon or label and only fetch the bodies when the reader opens the tafsir panel.

**Why this priority**: Improves UX for consumers but is not required for the core read flow — the same information can be inferred by calling the tafsir fetch endpoint. Ship after the fetch and list endpoints work end-to-end.

**Independent Test**: Can be fully tested by requesting an ayah from the existing verse endpoint and confirming the per-ayah payload contains a list of source slugs that exactly matches the set of sources that will return content when the tafsir fetch endpoint is called for that ayah.

**Acceptance Scenarios**:

1. **Given** an ayah has tafsir from two of three v1 sources, **When** a consumer fetches that ayah from the verse endpoint, **Then** the ayah payload includes a list of two source slugs and does not include any tafsir body text.
2. **Given** an ayah has no tafsir from any registered source, **When** a consumer fetches that ayah from the verse endpoint, **Then** the ayah payload includes an empty list of tafsir source slugs (not omitted, not null).
3. **Given** the verse endpoint is called with a valid API key, **When** the response is generated, **Then** payload size growth from the tafsir hint is bounded by the count of registered sources and never includes commentary text.

---

### User Story 4 - Re-run ingestion safely (Priority: P2)

An operator runs the ingestion adapter for a tafsir source against the upstream provider. If the run is interrupted halfway, or completed and re-run later, the operator must not produce duplicate documents, must not see partial-state corruption, and must be able to resume without manual cleanup. The next run picks up missing entries, refreshes existing ones, and leaves coverage in a known good state.

**Why this priority**: Required for operational reliability — without idempotency, a failed run requires database surgery, and adding a fourth source becomes risky. Not user-facing on its own but blocks safe operations.

**Independent Test**: Can be fully tested by running ingestion for one source twice in a row and confirming the count of stored tafsir entries for that source is identical to the count after the first successful run, with no duplicate `(source, ayahStart, ayahEnd)` tuples.

**Acceptance Scenarios**:

1. **Given** ingestion has already completed for a source, **When** the same ingestion command is re-run with no upstream changes, **Then** no duplicate entries are written and entry count is unchanged.
2. **Given** an ingestion run is interrupted partway through (process killed), **When** the operator re-runs the command, **Then** the second run completes the remaining entries without re-writing or duplicating already-ingested ones, and produces a final state identical to a single uninterrupted run.
3. **Given** an upstream entry has been updated since the last run, **When** ingestion is re-run, **Then** the stored entry reflects the latest upstream content (no stale duplicates of the same `(source, ayahStart, ayahEnd)`).

---

### User Story 5 - Add a fourth source without code changes (Priority: P3)

A future operator wants to add a new tafsir source (e.g. an English source, or an HTML-format Arabic source) to the API. They register the source's metadata as a data row and run the ingestion adapter for it. No route file, no controller, no service, and no schema migration is changed. After ingestion, the new source appears in the source-listing response and the fetch endpoint serves its content under its slug.

**Why this priority**: Demonstrates the extensibility goal but is exercised by operators, not end consumers, and only when expanding the catalog. Ship after the v1 catalog works.

**Independent Test**: Can be fully tested by adding one new adapter file (responsible for translating a new upstream's response shape into the canonical entry shape) and one new source-registry row, then verifying the new slug appears in source listings and the fetch endpoint returns its content — all without modifying any existing route, controller, model, or service file.

**Acceptance Scenarios**:

1. **Given** a hypothetical fourth source is registered as a data row and an adapter file is added for it, **When** ingestion is run for that source, **Then** entries are written and become queryable through the existing fetch endpoint with no other code changes.
2. **Given** the fourth source is HTML-formatted, **When** entries are ingested, **Then** the stored body has been sanitized against an allowlist at ingest time, and the served response contains only allowlisted markup.
3. **Given** the fourth source is registered, **When** the source-listing endpoint is called, **Then** it appears with its declared `format` (`html` or `text`) so consumers know how to render it.

---

### Edge Cases

- Upstream returns an empty body for an ayah a source does not cover during ingestion: the entry is not stored; subsequent fetch requests for that ayah list the source in `missing`.
- Multi-source bundled fetch where one source's data path is slow or fails at request time: that source is reported in `missing`, the other sources resolve normally, and total response time stays within the bundled-request budget.
- Same range block requested via two different ayahs inside the range: both responses must expose the same `ayahStart`, `ayahEnd`, and body text for that source so the consumer can de-duplicate.
- Consumer requests an ayah that does not exist (e.g. surah 2 ayah 999): request is rejected as an invalid ayah reference, not returned as an empty tafsir bundle.
- Consumer requests a source slug that is not registered: that slug is reported in `missing` (per the Unknown source slug handling assumption — unknown slugs are treated as missing rather than rejected as validation errors, so consumers caching older source lists do not see hard failures).
- Consumer makes a fetch request without naming any source: defaults to all currently registered sources.
- Source-listing endpoint is called without an API key: returns the same 401 shape as every other authenticated endpoint, no special-case behavior.
- HTML-format source served before sanitization is wired up: must be blocked at ingest time, not at serve time, so unsanitized HTML never reaches storage.

## Requirements *(mandatory)*

### Functional Requirements

#### Source registry & discovery

- **FR-001**: System MUST expose a source-listing endpoint at `/api/v1/tafsir/sources` that returns every registered tafsir source with its `slug`, display `name`, `author`, `language`, text `direction` (`ltr` or `rtl`), and content `format` (`text` or `html`).
- **FR-002**: System MUST require a valid API key for the source-listing endpoint and return the existing API-wide invalid-key body shape on failure.
- **FR-003**: System MUST allow new sources to be added by inserting a registry row plus an ingestion adapter, with no changes to routes, controllers, services, or shared models.

#### Ayah-level tafsir fetch

- **FR-004**: System MUST expose a fetch endpoint at `/api/v1/tafsir` that, given a surah, an ayah, and zero or more requested source slugs, returns the available commentary entries plus a `missing` array naming every requested-but-unresolved source.
- **FR-005**: System MUST default to "all currently registered sources" when the consumer does not name any source explicitly.
- **FR-006**: System MUST return 200 whenever the surah/ayah reference is valid, even if zero sources have data for that ayah (in which case the response carries an empty entries list and a `missing` array containing every requested source).
- **FR-007**: System MUST reject an invalid surah/ayah reference (out-of-range surah, out-of-range ayah for that surah) with a validation error, distinguishable from "valid ayah, no tafsir."
- **FR-008**: System MUST require a valid API key for the fetch endpoint.

#### Range-shaped sources

- **FR-009**: System MUST persist every tafsir entry with both `ayahStart` and `ayahEnd` (equal for single-ayah sources, spanning a range for range-shaped sources).
- **FR-010**: System MUST resolve a fetch for any ayah inside a covering range to the same stored entry, returning the entry's actual `ayahStart` and `ayahEnd` so the consumer can de-duplicate across paged ayah requests.
- **FR-011**: System MUST guarantee that two fetch requests for two different ayahs inside the same covering range receive byte-identical body content and identical `ayahStart`/`ayahEnd` values for that source.

#### Verse-endpoint integration

- **FR-012**: System MUST extend the existing verse endpoint payload with a per-ayah list of source slugs that have tafsir available for that ayah.
- **FR-013**: System MUST NOT embed any tafsir body content in the verse endpoint payload — only the slug list.
- **FR-014**: System MUST return an empty list (not null, not omitted) when no source has tafsir for the ayah.

#### Ingestion

- **FR-015**: System MUST provide an ingestion adapter per source, invokable as a CLI operation, that fetches upstream data one ayah per HTTP request and writes canonical entries to storage. The adapter MUST apply configurable rate-limiting between requests for politeness.
- **FR-016**: System MUST make ingestion idempotent — re-running the same adapter against unchanged upstream data MUST NOT create duplicates and MUST leave entry count and content unchanged.
- **FR-017**: System MUST allow ingestion to resume cleanly after interruption — a partial run followed by a re-run MUST produce the same final state as a single uninterrupted run.
- **FR-018**: System MUST refresh stored content when upstream content for an existing `(source, ayahStart, ayahEnd)` has changed, without creating a duplicate entry.
- **FR-019**: System MUST sanitize HTML-format upstream content at ingest time against an allowlist, before storage; serving MUST never apply sanitization on read.
- **FR-020**: System MUST not store an entry when upstream returns an empty body for an ayah the source does not cover.
- **FR-020a**: System MUST skip and log individual upstream errors (network failure, malformed response, rate-limiting) during ingestion without aborting the entire run; a subsequent re-run MUST pick up skipped entries idempotently.
- **FR-020b**: System MUST reject a concurrent ingestion run for a source that already has an active run, returning a clear error message indicating the conflict; only one run per source may be active at a time.

#### Authentication, discoverability, and resilience

- **FR-021**: System MUST register every tafsir route in the OpenAPI document and pass the existing OpenAPI ↔ Fastify parity check with no new exempt paths.
- **FR-022**: System MUST require a valid API key for every tafsir route — no tafsir route may be added to the auth-exempt list.
- **FR-023**: System MUST enforce a per-source time budget when serving a multi-source bundled fetch, so a single slow or failing source MUST NOT block the others past that budget; sources exceeding the budget MUST be reported in `missing`.
- **FR-024**: System MUST keep the source-listing endpoint available regardless of upstream tafsir.app reachability — it serves from the local registry only.

### Key Entities *(include if feature involves data)*

- **TafsirSource**: A registered commentary source. Identified by a stable `slug` (e.g. `muyassar`). Carries human-readable `name`, `author`, `language` (e.g. `ar`, `en`), text `direction` (`ltr` or `rtl`), content `format` (`text` or `html`), and a `grouping` indicating whether its entries are single-ayah (`ayah`) or verse-range (`range`). Sources are registered as data; adding one MUST NOT require code or schema changes.
- **TafsirEntry**: A unit of commentary stored for one source. Carries the source slug, surah number, `ayahStart`, `ayahEnd` (equal for single-ayah sources), and the body content (sanitized HTML or plain text per the source's declared format). Uniqueness is on `(source, surah, ayahStart, ayahEnd)` — re-ingestion MUST NOT create a second entry with the same tuple.
- **Verse-endpoint TafsirAvailability**: A read-only per-ayah projection on the existing verse payload listing the slugs of registered sources that currently have a stored entry covering that ayah. Carries no body content.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A consumer can fetch tafsir for surah 2 ayah 20 from all three v1 sources in a single request and receive a documented response containing every available block plus a `missing` list, with no follow-up calls required.
- **SC-002**: 100% of tafsir routes appear in the published OpenAPI document and pass the existing OpenAPI ↔ Fastify parity check on every CI run.
- **SC-003**: 100% of tafsir routes reject unauthenticated requests with the existing API-wide invalid-key body shape; zero tafsir routes appear in the auth-exempt list.
- **SC-004**: A multi-source bundled fetch returns within 3 seconds per source plus a small overhead, even when one of the requested sources is unreachable; the unreachable source is named in `missing` and the others resolve normally.
- **SC-005**: Re-running ingestion for any source against unchanged upstream content produces zero new entries and zero modified entries (verifiable by entry-count and content-hash diff).
- **SC-006**: Two fetch requests for two different ayahs inside the same range-shaped source's covering block return identical `ayahStart`, `ayahEnd`, and body content for that source, enabling client-side de-duplication.
- **SC-007**: Adding a hypothetical fourth source can be demonstrated end-to-end (registry row + adapter file + ingestion run → source appears in listing endpoint → fetch endpoint returns its content) with zero changes to existing route, controller, service, or model files (verifiable by `git diff` on those paths showing no modifications).
- **SC-008**: When an HTML-format source is added later, the served body content contains only markup from a documented allowlist; no upstream-supplied script, style, event-handler attribute, or non-allowlisted tag ever appears in API responses.

## Clarifications

### Session 2026-05-04

- Q: When the ingestion adapter encounters an upstream error from tafsir.app (network failure, malformed response, or rate-limiting), what should it do? → A: Skip failed entries and continue; log each failure; re-running later picks up missed entries idempotently.
- Q: If two ingestion runs for the same source execute concurrently, what should happen? → A: Reject the second run with a clear error message; only one run per source may be active at a time.
- Q: What initial default value for the per-source time budget on multi-source bundled fetches (FR-023)? → A: 3 seconds per source.
- Q: How many upstream ayahs does the ingestion adapter fetch at a time? → A: One ayah per request to tafsir.app API.
- Q: What route prefix pattern should the tafsir fetch endpoint follow? → A: `/api/v1/tafsir` — consistent with existing `/api/v1/search`, `/api/v1/roots`, `/api/v1/compare`, `/api/v1/stats` (matches the `/api/v1/` prefix convention used by all existing modules).

## Assumptions

- **Auth model**: The feature reuses the existing X-API-Key contract (header name, exempt-path list, 401 body shape) defined in `docs/auth.md` and `specs/002-reviewable-honest-api`. No new auth mechanism is introduced.
- **Storage**: Tafsir entries and the source registry live in the same MongoDB instance used by the rest of the API. No new datastore is introduced.
- **Per-source time budget**: The default per-source time budget for multi-source bundled fetches is 3 seconds. A source that does not resolve within this budget is reported in `missing`. The value is configurable for tuning.
- **Default source set**: When the consumer does not name any source on the fetch endpoint, the API returns content from every currently registered source (and lists none in `missing` unless the source has no entry for the ayah).
- **Unknown source slug handling**: A requested slug that is not in the registry is treated as `missing` (consistent with "no data for that ayah") rather than rejected as a validation error, so that consumers caching an older source list do not see hard failures when a source is removed.
- **Caching**: The verse-endpoint tafsir-availability list is computed from stored entries and may be memoized using the same in-process pattern already used for lemma/root lists; no new external cache layer is introduced.
- **Upstream dependency**: First-release ingestion sources data from `https://tafsir.app/get.php?src=<slug>&s=<surah>&a=<ayah>&ver=1`. Upstream availability is required only at ingestion time, not at request-serving time.
- **Read-only at request time**: The fetch and list endpoints serve from local storage only; they never call tafsir.app inline. Ingestion is a separate, operator-triggered process.
- **Scope of v1 sources**: The first release ships exactly three sources: `muyassar`, `mukhtasar`, `tadabbur-wa-amal`. All Arabic, all plain text. HTML and non-Arabic sources are supported by the design but not delivered in this release.
- **Out of scope for v1**: Full-text search inside tafsir bodies, per-user bookmarks/notes/highlights, editorial review workflow, frontend rendering or styling.
