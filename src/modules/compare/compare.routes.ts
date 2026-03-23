import { FastifyInstance } from "fastify";
import { compareSurahsHandler, compareRootsHandler } from "./compare.controller.js";

/**
 * Compare routes plugin.
 * Register with: app.register(compareRoutes, { prefix: "/api/compare" })
 */
export default async function compareRoutes(app: FastifyInstance): Promise<void> {
  app.get("/surahs", compareSurahsHandler);
  app.get("/roots", compareRootsHandler);
}
