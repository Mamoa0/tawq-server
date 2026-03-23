import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const surahCompareSchema = z
  .object({
    a: z.coerce.number().int().min(1).max(114),
    b: z.coerce.number().int().min(1).max(114),
  })
  .openapi("SurahCompareParams");

export const rootCompareSchema = z
  .object({
    a: z.string().min(1),
    b: z.string().min(1),
  })
  .openapi("RootCompareParams");

export type SurahCompareParams = z.infer<typeof surahCompareSchema>;
export type RootCompareParams = z.infer<typeof rootCompareSchema>;
