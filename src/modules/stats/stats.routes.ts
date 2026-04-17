import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getGlobalStats } from "./stats.service.js";

export const getStatsHandler = async (
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const data = await getGlobalStats();
  reply.send({ data });
};

export async function statsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/", getStatsHandler);
}
