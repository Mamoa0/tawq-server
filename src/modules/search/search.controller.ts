import { FastifyRequest, FastifyReply } from "fastify";
import {
  searchQuerySchema,
  TokenFilter,
} from "../../validators/search.validator.js";
import { paginationSchema, PaginationParams, autocompleteSchema, AutocompleteParams } from "../../validators/pagination.js";
import { searchTokens, getLemmas, searchLemmasAutocomplete, searchVerses, getProperNouns, searchMorphology, searchPhrase } from "./search.service.js";
import { verseSearchSchema, VerseSearch, morphologySearchSchema, MorphologyFilter, phraseSearchSchema, PhraseSearch } from "../../validators/search.validator.js";
import { formatZodError } from "../../utils/validation.js";
import { ok, okPaginated } from "../../utils/reply.js";

export const searchHandler = async (
  request: FastifyRequest<{ Querystring: TokenFilter }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = searchQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const result = await searchTokens(parsed.data);
  okPaginated(reply, result);
};

export const getLemmasHandler = async (
  request: FastifyRequest<{ Querystring: PaginationParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = paginationSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const result = await getLemmas(parsed.data.page, parsed.data.limit);
  okPaginated(reply, result);
};

export const searchVersesHandler = async (
  request: FastifyRequest<{ Querystring: VerseSearch }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = verseSearchSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const result = await searchVerses(parsed.data.q, parsed.data.page, parsed.data.limit);
  okPaginated(reply, result);
};

export const getProperNounsHandler = async (
  request: FastifyRequest<{ Querystring: PaginationParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = paginationSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const result = await getProperNouns(parsed.data.page, parsed.data.limit);
  okPaginated(reply, result);
};

export const searchPhraseHandler = async (
  request: FastifyRequest<{ Querystring: PhraseSearch }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = phraseSearchSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const result = await searchPhrase(parsed.data);
  okPaginated(reply, result);
};

export const searchMorphologyHandler = async (
  request: FastifyRequest<{ Querystring: MorphologyFilter }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = morphologySearchSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const result = await searchMorphology(parsed.data);
  okPaginated(reply, result);
};

export const searchLemmasAutocompleteHandler = async (
  request: FastifyRequest<{ Querystring: AutocompleteParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = autocompleteSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const data = await searchLemmasAutocomplete(parsed.data.q, parsed.data.limit);
  ok(reply, data);
};
