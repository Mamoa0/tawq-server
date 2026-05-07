# Quickstart — Tafsir Module

Two audiences: an **operator** ingesting a tafsir source for the first time, and a **consumer** calling the API.

## Operator: ingest the v1 sources

```bash
# 1. Register the source rows (one-time, seeds tafsirsources)
node --loader ts-node/esm src/scripts/index.ts --tafsir muyassar --register-only
node --loader ts-node/esm src/scripts/index.ts --tafsir mukhtasar --register-only
node --loader ts-node/esm src/scripts/index.ts --tafsir tadabbur-wa-amal --register-only

# 2. Run ingestion (resumable, idempotent, throttled). Each call:
#    - reads tafsir_ingestion_state to find the resume point,
#    - fans out HTTP requests with concurrency 6 to tafsir.app,
#    - upserts on (sourceSlug, surah, ayahStart, ayahEnd),
#    - writes a per-surah resume marker,
#    - bumps tafsirsources.generation + ingestedAt on completion.
node --loader ts-node/esm src/scripts/index.ts --tafsir muyassar
node --loader ts-node/esm src/scripts/index.ts --tafsir mukhtasar
node --loader ts-node/esm src/scripts/index.ts --tafsir tadabbur-wa-amal

# Resume / restart helpers
node --loader ts-node/esm src/scripts/index.ts --tafsir muyassar --from 50    # force resume from surah 50
node --loader ts-node/esm src/scripts/index.ts --tafsir muyassar --restart    # clear marker, re-ingest from 1
```

Re-running the same command after a successful run is a no-op for entry count and content (idempotency contract — verifiable per SC-005). Killing the process mid-run and re-running produces the same final state as a single uninterrupted run.

## Operator: add a fourth source later

1. Add one row to `tafsirsources` (slug + metadata).
2. Add `src/scripts/tafsir/<slug>.ts` exposing the upstream-shape adapter (translate `{ ayahs_start, count, text }` or per-ayah shapes into `{ surah, ayahStart, ayahEnd, text }`).
3. Run `npm run -- --tafsir <slug>`.

No edits to any route, controller, service, or shared model file. SC-007 requires this — the planning structure honors it by routing every per-source code into `src/scripts/tafsir/<slug>.ts` only.

## Consumer: discover sources

```bash
curl -H "X-API-Key: $KEY" https://api.example/api/v1/tafsir/sources
# → { "data": [{ "slug": "muyassar", "name": {"ar":"التفسير الميسر"}, "author": "...", "language":"ar", "direction":"rtl", "format":"text", "grouping":"ayah" }, … ] }

curl -H "X-API-Key: $KEY" "https://api.example/api/v1/tafsir/sources?language=ar"
# → only Arabic sources

curl https://api.example/api/v1/tafsir/sources
# → 401 { "error":"InvalidApiKey", "message":"...", "requestId":"..." }
```

## Consumer: fetch a bundle

```bash
curl -H "X-API-Key: $KEY" \
  "https://api.example/api/v1/tafsir/2/20?sources=muyassar,mukhtasar,tadabbur-wa-amal"
# → 200
# {
#   "surah": 2, "ayah": 20,
#   "results": [
#     { "source": { "slug": "muyassar", ... }, "ayahStart": 20, "ayahEnd": 20, "text": "..." },
#     { "source": { "slug": "tadabbur-wa-amal", ... }, "ayahStart": 17, "ayahEnd": 23, "text": "..." }
#   ],
#   "missing": ["mukhtasar"]
# }
```

Two requests for two ayahs inside the same range block return identical `ayahStart`, `ayahEnd`, and `text` for that source — clients de-duplicate on `(slug, ayahStart, ayahEnd)`.

Omit `?sources=` to default to every registered source.

Use the response `ETag` with `If-None-Match` on the next request for the same ayah → 304 with no body when nothing changed since last ingest.

## Consumer: see availability without paying for bodies

```bash
curl -H "X-API-Key: $KEY" "https://api.example/api/v1/quran/surah/2/ayah/20"
# → 200
# {
#   "data": {
#     "surah": 2, "ayah": 20, "text": "...",
#     "tafsir": { "sources": ["muyassar", "tadabbur-wa-amal"] }
#   }
# }
```

`tafsir.sources` is always present (possibly `[]`). It carries no body — fetch the bundle endpoint when the user opens the tafsir panel.

## Verifying the install end-to-end

```bash
npm test                                  # full suite — must be green
npm test -- tests/contract/tafsir         # tafsir contract tests
npm test -- tests/parity                  # parity must include the new routes with no test edits
npm test -- tests/scripts/tafsir          # adapter tests using recorded fixtures (no live HTTP)
```
