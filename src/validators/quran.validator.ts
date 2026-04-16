import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const surahParamSchema = z
  .object({
    number: z.coerce.number().int().min(1).max(114),
  })
  .openapi("SurahParams");

export const pageParamSchema = z
  .object({
    number: z.coerce.number().int().min(1).max(114),
    page: z.coerce.number().int().min(1).max(604),
  })
  .openapi("PageParams");

export const verseParamSchema = z
  .object({
    s: z.coerce.number().int().min(1).max(114),
    a: z.coerce.number().int().min(1).max(286),
  })
  .openapi("VerseParams");

export const wordParamSchema = z
  .object({
    s: z.coerce.number().int().min(1).max(114),
    a: z.coerce.number().int().min(1).max(286),
    w: z.coerce.number().int().min(1),
  })
  .openapi("WordParams");

export type SurahParams = z.infer<typeof surahParamSchema>;
export type PageParams = z.infer<typeof pageParamSchema>;
export type VerseParams = z.infer<typeof verseParamSchema>;
export type WordParams = z.infer<typeof wordParamSchema>;
