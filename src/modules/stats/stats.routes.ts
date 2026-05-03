import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
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
  registerCachePolicy(app, {
    "/": { value: CacheProfile.IMMUTABLE },
  });

  app.get("/", {
    schema: {
      summary: "Get Global Stats",
      description: "Get global Quran statistics",
      tags: ["Analytics"],
      zodResponse: {
        200: z.object({
          data: z.object({
            total_verses: z.number(),
            total_words: z.number(),
            total_tokens: z.number(),
            total_roots: z.number(),
            total_lemmas: z.number(),
            avg_tokens_per_word: z.number(),
            top_10_roots: z.array(z.object({ root: z.string(), count: z.number() })),
            pos_distribution: z.record(z.string(), z.number()),
            verb_tenses: z.record(z.string(), z.number()),
          }),
        }),
      },
    },
  }, getStatsHandler);
}
