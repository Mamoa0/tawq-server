import { FastifyRequest, FastifyReply } from "fastify";
import {
  searchQuerySchema,
  TokenFilter,
} from "../../validators/search.validator.js";
import { searchTokens, getLemmas } from "./search.service.js";
import { formatZodError } from "../../utils/validation.js";

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

  const { data, totalCount, page, limit, totalPages } = await searchTokens(parsed.data);
  reply.send({ data, totalCount, page, limit, totalPages });
};

export const getLemmasHandler = async (
  request: FastifyRequest<{ Querystring: { page?: string; limit?: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const page = Math.max(1, parseInt(request.query.page || "1", 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(request.query.limit || "100", 10) || 100));
  const result = await getLemmas(page, limit);
  reply.send(result);
};
