import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const createKeyBodySchema = z
  .object({
    label: z.string().trim().min(1).max(64).optional(),
  })
  .openapi("CreateKeyBody");

export type CreateKeyBody = z.infer<typeof createKeyBodySchema>;

export const createKeyResponseSchema = z
  .object({
    id: z.string(),
    key: z.string().length(64),
    label: z.string(),
    createdAt: z.string().datetime(),
  })
  .openapi("CreateKeyResponse");

export type CreateKeyResponse = z.infer<typeof createKeyResponseSchema>;
