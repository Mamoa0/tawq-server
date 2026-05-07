import { FastifyRequest, FastifyReply } from "fastify";
import {
  surahParamSchema,
  ayahParamSchema,
  sourcesQuerySchema,
  sourceListQuerySchema,
  tafsirFetchResponseSchema,
  tafsirSourceResponseSchema,
} from "../../validators/tafsir.validator.js";
import {
  listSources,
  fetchBundle,
  validateSurahAyah,
  createETag,
} from "./tafsir.service.js";
import { formatZodError } from "../../utils/validation.js";

export const listSourcesHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  if (!(request as any).apiKeyContext) {
    reply.status(401).send({
      statusCode: 401,
      error: "InvalidApiKey",
      message: "API key required",
      requestId: request.id,
    });
    return;
  }

  const parsed = sourceListQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const sources = await listSources(parsed.data.language);
  reply.send({ data: sources });
};

export const fetchTafsirHandler = async (
  request: FastifyRequest<{ Params: { surah: string; ayah: string }; Querystring: { sources?: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  if (!(request as any).apiKeyContext) {
    reply.status(401).send({
      statusCode: 401,
      error: "InvalidApiKey",
      message: "API key required",
      requestId: request.id,
    });
    return;
  }

  const surahParsed = surahParamSchema.safeParse(request.params.surah);
  if (!surahParsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(surahParsed.error),
    });
    return;
  }

  const ayahParsed = ayahParamSchema.safeParse(request.params.ayah);
  if (!ayahParsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(ayahParsed.error),
    });
    return;
  }

  const surah = surahParsed.data;
  const ayah = ayahParsed.data;

  const validationError = validateSurahAyah(surah, ayah);
  if (validationError) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: validationError,
    });
    return;
  }

  const sourcesParam = request.query.sources;
  const requestedSlugs = sourcesParam
    ? sourcesParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const { results, missing, respondingSlugs } = await fetchBundle(surah, ayah, requestedSlugs);

  const etag = createETag(respondingSlugs, missing);

  const ifNoneMatch = request.headers["if-none-match"];
  if (ifNoneMatch === etag) {
    reply.status(304).send();
    return;
  }

  reply.header("ETag", etag);
  reply.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  reply.send({ surah, ayah, results, missing });
};