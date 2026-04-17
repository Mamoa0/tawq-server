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
} from "./quran.controler.js";

/**
 * Quran routes plugin.
 * Register with: app.register(quranRoutes, { prefix: "/quran" })
 */
export async function quranRoutes(app: FastifyInstance): Promise<void> {
  app.get("/surahs", getAllSurahsHandler);
  app.get("/surahs/:number", getSurahByNumberHandler);
  app.get("/surahs/:number/page/:page", getVersesByPageHandler);
  app.get("/surah/:s/ayah/:a", getAyahWithWordsHandler);
  app.get("/surah/:s/ayah/:a/word/:w", getWordDetailsHandler);
  app.get("/juz/:juz", getVersesByJuzHandler);
  app.get("/hizb/:hizb", getVersesByHizbHandler);
  app.get("/verses", getVersesBatchHandler);
}
