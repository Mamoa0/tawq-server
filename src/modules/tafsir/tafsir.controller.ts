import { FastifyRequest, FastifyReply } from "fastify";
import { createHash } from "node:crypto";
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
} from "./tafsir.service.js";
import { formatZodError } from "../../utils/validation.js";

export const listSourcesHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
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

  const { results, missing } = await fetchBundle(surah, ayah, requestedSlugs);

  const allSlugs = [...results.map((r) => r.source.slug), ...missing].sort();
  const maxIngestedAt = results.length > 0
    ? Math.max(...results.map((r) => new Date(r.text.length).getTime()))
    : Date.now();
  const etagContent = `${maxIngestedAt}-${allSlugs.join(",")}-${missing.join(",")}`;
  const etag = `W/"${createHash("sha1").update(etagContent).digest("hex").slice(0, 16)}"`;

  const ifNoneMatch = request.headers["if-none-match"];
  if (ifNoneMatch === etag) {
    reply.status(304).send();
    return;
  }

  reply.header("ETag", etag);
  reply.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  reply.send({ surah, ayah, results, missing });
};