# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with hot-reload (ts-node/esm, watches src/)
npm run build        # Compile TypeScript → dist/
npm run start        # Run compiled server from dist/

# Data management scripts (run in order for fresh DB)
node --loader ts-node/esm src/scripts/index.ts --surahs
node --loader ts-node/esm src/scripts/index.ts --verses
node --loader ts-node/esm src/scripts/index.ts --words
node --loader ts-node/esm src/scripts/index.ts --tokens
node --loader ts-node/esm src/scripts/index.ts --roots
node --loader ts-node/esm src/scripts/index.ts --verify
```

```bash
npm test                # Run full Vitest suite (unit + contract + parity)
npm test -- tests/parity            # OpenAPI ↔ Fastify parity tests (< 10s)
npm test -- tests/contract/auth     # API-key auth contract tests
npm run keys:create -- --label "local-dev"   # Issue an API key (prints plaintext once)
npm run keys:revoke -- --id <objectId>        # Revoke a key
```

## Authentication

Non-exempt routes require an `X-API-Key` header. Exempt paths: `/openapi.json`, `/reference`, `/reference/*`, `/health`, `/ready`. Invalid/revoked/expired/empty/malformed keys all return a stable 401 body `{error: "InvalidApiKey", message, requestId}` with `WWW-Authenticate: ApiKey realm="quran-api"`. See `specs/002-reviewable-honest-api/quickstart.md` for details and `docs/auth.md` for consumer usage.

## Environment Variables

```
PORT=5000
MONGO_URI=mongodb://localhost:27017/quran_db
GEMINI_API_KEY=<key>         # Required for --semanticRoots script only
API_KEY_PEPPER=<32+ char hex string>  # Required for API key authentication
API_KEY_HEADER=X-API-Key     # HTTP header name for API key authentication
```

## Architecture

**Quran REST API** built with Fastify 5 + TypeScript + MongoDB/Mongoose. ES modules throughout (`"type": "module"`, NodeNext resolution).

**Entry point:** `src/server.ts` — initializes Fastify, registers CORS, mounts all route modules, adds global error handler, connects to MongoDB, starts on PORT.

### Module layout

Each feature is a self-contained module under `src/modules/<name>/`:
- `quran.routes.ts` — registers Fastify routes
- `quran.service.ts` — MongoDB queries via Mongoose
- `quran.controller.ts` — orchestrates service calls, sends responses

Modules: `quran`, `search`, `roots`, `compare`.

### Route summary

| Prefix | Purpose |
|---|---|
| `/api/quran` | Surahs, verses by page, ayah + words, word + token details |
| `/api/search` | Token-level search with morphological filters; distinct lemmas |
| `/api/roots` | All roots or single root with lemma/form aggregation |
| `/api/compare` | Statistical comparison between two surahs or two roots |
| `/reference` | Scalar UI (OpenAPI docs) |

### Data model & relationships

```
Surah (1) ──► Verse (many, by surah+ayah)
Verse (1) ──► Word (many, by surah+ayah+word)
Word  (1) ──► Token (many segments, morphological analysis)
Token.ROOT ──► Root (Buckwalter string)
Root  (1) ──► RootMeaning (many, one per source)
```

**Token** is the most information-dense model — each word segment carries POS, ROOT, LEM, and ~18 boolean morphological flags (tense, case, voice, etc.) stored as indexed booleans for fast filtering.

**Root** stores Buckwalter-format keys. All root lookups translate between Arabic script and Buckwalter via `src/utils/` helpers (`arabicToBuckwalter`, `buckwalterToArabic`).

### OpenAPI / validation

Zod schemas live in `src/validators/`. They are registered with `@asteasolutions/zod-to-openapi` and wired into the OpenAPI spec generated in `src/docs/`. Route handlers import these schemas for request validation and response typing.

### Scripts

`src/scripts/index.ts` is a CLI that seeds all collections from two static data files at the repo root:
- `quran_data.json` — text/translation data
- `quranic-corpus-morphology-0.4.txt` — morphological corpus

Additional scripts (`enrichData.ts`, `seedRootMeanings.ts`) enrich existing documents with computed stats or external API data (Gemini, third-party root meaning APIs).

### Caching

Lemma and root list results are memoized in-process after first retrieval — no external cache layer.
