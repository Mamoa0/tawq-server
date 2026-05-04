import fp from "fastify-plugin";
import type {
  FastifyPluginAsync,
  FastifyRequest,
  FastifyReply,
  FastifyError,
} from "fastify";
import { validateKey } from "../services/api-key.service.js";
import { keyPrefix } from "../utils/hmac.js";
import { env } from "../config/env.js";
import { createHash } from "node:crypto";

/**
 * API Key Authentication Plugin
 *
 * Fastify preHandler hook that validates the X-API-Key header.
 * Per contracts/auth.contract.md §1-8.
 *
 * Exempt endpoints (§2): /reference, /reference/*, /openapi.json, /health, /ready
 *
 * Reason enum (logged only, never returned to client):
 * - unknown: key not found in database
 * - revoked: key exists but has been revoked
 * - expired: key exists but has passed its expiresAt date
 * - empty: header value is empty or whitespace-only
 * - malformed: key is oversized (>128 chars) or contains non-ASCII
 */

const EXEMPT_PATHS = ["/reference", "/openapi.json", "/health", "/ready"];

// Routes exempt by exact method + path (future auth-required routes on the same prefix are unaffected)
const EXEMPT_ROUTES = new Set(["POST:/api/v1/keys"]);

const isExemptPath = (url: string, method?: string): boolean => {
  const path = url.split("?")[0];
  if (EXEMPT_PATHS.includes(path) || path === "/reference" || path.startsWith("/reference/")) {
    return true;
  }
  if (method) {
    return EXEMPT_ROUTES.has(`${method.toUpperCase()}:${path}`);
  }
  return false;
};

/**
 * In-memory rate limiting for invalid API key attempts.
 * Bucket key: "badkey:" + IP + ":" + first8CharsOfSha256(suppliedKey)
 * Limit: 30 failed attempts per 5 minutes
 */
class InvalidKeyRateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  private readonly windowMs = 5 * 60 * 1000; // 5 minutes
  private readonly maxAttempts = 30;

  check(bucketKey: string): { allowed: boolean; ttl: number } {
    const now = Date.now();
    const bucket = this.buckets.get(bucketKey);

    if (!bucket || now >= bucket.resetAt) {
      // Create new bucket
      this.buckets.set(bucketKey, {
        count: 1,
        resetAt: now + this.windowMs,
      });
      return { allowed: true, ttl: this.windowMs };
    }

    if (bucket.count < this.maxAttempts) {
      bucket.count++;
      return { allowed: true, ttl: bucket.resetAt - now };
    }

    return { allowed: false, ttl: bucket.resetAt - now };
  }

  clear(): void {
    this.buckets.clear();
  }
}

const rateLimiter = new InvalidKeyRateLimiter();

/**
 * Reset the in-process invalid-key rate-limiter buckets.
 * Used by tests to ensure isolation across files; not for production use.
 */
export const clearRateLimiter = (): void => {
  rateLimiter.clear();
};

const _apiKeyPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook(
    "preHandler",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Check if this is an exempt endpoint
      if (isExemptPath(request.url, request.method)) {
        return; // Skip authentication for exempt endpoints
      }

      // Get the API key from the header (case-insensitive)
      const apiKey = request.headers[env.API_KEY_HEADER.toLowerCase()];

      // No API key = anonymous request (allowed per FR-001, contracts/auth §3)
      if (typeof apiKey !== "string") {
        return;
      }

      // Validate the key
      const validation = await validateKey(apiKey);

      if (validation.valid) {
        // Attach context to request for downstream handlers
        (request as any).apiKeyContext = {
          keyId: validation.keyId,
        };
        return;
      }

      // Check rate limit for invalid attempts
      const keyDigest = createHash("sha256").update(apiKey).digest("hex");
      const bucketKey = `badkey:${request.ip}:${keyDigest.slice(0, 8)}`;
      const rateLimitCheck = rateLimiter.check(bucketKey);

      if (!rateLimitCheck.allowed) {
        // Rate limit exceeded → return 429
        reply.header("Retry-After", Math.ceil(rateLimitCheck.ttl / 1000).toString());
        reply.status(429).send({
          statusCode: 429,
          error: "Too Many Requests",
          message: `Rate limit exceeded. Retry after ${rateLimitCheck.ttl}ms.`,
        });
        return;
      }

      // Log the failure with non-sensitive details
      request.log.warn(
        {
          requestId: request.id,
          path: request.url,
          method: request.method,
          status: 401,
          keyPrefix: keyPrefix(apiKey),
          reason: validation.reason,
        },
        "API key validation failed",
      );

      // Return 401 with stable body shape
      const error = Object.assign(
        new Error("The supplied API key is invalid."),
        { statusCode: 401 },
      ) as FastifyError;

      throw error;
    },
  );
};

export const apiKeyPlugin = fp(_apiKeyPlugin, {
  name: "api-key-auth",
  fastify: "5.x",
});
