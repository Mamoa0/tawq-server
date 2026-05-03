import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  searchHandler,
  getLemmasHandler,
  searchLemmasAutocompleteHandler,
  searchVersesHandler,
  getProperNounsHandler,
  searchMorphologyHandler,
  searchPhraseHandler,
} from "./search.controller.js";
import {
  searchQuerySchema,
  verseSearchSchema,
  morphologySearchSchema,
  phraseSearchSchema,
} from "../../validators/search.validator.js";
import { autocompleteSchema, paginationSchema } from "../../validators/pagination.js";
import { registerCachePolicy, CacheProfile } from "../../utils/cache.js";

const paginatedResponse = z.object({
  data: z.array(z.any()),
  meta: z.object({
    page: z.number(),
    limit: z.number(),
    totalCount: z.number(),
    totalPages: z.number(),
  }),
});

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  registerCachePolicy(app, {
    "/": { value: CacheProfile.SEARCH },
    "/lemmas": { value: CacheProfile.IMMUTABLE },
    "/lemmas/autocomplete": { value: CacheProfile.AUTOCOMPLETE },
    "/verses": { value: CacheProfile.SEARCH },
    "/proper-nouns": { value: CacheProfile.IMMUTABLE },
    "/morphology": { value: CacheProfile.SEARCH },
    "/phrase": { value: CacheProfile.SEARCH },
  });

  app.get("/", {
    schema: {
      summary: "Search Tokens",
      description: "Search for tokens across the Quran",
      tags: ["Search"],
      querystring: searchQuerySchema,
      zodResponse: { 200: paginatedResponse },
    },
  }, searchHandler);

  app.get("/lemmas", {
    schema: {
      summary: "Get All Lemmas",
      description: "Get a list of all distinct lemmas",
      tags: ["Search"],
      querystring: paginationSchema,
      zodResponse: {
        200: z.object({
          data: z.array(z.string()),
          meta: z.object({
            page: z.number(),
            limit: z.number(),
            totalCount: z.number(),
            totalPages: z.number(),
          }),
        }),
      },
    },
  }, getLemmasHandler);

  app.get("/lemmas/autocomplete", {
    schema: {
      summary: "Search Lemmas Autocomplete",
      description: "Autocomplete for lemma search",
      tags: ["Search"],
      querystring: autocompleteSchema,
      zodResponse: { 200: z.object({ data: z.array(z.string()) }) },
    },
  }, searchLemmasAutocompleteHandler);

  app.get("/verses", {
    schema: {
      summary: "Search Verses",
      description: "Search verse translations by keyword",
      tags: ["Search"],
      querystring: verseSearchSchema,
      zodResponse: { 200: paginatedResponse },
    },
  }, searchVersesHandler);

  app.get("/proper-nouns", {
    schema: {
      summary: "Get Proper Nouns",
      description: "Get all proper nouns (POS=PN) with occurrence counts and locations",
      tags: ["Search"],
      querystring: paginationSchema,
      zodResponse: {
        200: z.object({
          data: z.array(
            z.object({
              lemma: z.string(),
              count: z.number(),
              locations: z.array(z.object({ surah: z.number(), ayah: z.number() })),
            }),
          ),
          meta: z.object({
            page: z.number(),
            limit: z.number(),
            totalCount: z.number(),
            totalPages: z.number(),
          }),
        }),
      },
    },
  }, getProperNounsHandler);

  app.get("/morphology", {
    schema: {
      summary: "Search by Morphology",
      description: "Filter tokens by morphological features (tense, case, voice, gender, number, POS)",
      tags: ["Search"],
      querystring: morphologySearchSchema,
      zodResponse: { 200: paginatedResponse },
    },
  }, searchMorphologyHandler);

  app.get("/phrase", {
    schema: {
      summary: "Phrase Search",
      description: "Search verse translations for an exact phrase, with optional Surah scoping",
      tags: ["Search"],
      querystring: phraseSearchSchema,
      zodResponse: { 200: paginatedResponse },
    },
  }, searchPhraseHandler);
}
