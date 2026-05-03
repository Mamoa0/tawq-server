import { FastifyInstance } from "fastify";
import { z } from "zod";
import { compareSurahsHandler, compareRootsHandler } from "./compare.controller.js";
import { registerCachePolicy, CacheProfile } from "../../utils/cache.js";

export default async function compareRoutes(app: FastifyInstance): Promise<void> {
  registerCachePolicy(app, {
    "/surahs": { value: CacheProfile.IMMUTABLE },
    "/roots": { value: CacheProfile.IMMUTABLE },
  });

  app.get("/surahs", {
    schema: {
      summary: "Compare Surahs",
      description: "Compare statistics and themes between two Surahs",
      tags: ["Compare"],
      querystring: z.object({
        a: z.coerce.number().int().min(1).max(114).describe("First Surah number"),
        b: z.coerce.number().int().min(1).max(114).describe("Second Surah number"),
      }),
      zodResponse: { 200: z.any() },
    },
  }, compareSurahsHandler);

  app.get("/roots", {
    schema: {
      summary: "Compare Roots",
      description: "Compare statistics, overlaps, and co-occurrences of two roots",
      tags: ["Compare"],
      querystring: z.object({
        a: z.string().describe("First root (Arabic)"),
        b: z.string().describe("Second root (Arabic)"),
      }),
      zodResponse: { 200: z.any() },
    },
  }, compareRootsHandler);
}
