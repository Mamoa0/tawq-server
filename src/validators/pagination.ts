import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const paginationSchema = z
  .object({
    page: z
      .coerce.number()
      .int()
      .min(1)
      .default(1)
      .transform((p) => Math.max(1, p)),
    limit: z
      .coerce.number()
      .int()
      .min(1)
      .max(500)
      .default(100)
      .transform((l) => Math.min(500, Math.max(1, l))),
  })
  .openapi("PaginationParams");

export type PaginationParams = z.infer<typeof paginationSchema>;

export const autocompleteSchema = z
  .object({
    q: z.string().max(50).default("").describe("Query string (Arabic or Buckwalter)"),
    limit: z
      .coerce.number()
      .int()
      .min(1)
      .max(100)
      .default(20)
      .describe("Max results"),
  })
  .openapi("AutocompleteParams");

export type AutocompleteParams = z.infer<typeof autocompleteSchema>;
