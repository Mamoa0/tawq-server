import { FastifyRequest, FastifyReply } from "fastify";
import {
  searchQuerySchema,
  TokenFilter,
} from "../../validators/search.validator.js";
import { searchTokens, getLemmas } from "./search.service.js";

export const searchHandler = async (
  request: FastifyRequest<{ Querystring: TokenFilter }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = searchQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: parsed.error.issues,
    });
    return;
  }

  const result = await searchTokens(parsed.data);

  reply.send(result);
};

export const getLemmasHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  const result = await getLemmas();
  reply.send({ data: result });
};
