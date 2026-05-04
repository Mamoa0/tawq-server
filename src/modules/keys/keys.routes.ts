import { FastifyInstance, FastifyRequest } from "fastify";
import { createKeyHandler } from "./keys.controller.js";
import { createKeyBodySchema, createKeyResponseSchema } from "../../validators/keys.validator.js";

export async function keysRoutes(app: FastifyInstance): Promise<void> {
  app.post("/", {
    schema: {
      summary: "Generate API Key",
      description:
        "Mint a new API key. No authentication required. The plaintext key is returned once and cannot be retrieved later. Rate-limited to 5 keys per IP per hour.",
      tags: ["Keys"],
      body: createKeyBodySchema,
      zodResponse: { 201: createKeyResponseSchema },
    },
    config: {
      rateLimit: {
        max: 5,
        timeWindow: "1 hour",
        keyGenerator: (request: FastifyRequest) => `create-key:${request.ip}`,
      },
    },
  }, createKeyHandler);
}
