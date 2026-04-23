import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getGlobalStats } from "./stats.service.js";
import { registerCachePolicy, CacheProfile } from "../../utils/cache.js";

export const getStatsHandler = async (
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const data = await getGlobalStats();
  reply.send({ data });
};

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  // Global stats are aggregated from immutable seed data — the numbers
  // don't change between deploys, so we cache aggressively.
  registerCachePolicy(app, {
    "/": { value: CacheProfile.IMMUTABLE },
  });

  app.get("/", getStatsHandler);
}
