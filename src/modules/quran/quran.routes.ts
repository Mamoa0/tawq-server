import { FastifyInstance } from "fastify";
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
  registerCachePolicy,
  CacheProfile,
  midnightUtcCacheControl,
} from "../../utils/cache.js";

/**
 * Quran routes plugin.
 * Register with: app.register(quranRoutes, { prefix: "/quran" })
 *
 * Almost every endpoint here serves immutable seed data (Quranic text,
 * morphology, structural metadata). These are safe to cache aggressively
 * at the edge / in clients. Two exceptions:
 *   - /random must not be cached (each call should return a fresh verse)
 *   - /daily rotates at UTC midnight, so its TTL is computed dynamically
 */
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

  app.get("/surahs", getAllSurahsHandler);
  app.get("/surahs/:number", getSurahByNumberHandler);
  app.get("/surahs/:number/page/:page", getVersesByPageHandler);
  app.get("/surahs/:number/themes", getSurahThemesHandler);
  app.get("/surah/:s/ayah/:a", getAyahWithWordsHandler);
  app.get("/surah/:s/ayah/:a/navigation", getAyahWithNavigationHandler);
  app.get("/surah/:s/ayah/:a/word/:w", getWordDetailsHandler);
  app.get("/page/:page", getVersesByPageOnlyHandler);
  app.get("/juz/:juz", getVersesByJuzHandler);
  app.get("/hizb/:hizb", getVersesByHizbHandler);
  app.get("/verses", getVersesBatchHandler);
  app.get("/random", getRandomVerseHandler);
  app.get("/daily", getVersesOfTheDayHandler);
  app.get("/sajdas", getSajdasHandler);
  app.get("/revelation-order", getRevelationOrderHandler);
  app.get("/meccan", getMeccanSurahsHandler);
  app.get("/medinan", getMedinanSurahsHandler);
  app.get("/surahs/:number/stats", getSurahStatsHandler);
  app.get("/surahs/:number/word-frequency", getSurahWordFrequencyHandler);
  app.get("/surah/:s/ayah/:a/roots", getAyahRootsHandler);
  app.get("/surah/:s/ayah/:a/analysis", getAyahAnalysisHandler);
}
