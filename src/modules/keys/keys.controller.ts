import { FastifyRequest, FastifyReply } from "fastify";
import { createKeyBodySchema, CreateKeyBody } from "../../validators/keys.validator.js";
import { formatZodError } from "../../utils/validation.js";
import { issueKey } from "./keys.service.js";

export const createKeyHandler = async (
  request: FastifyRequest<{ Body: CreateKeyBody }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = createKeyBodySchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const issued = await issueKey(parsed.data.label);
  reply.status(201).send(issued);
};
