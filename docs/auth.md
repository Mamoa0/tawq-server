# API Authentication

The Quran API uses opaque API keys transmitted via the `X-API-Key` HTTP header.

## Sending the key

```bash
curl https://api.example.com/api/quran/surahs \
  -H 'X-API-Key: <your-key>'
```

The key MUST be supplied in the header. Keys placed in query strings (`?apiKey=...`), request bodies, or `Authorization: Bearer ...` headers are ignored — those requests are treated as anonymous.

## Obtaining a key (self-service)

Hit the public key-generation endpoint — no account or sign-up required:

```bash
curl -X POST https://api.example.com/api/v1/keys \
  -H 'Content-Type: application/json' \
  -d '{"label":"my-app"}'
```

Response (201):

```json
{
  "id": "<objectId>",
  "key": "<64-char hex plaintext>",
  "label": "my-app",
  "createdAt": "2026-05-04T12:00:00.000Z"
}
```

The `key` is the only time the plaintext is shown — store it immediately. If you lose it, generate a new one. Rate limit: **5 keys per IP per hour** (429 with `Retry-After` on exceed). The `label` field is optional (max 64 chars); defaults to `"self-service"`.

## Public endpoints (no key required)

- `POST /api/v1/keys` — self-service key generation (rate-limited)
- `GET /openapi.json` — machine-readable API spec
- `GET /reference`, `GET /reference/*` — Scalar docs UI
- `GET /health`, `GET /ready` — liveness/readiness probes

## Error responses

When a key is missing-but-required, invalid, revoked, expired, empty, or malformed, the server returns:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: ApiKey realm="quran-api"
Content-Type: application/json; charset=utf-8

{
  "error": "InvalidApiKey",
  "message": "The supplied API key is invalid.",
  "requestId": "<uuid>"
}
```

The body is byte-identical across rejection causes (no enumeration leak). Quote the `requestId` when reporting issues.

## Rate limiting

Failed-key attempts are rate-limited per IP + key prefix: 30 attempts per 5 minutes. On exceed, the server returns `429 Too Many Requests` with a `Retry-After` header. Successful requests with a valid key are not affected.

## Provisioning

Keys are issued by an administrator running:

```bash
npm run keys:create -- --label "<consumer-name>" [--expires 2026-12-31]
```

The plaintext token is printed **once** at creation and cannot be recovered. Store it securely. To revoke:

```bash
npm run keys:revoke -- --id <objectId>
```
