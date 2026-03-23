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
} from "./quran.service.js";

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
      message: parsed.error.issues,
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
      message: parsed.error.issues,
    });
    return;
  }

  const data = await getVersesByPage(parsed.data.page);
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
      message: parsed.error.issues,
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
      message: parsed.error.issues,
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
