import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getAllSurahsHandler,
  getSurahByNumberHandler,
  getVersesByPageHandler,
  getAyahWithWordsHandler,
  getWordDetailsHandler,
  getVersesByJuzHandler,
  getVersesByHizbHandler,
  getVersesBatchHandler,
  getVersesByPageOnlyHandler,
  getAyahWithNavigationHandler,
  getSurahThemesHandler,
  getRandomVerseHandler,
  getVersesOfTheDayHandler,
  getSurahStatsHandler,
  getAyahRootsHandler,
  getAyahAnalysisHandler,
  getSurahWordFrequencyHandler,
  getRevelationOrderHandler,
  getMeccanSurahsHandler,
  getMedinanSurahsHandler,
  getSajdasHandler,
} from "./quran.controller.js";
import {
  surahParamSchema,
  pageParamSchema,
  verseParamSchema,
  wordParamSchema,
} from "../../validators/quran.validator.js";
import {
  registerCachePolicy,
  CacheProfile,
  midnightUtcCacheControl,
} from "../../utils/cache.js";

export async function quranRoutes(app: FastifyInstance): Promise<void> {
  registerCachePolicy(app, {
    "/surahs": { value: CacheProfile.IMMUTABLE },
    "/surahs/:number": { value: CacheProfile.IMMUTABLE },
    "/surahs/:number/page/:page": { value: CacheProfile.IMMUTABLE },
    "/surahs/:number/themes": { value: CacheProfile.IMMUTABLE },
    "/surah/:s/ayah/:a": { value: CacheProfile.IMMUTABLE },
    "/surah/:s/ayah/:a/navigation": { value: CacheProfile.IMMUTABLE },
    "/surah/:s/ayah/:a/word/:w": { value: CacheProfile.IMMUTABLE },
    "/page/:page": { value: CacheProfile.IMMUTABLE },
    "/juz/:juz": { value: CacheProfile.IMMUTABLE },
    "/hizb/:hizb": { value: CacheProfile.IMMUTABLE },
    "/verses": { value: CacheProfile.IMMUTABLE },
    "/random": { value: CacheProfile.NO_STORE },
    "/daily": { value: midnightUtcCacheControl },
    "/sajdas": { value: CacheProfile.IMMUTABLE },
    "/revelation-order": { value: CacheProfile.IMMUTABLE },
    "/meccan": { value: CacheProfile.IMMUTABLE },
    "/medinan": { value: CacheProfile.IMMUTABLE },
    "/surahs/:number/stats": { value: CacheProfile.IMMUTABLE },
    "/surahs/:number/word-frequency": { value: CacheProfile.IMMUTABLE },
    "/surah/:s/ayah/:a/roots": { value: CacheProfile.IMMUTABLE },
    "/surah/:s/ayah/:a/analysis": { value: CacheProfile.IMMUTABLE },
  });

  app.get("/surahs", {
    schema: {
      summary: "Get All Surahs",
      description: "Get a list of all Surahs",
      tags: ["Reading"],
      zodResponse: { 200: z.object({ data: z.array(z.any()) }) },
    },
  }, getAllSurahsHandler);

  app.get("/surahs/:number", {
    schema: {
      summary: "Get Surah",
      description: "Get a Surah by its number",
      tags: ["Reading"],
      params: surahParamSchema,
      zodResponse: { 200: z.object({ data: z.any() }) },
    },
  }, getSurahByNumberHandler);

  app.get("/surahs/:number/page/:page", {
    schema: {
      summary: "Get Page Verses",
      description: "Get verses by Surah page number",
      tags: ["Reading"],
      params: pageParamSchema,
      zodResponse: { 200: z.object({ data: z.any() }) },
    },
  }, getVersesByPageHandler);

  app.get("/surahs/:number/themes", {
    schema: {
      summary: "Get Surah Themes",
      description: "Get Surah themes and top roots",
      tags: ["Reading"],
      params: surahParamSchema,
      zodResponse: { 200: z.object({ data: z.any() }) },
    },
  }, getSurahThemesHandler);

  app.get("/surah/:s/ayah/:a", {
    schema: {
      summary: "Get Ayah",
      description: "Get specific ayah with its words",
      tags: ["Reading"],
      params: verseParamSchema,
      zodResponse: { 200: z.object({ data: z.any() }) },
    },
  }, getAyahWithWordsHandler);

  app.get("/surah/:s/ayah/:a/navigation", {
    schema: {
      summary: "Get Ayah Navigation",
      description: "Get ayah with next/prev navigation links",
      tags: ["Reading"],
      params: verseParamSchema,
      zodResponse: { 200: z.object({ data: z.any() }) },
    },
  }, getAyahWithNavigationHandler);

  app.get("/surah/:s/ayah/:a/word/:w", {
    schema: {
      summary: "Get Word Details",
      description: "Get details for a specific word in an ayah",
      tags: ["Reading"],
      params: wordParamSchema,
      zodResponse: { 200: z.object({ data: z.any() }) },
    },
  }, getWordDetailsHandler);

  app.get("/page/:page", {
    schema: {
      summary: "Get Page Verses",
      description: "Get all verses on a Quran page regardless of surah",
      tags: ["Reading"],
      params: z.object({ page: z.coerce.number().int().min(1).max(604) }),
      zodResponse: { 200: z.object({ data: z.array(z.any()) }) },
    },
  }, getVersesByPageOnlyHandler);

  app.get("/juz/:juz", {
    schema: {
      summary: "Get Juz Verses",
      description: "Get all verses in a Juz (1-30)",
      tags: ["Reading"],
      params: z.object({ juz: z.coerce.number().int().min(1).max(30) }),
      zodResponse: { 200: z.object({ data: z.array(z.any()) }) },
    },
  }, getVersesByJuzHandler);

  app.get("/hizb/:hizb", {
    schema: {
      summary: "Get Hizb Verses",
      description: "Get all verses in a Hizb (1-60)",
      tags: ["Reading"],
      params: z.object({ hizb: z.coerce.number().int().min(1).max(60) }),
      zodResponse: { 200: z.object({ data: z.array(z.any()) }) },
    },
  }, getVersesByHizbHandler);

  app.get("/verses", {
    schema: {
      summary: "Get Batch Verses",
      description: "Batch fetch multiple verses by references (e.g., 2:255,2:256)",
      tags: ["Reading"],
      querystring: z.object({
        refs: z.string().describe("Comma-separated verse references (surah:ayah)"),
      }),
      zodResponse: { 200: z.object({ data: z.array(z.any()) }) },
    },
  }, getVersesBatchHandler);

  app.get("/random", {
    schema: {
      summary: "Get Random Verse",
      description: "Get a random verse from the Quran",
      tags: ["Reading"],
      zodResponse: { 200: z.object({ data: z.any() }) },
    },
  }, getRandomVerseHandler);

  app.get("/daily", {
    schema: {
      summary: "Get Verse of the Day",
      description: "Get verses for today (deterministic, based on day of year)",
      tags: ["Reading"],
      zodResponse: { 200: z.object({ data: z.array(z.any()) }) },
    },
  }, getVersesOfTheDayHandler);

  app.get("/sajdas", {
    schema: {
      summary: "List Sajda Verses",
      description: "Return every sajda (prostration) verse in canonical order, each annotated with its classification.",
      tags: ["Reading"],
      zodResponse: {
        200: z.object({
          data: z.array(
            z.object({
              surah: z.number(),
              ayah: z.number(),
              type: z.enum(["recommended", "obligatory"]),
              isSajda: z.literal(true),
              sajdaType: z.enum(["recommended", "obligatory"]),
              arabic: z.string().nullable(),
              translation: z.string().nullable(),
              page: z.number().nullable(),
              juz: z.number().nullable(),
            }),
          ),
        }),
      },
    },
  }, getSajdasHandler);

  app.get("/revelation-order", {
    schema: {
      summary: "Get Surahs by Revelation Order",
      description: "Get all Surahs sorted by their revelation order (chronological)",
      tags: ["Reading"],
      zodResponse: { 200: z.object({ data: z.array(z.any()) }) },
    },
  }, getRevelationOrderHandler);

  app.get("/meccan", {
    schema: {
      summary: "Get Meccan Surahs",
      description: "Get all Meccan Surahs (revealed in Makkah) sorted by revelation order",
      tags: ["Reading"],
      zodResponse: { 200: z.object({ data: z.array(z.any()) }) },
    },
  }, getMeccanSurahsHandler);

  app.get("/medinan", {
    schema: {
      summary: "Get Medinan Surahs",
      description: "Get all Medinan Surahs (revealed in Madinah) sorted by revelation order",
      tags: ["Reading"],
      zodResponse: { 200: z.object({ data: z.array(z.any()) }) },
    },
  }, getMedinanSurahsHandler);

  app.get("/surahs/:number/stats", {
    schema: {
      summary: "Get Surah Stats",
      description: "Get detailed linguistic statistics for a Surah",
      tags: ["Reading"],
      params: surahParamSchema,
      zodResponse: { 200: z.object({ data: z.any() }) },
    },
  }, getSurahStatsHandler);

  app.get("/surahs/:number/word-frequency", {
    schema: {
      summary: "Get Surah Word Frequency",
      description: "Get top N most frequent lemmas in a Surah",
      tags: ["Reading"],
      params: surahParamSchema,
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
      }),
      zodResponse: {
        200: z.object({
          data: z.object({
            surah: z.number(),
            limit: z.number(),
            frequencies: z.array(
              z.object({ lemma: z.string(), count: z.number(), forms: z.array(z.string()) }),
            ),
          }),
        }),
      },
    },
  }, getSurahWordFrequencyHandler);

  app.get("/surah/:s/ayah/:a/roots", {
    schema: {
      summary: "Get Ayah Roots",
      description: "Get all distinct roots in a specific ayah",
      tags: ["Reading"],
      params: verseParamSchema,
      zodResponse: {
        200: z.object({
          data: z.object({
            surah: z.number(),
            ayah: z.number(),
            roots: z.array(
              z.object({ root: z.string(), count: z.number(), lemmas: z.array(z.string()) }),
            ),
          }),
        }),
      },
    },
  }, getAyahRootsHandler);

  app.get("/surah/:s/ayah/:a/analysis", {
    schema: {
      summary: "Get Ayah Analysis",
      description: "Get full morphological analysis of every word segment in an ayah",
      tags: ["Reading"],
      params: verseParamSchema,
      zodResponse: { 200: z.object({ data: z.any() }) },
    },
  }, getAyahAnalysisHandler);
}
