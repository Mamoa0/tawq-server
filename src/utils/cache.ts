import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Cache-Control header presets.
 *
 * The Quran text, morphology, and root data are static seed data — they
 * never change once the database is populated. We can aggressively cache
 * these responses at the edge and in client browsers.
 *
 * - IMMUTABLE: for Quran text / morphology / root data (1h fresh, 24h stale)
 * - SEARCH: for deterministic search results (10m fresh)
 * - AUTOCOMPLETE: for autocomplete / suggestion endpoints (5m fresh)
 * - NO_STORE: for endpoints that must return fresh content (e.g. /random)
 */
export const CacheProfile = {
  IMMUTABLE: "public, max-age=3600, stale-while-revalidate=86400",
  SEARCH: "public, max-age=600",
  AUTOCOMPLETE: "public, max-age=300",
  NO_STORE: "no-store",
} as const;

/**
 * Build a Cache-Control value that expires at the next UTC midnight.
 * Used for /daily which rolls over at 00:00 UTC.
 */
export function midnightUtcCacheControl(): string {
  const now = new Date();
  const midnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0,
  );
  const seconds = Math.max(60, Math.floor((midnight - now.getTime()) / 1000));
  return `public, max-age=${seconds}`;
}

/**
 * A rule for applying Cache-Control to routes registered in a plugin.
 * `value` may be a static string or a function that computes the header
 * value at response time (used for /daily which expires at UTC midnight).
 */
export type CacheRule = {
  value: string | (() => string);
};

/**
 * Register an onSend hook on the given plugin scope that applies
 * Cache-Control based on the matched route URL.
 *
 * Only 2xx responses get cached — errors must not be cached so clients
 * don't wedge on transient failures. Existing Cache-Control headers are
 * preserved so handlers can opt out or override per request.
 *
 * The routes map keys are the registered Fastify URL patterns
 * (e.g. "/surahs/:number") — not the full URL with prefix.
 */
export function registerCachePolicy(
  app: FastifyInstance,
  routes: Record<string, CacheRule>,
): void {
  app.addHook(
    "onSend",
    async (request: FastifyRequest, reply: FastifyReply, payload) => {
      const status = reply.statusCode;
      if (status < 200 || status >= 300) return payload;
      if (reply.getHeader("Cache-Control")) return payload;

      const url = request.routeOptions?.url;
      if (!url) return payload;

      const rule = routes[url];
      if (!rule) return payload;

      const value = typeof rule.value === "function" ? rule.value() : rule.value;
      reply.header("Cache-Control", value);
      return payload;
    },
  );
}
