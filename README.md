# Tawq Server

A Fastify-based REST API for exploring the Quranic text with deep linguistic analysis. Search verses, roots, morphological features, and statistical comparisons with zero external dependencies (except MongoDB).

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 5.0+ running locally or remotely

### Setup

1. **Clone and install:**
   ```bash
   git clone <repo>
   cd tawq-server
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env and set:
   # - MONGO_URI: your MongoDB connection string
   # - PORT: server port (default 5000)
   # - CORS_ORIGIN: allowed origin (default http://localhost:3000)
   # - GEMINI_API_KEY: only needed for --semanticRoots seed script
   ```

3. **Seed the database (first time only):**
   ```bash
   npm run seed:all
   ```
   This downloads the Quranic corpus (~300MB) and seeds ~6.7M tokens. Takes 10–20 minutes.

   Required files at repo root:
   - `quran_data.json` — text, translations, metadata
   - `quranic-corpus-morphology-0.4.txt` — morphological analysis

4. **Start dev server:**
   ```bash
   npm run dev
   ```
   Server runs on `http://localhost:5000`. API docs at `/reference`.

## Usage

### API Overview

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/quran/surahs` | List all surahs |
| `GET /api/v1/quran/surah/:s/ayah/:a` | Single verse with words |
| `GET /api/v1/quran/juz/:juz` | All verses in a juz (1–30) |
| `GET /api/v1/quran/hizb/:hizb` | All verses in a hizb (1–60) |
| `GET /api/v1/quran/page/:page` | All verses on a Quran page |
| `GET /api/v1/quran/verses?refs=2:255,2:256` | Batch fetch verses |
| `GET /api/v1/search?form=...&POS=...` | Token search with filters |
| `GET /api/v1/roots` | All roots (paginated) |
| `GET /api/v1/roots/:root/occurrences` | Where a root appears |
| `GET /api/v1/roots/:root/co-occurrence` | Roots that co-occur with this root |
| `GET /api/v1/compare/surahs?a=1&b=2` | Compare two surahs |
| `GET /api/v1/stats` | Global Quran statistics |
| `GET /health` | Health check (503 if DB disconnected) |

All responses wrapped in `{ data: ... }` or `{ data, totalCount, page, limit, totalPages }` for paginated endpoints.

### Examples

**Search for all nouns in Ayah 1:1:**
```bash
curl "http://localhost:5000/api/v1/search?surah=1&ayah=1&POS=NOUN"
```

**Get all verses containing the root R-H-M (mercy):**
```bash
curl "http://localhost:5000/api/v1/roots/رحم/occurrences"
```

**Compare Surahs Al-Baqarah and Ali-Imran:**
```bash
curl "http://localhost:5000/api/v1/compare/surahs?a=2&b=3"
```

## Development

### Available Commands

```bash
npm run dev              # Start dev server with hot-reload
npm run build           # Compile TypeScript
npm run start           # Run compiled server

# Seeding (one-time or refresh data)
npm run seed:all        # Full seed: surahs → verses → words → tokens → roots
npm run db:reset        # Clear and re-seed everything
npm run seed:semanticRoots  # Enrich roots with Gemini API (slow, requires GEMINI_API_KEY)

# Individual steps (if you only need to refresh one collection)
npm run seed:surahs
npm run seed:verses
npm run seed:words
npm run seed:tokens
npm run seed:roots
npm run seed:verify     # Check data consistency
```

### Project Structure

```
src/
├── server.ts                 # Fastify app, middleware, routes
├── config/env.ts             # Environment validation
├── database/
│   ├── connection.ts         # MongoDB connection
│   └── models/               # Mongoose schemas
├── modules/                  # Feature modules (quran, roots, search, etc.)
│   ├── quran/
│   ├── roots/
│   ├── search/
│   ├── compare/
│   └── stats/
├── middlewares/              # Error handler
├── validators/               # Zod schemas for request validation
├── utils/                    # Buckwalter ↔ Arabic conversion, helpers
├── scripts/                  # Data seeding pipelines
└── docs/                     # OpenAPI generation
```

**Key patterns:**
- All services use raw MongoDB driver (`monogs`) for performance
- Buckwalter transliteration throughout internal storage; converted to Arabic on response
- In-memory TTL caches for roots and lemmas (1 hour)
- Rate limiting: 100 requests/min per IP
- Graceful shutdown on SIGTERM/SIGINT

### Data Model

```
Surah (114) → Verse (6,236) → Word (77,430) → Token (6.7M)
```

- **Surah**: Metadata (name, revelation order, theme keywords)
- **Verse**: Text, translation, page, juz, hizb, sajda marker, next/prev pointers
- **Word**: Arabic form, transliteration, position in verse
- **Token**: Morphological analysis (POS, ROOT, lemma, gender, case, mood, etc.)
- **Root**: Meaning, frequency, co-occurring roots, related phonetic/semantic groups

## Architecture Notes

- **Fastify 5** with `@fastify/cors`, `@fastify/rate-limit`, `@fastify/helmet` for security
- **MongoDB** native driver (not Mongoose ORM) for raw queries; Mongoose models for schema only
- **Zod** for request validation and OpenAPI schema generation
- **TypeScript** with ESM (`"type": "module"`)
- **Node.js loader**: `ts-node/esm` for runtime TS execution (scripts, dev server)

## API Versioning

All routes are under `/api/v1/`. If breaking changes are needed, they'll be under `/api/v2/` without affecting existing clients.

## Security

- Rate limiting: 100 req/min per IP (configurable)
- CORS: whitelisted to `CORS_ORIGIN` env var (default: `http://localhost:3000`)
- Helmet for security headers (CSP, HSTS, X-Frame-Options, etc.)
- Body size limit: 100KB
- Graceful shutdown on container termination
- Regex injection protection on search filters
- Stack traces hidden in production

## Deployment

Set environment variables in your deployment:
```bash
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/quran_db
CORS_ORIGIN=https://yourdomain.com
```

For Kubernetes/Docker:
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist .
USER node
EXPOSE 5000
CMD ["node", "server.js"]
```

(See `Dockerfile` for multi-stage production build.)

## Contributing

1. Create a feature branch
2. Make changes and run `npm run build` to verify TypeScript
3. Commit with a clear message
4. Push and open a PR

## License

ISC
