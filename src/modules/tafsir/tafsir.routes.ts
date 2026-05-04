import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listSourcesHandler,
  fetchTafsirHandler,
} from "./tafsir.controller.js";
import {
  surahParamSchema,
  ayahParamSchema,
  sourcesQuerySchema,
  sourceListQuerySchema,
  tafsirFetchResponseSchema,
} from "../../validators/tafsir.validator.js";
import { registerCachePolicy, CacheProfile } from "../../utils/cache.js";

export async function tafsirRoutes(app: FastifyInstance): Promise<void> {
  registerCachePolicy(app, {
    "/sources": { value: CacheProfile.IMMUTABLE },
    "/:surah/:ayah": { value: CacheProfile.SEARCH },
  });

  app.get("/sources", {
    schema: {
      summary: "List Tafsir Sources",
      description: "Get all available tafsir (Quranic exegesis) sources",
      tags: ["Tafsir"],
      querystring: sourceListQuerySchema,
      zodResponse: { 200: z.object({ data: z.array(z.any()) }) },
    },
  }, listSourcesHandler);

  app.get("/:surah/:ayah", {
    schema: {
      summary: "Fetch Tafsir for Ayah",
      description: "Get tafsir commentary for a specific ayah from multiple sources",
      tags: ["Tafsir"],
      params: z.object({
        surah: surahParamSchema,
        ayah: ayahParamSchema,
      }),
      querystring: z.object({
        sources: sourcesQuerySchema,
      }),
      zodResponse: { 200: tafsirFetchResponseSchema },
    },
  }, fetchTafsirHandler);
}