# Tawq-Server — Production Readiness Review (Beta)

**Date:** 2026-04-23
**Verdict:** **Not ready for public beta yet.** The core is promising and feature-rich for morphology/linguistics, but there are contract-breaking bugs, a leaked secret in git, and several missing features that competing Quran APIs treat as table stakes. With ~1–2 weeks of focused fixes it can ship as a beta.

---

## 1. How it compares to the field

This project's real differentiator is the **morphological depth**: per-token POS/root/lemma filters, co-occurrence graphs, root networks, statistical comparison of surahs/roots. That's genuinely stronger than most public Quran APIs.

However, compared to Quran.com v4 API and alquran.cloud, the project is **missing most of what typical consumers (Quran mobile apps, websites) actually need**:

| Feature | Quran.com v4 | alquran.cloud | tawq-server |
|---|---|---|---|
| Multiple translations (selectable) | Yes | Yes (100+ editions) | **No** – single translation field |
| Tafsir / exegesis | Yes | Yes | **No** |
| Audio recitations (per reciter, per ayah) | Yes | Yes (CDN, multiple bitrates) | **No** |
| Multiple script editions (Uthmani, IndoPak, simple) | Yes | Yes | **No** – single Arabic text |
| Tajweed-annotated text | — | Yes | **No** |
| Sajda markers surfaced | Yes | Yes | Data exists, not exposed |
| Word-for-word translation | Yes | Partial | Partial |
| Morphology / roots / lemmas | Basic | No | **Yes (strong)** |
| Root co-occurrence / network graphs | No | No | **Yes (unique)** |
| Statistical compare surahs/roots | No | No | **Yes (unique)** |

If you're positioning tawq as a "linguistic analysis API" for researchers or Arabic-language tools, you're already ahead. If you're positioning it as a general-purpose Quran API for app developers, you're behind.

---

## 2. Critical bugs (must fix before beta)

### 2.1 API versioning mismatch — clients will 404
- `README.md` documents every endpoint as `/api/v1/...`
- `src/server.ts:86-90` registers prefixes as `/api/quran`, `/api/search`, `/api/roots`, `/api/compare`, `/api/stats`
- Anyone following your README gets 404 on every request.
- **Fix:** pick one. Change server.ts to `/api/v1/...` (matches README + gives you forward versioning).

### 2.2 Leaked credentials in git
- `.env` is committed and contains a real `GEMINI_API_KEY`.
- `.gitignore` lists `.env` but the file is already tracked.
- **Fix:** `git rm --cached .env`, rotate the Gemini key, purge from history (`git filter-repo` or BFG), verify `git log --all -- .env` is clean.

### 2.3 Inconsistent response envelope across modules
Different endpoints return different shapes:
- `quran.controler.ts`: `{ data: ... }`
- `search.controler.ts`: `{ data, totalCount, page, limit, totalPages }`
- `roots.routes.ts:20` returns a paginated object directly (no `data` wrapper)
- `roots.routes.ts:31` returns `{ error, message }` instead of `{ statusCode, error, message }`

Clients cannot write one response parser. This is the single biggest API-ergonomics problem.
**Fix:** define one envelope, e.g.
```ts
{ data, meta?: { page, limit, totalCount, totalPages } }
```
…and enforce it in a `onSend` hook or a shared `reply.ok(data, meta?)` helper.

### 2.4 Aggregation pipelines returning cursors
- `src/modules/compare/compare.service.ts:143` returns `TokenModel.aggregate(...)` (cursor) to the controller without `.exec()`/destructure. JSON serialization will fail or produce empty `{}`.
- Reaudit every `.aggregate(` call in compare/search/stats to confirm it returns a resolved array.

### 2.5 OpenAPI points to localhost in production
- `src/docs/openapi.ts:19` hardcodes `http://localhost:${env.PORT}` as the server URL.
- Scalar UI at `/reference` will tell production users to call localhost.
- **Fix:** add `API_URL` env var or derive from request headers.

### 2.6 CSP allows `unsafe-inline` globally
- `src/server.ts:47` sets `scriptSrc: ["'self'", "'unsafe-inline'"]` on every route, not just `/reference`.
- **Fix:** scope the relaxed CSP to the docs route or use nonces.

### 2.7 Pagination off-by-one on `/page/:page`
- `quran.controler.ts:222` rejects `page > 604` — that's correct, but double-check inclusive bounds for `juz` (1–30) and `hizb` (1–60) the same way with tests.

### 2.8 Unbounded memory / unbounded inputs
- `src/utils/arabicToBuckwalter.ts:7-14` and `buckwalterToArabic.ts:7-14` use unbounded `Map` caches with no eviction — slow memory leak.
- `quran.controler.ts:185` `refs.split(",")` has no size cap — `GET /verses?refs=…` accepts 10k IDs and can be weaponized.
- Search validators cap `limit` but no max length on text filters (ReDoS-adjacent).

