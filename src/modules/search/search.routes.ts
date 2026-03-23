import { FastifyInstance } from "fastify";
import { searchHandler, getLemmasHandler } from "./search.controler.js";

/**
 * Search routes plugin.
 * Register with: app.register(searchRoutes, { prefix: "/api/search" })
 */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", searchHandler);
  app.get("/lemmas", getLemmasHandler);
}
