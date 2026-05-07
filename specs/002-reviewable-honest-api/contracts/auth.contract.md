# Contract: API-key Authentication

**Feature**: `002-reviewable-honest-api` · **Satisfies**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007

Externally observable contract for API-key authentication. Any change to any clause here is a breaking change and must be reflected in `/openapi.json`.

---

## 1. Transport

- Credentials are transmitted in the HTTP request header **`X-API-Key`** only.
- The server MUST NOT read the API key from query strings, request bodies, cookies, or any other `Authorization`-family header.
- Header value format: an opaque token string, 1–128 printable ASCII characters, no whitespace.

## 2. Exempt endpoints (no authentication required; header is ignored if present)

- `GET /reference` and all paths under `/reference/*` (Scalar UI)
- `GET /openapi.json`
- `GET /health`
- `GET /ready`

On these endpoints, an `X-API-Key` header — valid, invalid, or empty — MUST NOT change the response.

## 3. Authenticated endpoints (all others)

For any endpoint not in §2:

| Request state                                      | Response                                      | Notes |
|----------------------------------------------------|-----------------------------------------------|-------|
| `X-API-Key` header absent                          | 200 (anonymous, per existing behavior)        | FR-001 default; anonymous rate-limit applies |
| `X-API-Key: ""` (empty string)                     | **401** with `InvalidApiKey` body             | FR-003 |
| `X-API-Key: "   "` (whitespace only)               | **401** with `InvalidApiKey` body             | FR-003 |
| `X-API-Key: <unknown-valid-format>`                | **401** with `InvalidApiKey` body             | FR-002 |
| `X-API-Key: <revoked-key>`                         | **401** with `InvalidApiKey` body             | FR-004 (indistinguishable from unknown) |
| `X-API-Key: <expired-key>`                         | **401** with `InvalidApiKey` body             | FR-004 |
| `X-API-Key: <active-key>`                          | 200 (authenticated request processed)         | FR-001 |
| `X-API-Key: <malformed, >128 chars or non-ASCII>` | **401** with `InvalidApiKey` body             | Malformed input is not a server error |

## 4. 401 response body (stable contract)

```json
{
  "error": "InvalidApiKey",
  "message": "The supplied API key is invalid.",
  "requestId": "<uuid>"
}
```

- `error`: stable string; clients key off this. The ONLY permitted value for invalid-API-key responses is the literal `"InvalidApiKey"` — server-side categorization of WHY the key was rejected (the `reason` enum in §8: `unknown | revoked | expired | empty | malformed`) is recorded in logs ONLY and MUST NEVER appear in the response body or headers.
- `message`: generic; MUST NOT reveal whether a key previously existed or the reason for rejection (FR-004). The message intentionally omits enumerating the possible reasons (revoked, expired, etc.); that distinction exists only in logs (§8) to prevent information leakage. A single fixed string is used for all five reasons so that response bodies are byte-identical across reasons (excluding `requestId`).
- `requestId`: the same UUID the server logged for this request (used for correlation with server logs).

HTTP response headers:

- `Content-Type: application/json; charset=utf-8`
- `WWW-Authenticate: ApiKey realm="quran-api"` (per RFC 7235 §2; enables standard client handling)
- `X-Request-Id: <uuid>` (already emitted by existing `onSend` hook; included for completeness)

## 5. Rate limiting of invalid attempts (FR-005)

- Requests whose `X-API-Key` header is present but fails validation are counted in a **dedicated rate-limit bucket**, separate from the anonymous global bucket.
- Bucket key: `"badkey:" + client-ip + ":" + firstEightCharsOfHexSha256(suppliedKey)`.
- Limit: **30 failed attempts per bucket per 5 minutes**.
- On exceed: **429 Too Many Requests** with `Retry-After` header; body follows the existing rate-limit error shape (not the auth 401 shape).
- Successful-key validations do NOT count toward this bucket; valid traffic is unaffected.

## 6. Performance & resource contract

- Median validation overhead: **< 2 ms**. p99: **< 50 ms** (FR-005, SC-005).
- At most **one** indexed database read per request (lookup by `hashedKey`).
- When a key was validated within the last 60 s by the same process, the validation result MAY be served from an in-process LRU cache (≤ 10,000 entries, 60 s TTL); revocations made in the same process invalidate the cache entry synchronously.

## 7. OpenAPI declaration (FR-007, FR-012)

`/openapi.json` MUST include:

```yaml
components:
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: X-API-Key
      description: |
        Optional API key for elevated quotas and future gated endpoints.
        Obtain a key from the project administrator.
```

Every authenticated operation MUST reference this scheme via `security: [{ ApiKeyAuth: [] }]`. Exempt endpoints (§2) MUST NOT reference it. The parity test (`tests/parity/security-declaration.test.ts`) enforces this in both directions.

## 8. Logging & observability contract

For every 401 caused by an invalid key, the server emits one structured log record at `warn` level with:

- `requestId` (same as in the response body)
- `path`, `method`, `status: 401`
- `keyPrefix` (first 8 chars of the SHA-256 hex digest of the supplied key — NOT the key itself, NOT the pepper-HMAC)
- `reason` (one of `"unknown"`, `"revoked"`, `"expired"`, `"empty"`, `"malformed"`) — for internal observability only; NEVER returned to the client (FR-004).

Plaintext keys MUST NOT appear in any log, metric, trace, exception, or error report.

## 9. Contract test inventory (`tests/contract/auth/`)

| Test file | FR refs | What it proves |
|---|---|---|
| `invalid-key.test.ts` | FR-002, FR-004, FR-007 | Unknown, revoked, expired keys all return 401 with identical body shape |
| `empty-key.test.ts` | FR-003 | Empty and whitespace-only values return 401 |
| `exempt-endpoints.test.ts` | FR-006 | Invalid key on `/openapi.json`, `/reference`, `/health`, `/ready` does NOT return 401 |
| `rate-limited-invalid.test.ts` | FR-005 | 31st invalid attempt in the window returns 429 (not 401); valid-key traffic unaffected |
| `valid-key.test.ts` | FR-001 | Active key proceeds normally; `WWW-Authenticate` header absent on success |
| `no-leak.test.ts` | FR-004, §8 | Response body for revoked key equals response body for unknown key byte-for-byte (minus `requestId`) |

All tests run under Vitest in the `auth-contract` CI job.
