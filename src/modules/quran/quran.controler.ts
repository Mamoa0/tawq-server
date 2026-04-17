import { FastifyRequest, FastifyReply } from "fastify";
import {
  surahParamSchema,
  pageParamSchema,
  verseParamSchema,
  wordParamSchema,
  SurahParams,
  PageParams,
  VerseParams,
  WordParams,
} from "../../validators/quran.validator.js";
import {
  getAllSurahs,
  getSurahByNumber,
  getVersesByPage,
  getAyahWithWords,
  getWordDetails,
  getVersesByJuz,
  getVersesByHizb,
  getVersesBatch,
} from "./quran.service.js";
import { formatZodError } from "../../utils/validation.js";

export const getAllSurahsHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const data = await getAllSurahs();
  reply.send({ data });
};

export const getSurahByNumberHandler = async (
  request: FastifyRequest<{ Params: SurahParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = surahParamSchema.safeParse(request.params);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const data = await getSurahByNumber(parsed.data.number);
  if (!data) {
    reply
      .status(404)
      .send({
        statusCode: 404,
        error: "Not Found",
        message: "Surah not found",
      });
    return;
  }

  reply.send({ data });
};

export const getVersesByPageHandler = async (
  request: FastifyRequest<{ Params: PageParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = pageParamSchema.safeParse(request.params);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const data = await getVersesByPage(parsed.data.number, parsed.data.page);
  reply.send({ data });
};

export const getAyahWithWordsHandler = async (
  request: FastifyRequest<{ Params: VerseParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = verseParamSchema.safeParse(request.params);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const data = await getAyahWithWords(parsed.data.s, parsed.data.a);
  if (!data) {
    reply
      .status(404)
      .send({ statusCode: 404, error: "Not Found", message: "Ayah not found" });
    return;
  }

  reply.send({ data });
};

export const getWordDetailsHandler = async (
  request: FastifyRequest<{ Params: WordParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = wordParamSchema.safeParse(request.params);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const data = await getWordDetails(
    parsed.data.s,
    parsed.data.a,
    parsed.data.w,
  );
  if (!data) {
    reply
      .status(404)
      .send({ statusCode: 404, error: "Not Found", message: "Word not found" });
    return;
  }

  reply.send({ data });
};

export const getVersesByJuzHandler = async (
  request: FastifyRequest<{ Params: { juz: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const juz = parseInt(request.params.juz, 10);
  if (!juz || juz < 1 || juz > 30) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: "Juz must be between 1 and 30",
    });
    return;
  }

  const data = await getVersesByJuz(juz);
  reply.send({ data });
};

export const getVersesByHizbHandler = async (
  request: FastifyRequest<{ Params: { hizb: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const hizb = parseInt(request.params.hizb, 10);
  if (!hizb || hizb < 1 || hizb > 60) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: "Hizb must be between 1 and 60",
    });
    return;
  }

  const data = await getVersesByHizb(hizb);
  reply.send({ data });
};

export const getVersesBatchHandler = async (
  request: FastifyRequest<{ Querystring: { refs: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { refs } = request.query;
  if (!refs || typeof refs !== "string" || !refs.trim()) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: "refs query param required (format: surah:ayah,surah:ayah)",
    });
    return;
  }

  const parsed = refs
    .split(",")
    .map((ref) => {
      const [s, a] = ref.trim().split(":");
      const surah = parseInt(s, 10);
      const ayah = parseInt(a, 10);
      return { surah, ayah };
    })
    .filter((ref) => !isNaN(ref.surah) && !isNaN(ref.ayah));

  if (parsed.length === 0) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: "Invalid refs format",
    });
    return;
  }

  const data = await getVersesBatch(parsed);
  reply.send({ data });
};
