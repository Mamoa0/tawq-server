# Product Requirements Document — Quran REST API (tawq-server)

## Overview

A RESTful JSON API that exposes the full text of the Quran together with rich morphological, linguistic, and statistical data. Built with Fastify 5, TypeScript, and MongoDB. The server runs on port 5000, requires no authentication, and enforces a rate limit of 100 requests per minute per IP.

Base URL: `http://localhost:5000`

---

## System Boundaries

| Concern | Value |
|---|---|
| Authentication | None |
| Rate limit | 100 req/min per IP |
| Body size limit | 100 KB |
| Database | MongoDB (`quran_db`) |
| Response format | JSON |
| Error format | `{ statusCode, error, message }` |

---

## Endpoints

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Returns `{ status: "ok", db: "connected" }` when the database is reachable; 503 otherwise |

---

### Quran — `/api/quran`

| Method | Path | Description |
|---|---|---|
| GET | `/surahs` | List all 114 surahs with metadata (name, number of verses, revelation type, etc.) |
| GET | `/surahs/:number` | Single surah by number (1–114) |
| GET | `/surahs/:number/page/:page` | Verses of a surah paginated by page number |
| GET | `/surahs/:number/themes` | Thematic tags associated with a surah |
| GET | `/surahs/:number/stats` | Word/verse/root counts and morphological statistics for a surah |
| GET | `/surahs/:number/word-frequency` | Top word frequencies in a surah |
| GET | `/surah/:s/ayah/:a` | Single verse with all its words and morphological tokens |
| GET | `/surah/:s/ayah/:a/navigation` | Verse with prev/next navigation links |
| GET | `/surah/:s/ayah/:a/word/:w` | Single word detail (Arabic text, transliteration, translation, token segments) |
| GET | `/surah/:s/ayah/:a/roots` | All unique roots appearing in a verse |
| GET | `/surah/:s/ayah/:a/analysis` | Full morphological analysis of every token in a verse |
| GET | `/page/:page` | All verses on a given Quran page (1–604) |
| GET | `/juz/:juz` | All verses in a given Juz (1–30) |
| GET | `/hizb/:hizb` | All verses in a given Hizb (1–60) |
| GET | `/verses` | Batch fetch verses by a list of surah:ayah identifiers |
| GET | `/random` | One randomly selected verse |
| GET | `/daily` | Deterministic "verse of the day" based on today's date |
| GET | `/revelation-order` | All surahs ordered by revelation sequence |
| GET | `/meccan` | Surahs revealed in Mecca |
| GET | `/medinan` | Surahs revealed in Medina |

---

### Search — `/api/search`

| Method | Path | Description |
|---|---|---|
| GET | `/` | Token-level search with morphological filters (POS, tense, case, voice, root, lemma, etc.) |
| GET | `/verses` | Full-text search across verse translations and transliterations |
| GET | `/lemmas` | List all distinct lemmas with occurrence counts |
| GET | `/lemmas/autocomplete` | Prefix autocomplete for lemmas |
| GET | `/proper-nouns` | Return all tokens classified as proper nouns |
| GET | `/morphology` | Filter tokens by one or more morphological boolean flags |
| GET | `/phrase` | Exact Arabic phrase search across the corpus |

All list endpoints support `page` and `limit` query parameters for pagination.

---

### Roots — `/api/roots`

| Method | Path | Description |
|---|---|---|
| GET | `/` | Paginated list of all roots (supports `page`, `limit`) |
| GET | `/search/autocomplete` | Prefix autocomplete for root search (`q`, `limit`) |
| GET | `/:root` | Single root detail with meanings from all sources |
| GET | `/:root/occurrences` | Every verse location where this root appears |
| GET | `/:root/co-occurrence` | Roots that frequently appear in the same verses |
| GET | `/:root/lemmas` | All lemma forms derived from this root |
| GET | `/:root/surahs` | Distribution of this root's occurrences across surahs |
| GET | `/:root/network` | Graph-ready network of the root and its co-occurring roots |

Root parameters accept both Arabic script and Buckwalter transliteration.

---

### Compare — `/api/compare`

| Method | Path | Description |
|---|---|---|
| GET | `/surahs` | Side-by-side statistical comparison of two surahs (`a` and `b` query params) |
| GET | `/roots` | Side-by-side comparison of two roots (`a` and `b` query params) |

---

### Statistics — `/api/stats`

| Method | Path | Description |
|---|---|---|
| GET | `/` | Global corpus statistics: total surahs, verses, words, tokens, roots, lemmas |

---

## Data Model

```
Surah
  number (1–114), nameArabic, nameEnglish, revelationType (Meccan|Medinan),
  verseCount, juzStart, hizbStart, revelationOrder

Verse
  surah, ayah, textArabic, textTranslation, page, juz, hizb

Word
  surah, ayah, wordIndex, textArabic, transliteration, translation

Token  (one per morphological segment of a word)
  surah, ayah, word, segment
  POS (part-of-speech), ROOT (Buckwalter), LEM (lemma)
  ~18 boolean morphological flags:
    tense, case, voice, mood, gender, number, person,
    isDefined, isConnected, isPrefixed, isSuffixed, ...

Root
  buckwalter (primary key), arabic

RootMeaning
  root (ref), source, meanings[]
```

---

## Non-Functional Requirements

- **Response time header**: every response includes `X-Response-Time` (ms).
- **Security**: Helmet middleware sets secure HTTP headers; CSP allows inline scripts for the Scalar UI.
- **CORS**: configurable via `CORS_ORIGIN` environment variable.
- **OpenAPI docs**: machine-readable spec at `/openapi.json`; interactive UI at `/reference`.
- **Caching**: lemma and root list results are memoized in-process after the first retrieval.
- **Graceful shutdown**: SIGTERM/SIGINT handlers close the server and disconnect MongoDB cleanly.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PORT` | Yes | Listening port (default 5000) |
| `MONGO_URI` | Yes | MongoDB connection string |
| `CORS_ORIGIN` | No | Allowed CORS origin(s) |
| `GEMINI_API_KEY` | No | Only needed for the `--semanticRoots` data script |

---

## Error Responses

All errors return JSON:

```json
{
  "statusCode": 400,
  "error": "Validation Error",
  "message": "page must be a positive integer"
}
```

Common codes: `400` validation, `404` not found, `429` rate limit exceeded, `503` database unavailable.
