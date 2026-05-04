import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const surahParamSchema = z
  .coerce.number()
  .int()
  .min(1)
  .max(114)
  .openapi("TafsirSurahParam");

export const ayahParamSchema = z
  .coerce.number()
  .int()
  .min(1)
  .openapi("TafsirAyahParam");

export const sourcesQuerySchema = z
  .string()
  .optional()
  .openapi("TafsirSourcesQuery");

export const sourceListQuerySchema = z
  .object({
    language: z.string().optional(),
  })
  .openapi("SourceListQuery");

export const tafsirSourceResponseSchema = z
  .object({
    slug: z.string(),
    name: z.object({
      ar: z.string().optional(),
      en: z.string().optional(),
    }),
    author: z.string(),
    language: z.string(),
    direction: z.enum(["rtl", "ltr"]),
    format: z.enum(["text", "html"]),
    grouping: z.enum(["ayah", "range"]),
    homepage: z.string().optional(),
    license: z.string().optional(),
  })
  .openapi("TafsirSourceResponse");

export const tafsirBlockSchema = z
  .object({
    source: z.object({
      slug: z.string(),
      name: z.object({
        ar: z.string().optional(),
        en: z.string().optional(),
      }),
      language: z.string(),
      direction: z.enum(["rtl", "ltr"]),
      format: z.enum(["text", "html"]),
    }),
    ayahStart: z.number(),
    ayahEnd: z.number(),
    text: z.string(),
  })
  .openapi("TafsirBlock");

export const tafsirFetchResponseSchema = z
  .object({
    surah: z.number(),
    ayah: z.number(),
    results: z.array(tafsirBlockSchema),
    missing: z.array(z.string()),
  })
  .openapi("TafsirFetchResponse");

export const verseTafsirMarkerSchema = z
  .object({
    tafsir: z.object({
      sources: z.array(z.string()),
    }),
  })
  .openapi("VerseTafsirMarker");