### 2.9 Test framework: none
- `package.json:9` → `"test": "echo \"Error: no test specified\""`
- Existing testsprite tests are Python, external, and 5/10 fail. No CI, no local test runner.

---

## 3. Performance / correctness concerns

- **Regex without anchors** in `search.service.ts:182-183` on a non-indexed `form` field → collection scan on 6.7M tokens.
- **$skip-based pagination** on the tokens collection at `search.service.ts:81,132,205` degrades as `page` grows. For deep pages, switch to range-based / cursor pagination keyed on `(surah, ayah, word, segment)`.
- **Nested `$lookup` tokens → tokens** in `search.service.ts:207-243` to rebuild full ayah text is an N+1 inside the pipeline. Pre-compute `fullAyah` at seed time or materialize it on the `Verse` doc.
- **`/api/stats/`** scans the full tokens collection on every cache miss. Fine while the hourly TTL holds; first request after expiry is slow. Cache warming on startup would help.
- **Buckwalter conversion is lossy round-trip** for some diacritic / hamza variants. Add unit tests for representative edge cases before advertising root lookups "accept Arabic script".

---

## 4. Production hygiene gaps (beta blockers for anything past dev)

- **No Dockerfile**, despite the README showing one. `docker build` will fail.
- **No CI** (.github/workflows absent). No automated lint/build/test on PR.
- **No structured logging** — `server.ts` uses raw `console.log` for shutdown/errors instead of `app.log`. No request ID / correlation ID.
- **No metrics** (Prometheus / StatsD). You won't know your p99 or error rate.
- **No `Cache-Control`/ETag** on immutable endpoints like `/surahs`.
- **Health check is shallow** — only checks Mongoose `readyState`. Doesn't verify the DB can actually serve queries. A `db.ping()` + index existence check is 10 lines and much more useful.
- **Rate limit key is IP only** (`server.ts:59`) — anyone behind shared NAT (university, mobile carrier) gets one bucket for thousands of users.
- **CORS_ORIGIN is a single string** — can't whitelist both staging and prod. Accept comma-separated and split.
- **CORS_ORIGIN missing from `.env.example`** despite being in `src/config/env.ts`.

---

## 5. Missing features to be competitive

Ordered by how much value they add for consumers:

1. **Multiple translations** — at least English (Sahih International, Pickthall), plus a "list editions" endpoint. Almost every client app needs to let users pick a translator.
2. **Audio recitation URLs** — don't host files, just expose CDN URLs (alquran.cloud's CDN, Quran.com's, or EveryAyah) per ayah and per reciter.
3. **Tafsir endpoint** — wire up Ibn Kathir / Jalalayn / Tabari via existing free APIs (`api.quran-tafseer.com`) or serve stored text.
4. **Uthmani vs. simple script variants** — single `textArabic` field is insufficient for print-quality apps.
5. **Sajda markers** — surface an `isSajda` + `sajdaType` on verses that have them.
6. **`/bookmarks`, `/last-read`** if you want clients to store user state server-side. Requires auth; may be out of scope for beta.
7. **Tajweed-coloring data** — expose the same tag format as alquran.cloud so existing client libs work.

You do **not** need all of these for beta. Pick the top 2–3 that match your positioning.

---

## 6. Suggested path to beta (~1–2 weeks)

**Day 1 (1 day)** — stop the bleeding
- Rotate Gemini key, remove `.env` from git history
- Fix `/api/v1` vs `/api` mismatch (pick one, update both)
- Fix OpenAPI `servers` URL
- Add `CORS_ORIGIN` to `.env.example`; accept comma-separated origins

**Day 2–3 (2 days)** — consistency
- Standardize response envelope across all modules (one helper, one shape)
- Fix the `compare.service.ts:143` unresolved cursor
- Standardize error body to `{ statusCode, error, message }` everywhere
- Add input bounds: `refs` max 100, search strings max 100 chars

**Day 4–5 (2 days)** — tests + CI
- Add Vitest + supertest; write integration tests for 8–10 core endpoints (the ones testsprite covers, plus compare/roots/search)
- GitHub Actions workflow: lint → build → test
- Fix the 5 testsprite tests (they are test-side bugs, not API bugs)

**Day 6–7 (2 days)** — ops
- Dockerfile (multi-stage, node:22-alpine)
- Deeper `/health` (db.ping, index check)
- Swap `console.log` → `app.log`, add request-id hook
- Cache-Control on immutable endpoints

**Week 2** — one competitive feature
- Pick one of: multiple translations, audio URLs, tafsir. Add the endpoint + seeder.

After that you can publish a beta with a clear pitch: *"morphology-first Quran API, with translation/audio coming."*

---

## 7. TL;DR

The code is well-organized, the morphology coverage is the best thing about it, and the architecture (Fastify + Mongo + Zod + OpenAPI) is sound. But shipping today would mean shipping with a leaked API key, a 404 on every documented URL, inconsistent response shapes, and less functionality than free alternatives. Spend the ~2 weeks — it's an easy beta after that.
