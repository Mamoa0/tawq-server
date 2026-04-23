import { FastifyInstance } from "fastify";
import { compareSurahsHandler, compareRootsHandler } from "./compare.controller.js";
import { registerCachePolicy, CacheProfile } from "../../utils/cache.js";

/**
 * Compare routes plugin.
 * Register with: app.register(compareRoutes, { prefix: "/api/v1/compare" })
 *
 * Comparison results are computed from immutable seed data, so they
 * are safe to cache aggressively.
 */
export default async function compareRoutes(app: FastifyInstance): Promise<void> {
  registerCachePolicy(app, {
    "/surahs": { value: CacheProfile.IMMUTABLE },
    "/roots": { value: CacheProfile.IMMUTABLE },
  });

  app.get("/surahs", compareSurahsHandler);
  app.get("/roots", compareRootsHandler);
}
