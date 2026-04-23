import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const searchQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
    surah: z.coerce.number().int().min(1).max(114).optional(),
    ayah: z.coerce.number().int().min(1).optional(),
    word: z.coerce.number().int().min(1).optional(),
    segment: z.coerce.number().int().min(1).optional(),
    form: z.string().min(1).max(100).optional(),
    tag: z.string().min(1).max(20).optional(),
    POS: z.string().min(1).max(10).optional(),
    ROOT: z.string().min(1).max(20).optional(),
    LEM: z.string().min(1).max(100).optional(),
    STEM: z.coerce.boolean().optional(),
    GEN: z.coerce.boolean().optional(),
    ACC: z.coerce.boolean().optional(),
    INDEF: z.coerce.boolean().optional(),
    MP: z.coerce.boolean().optional(),
  })
  .openapi("SearchQuery");

export type TokenFilter = z.infer<typeof searchQuerySchema>;

export const tokenDocumentSchema = z
  .object({
    _id: z.string(),
    surah: z.number(),
    ayah: z.number(),
    word: z.number(),
    segment: z.number(),
    form: z.string(),
    tag: z.string(),
    STEM: z.boolean(),
    POS: z.string(),
    LEM: z.string(),
    ROOT: z.string(),
    GEN: z.boolean().optional(),
    ACC: z.boolean().optional(),
    INDEF: z.boolean().optional(),
    MP: z.boolean().optional(),
    fullAyah: z.string().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .openapi("TokenDocument");

export type TokenDocument = z.infer<typeof tokenDocumentSchema>;

export const morphologySearchSchema = z
  .object({
    surah: z.coerce.number().int().min(1).max(114).optional(),
    ayah: z.coerce.number().int().min(1).optional(),
    pos: z.enum(["V", "N", "ADJ", "ADV", "PRON", "DEM", "REL", "NUM", "P", "CONJ", "PN", "NEG"]).optional(),
    tense: z.enum(["PERF", "IMPF", "IMPV"]).optional(),
    case: z.enum(["NOM", "ACC", "GEN"]).optional(),
    voice: z.enum(["ACT", "PASS"]).optional(),
    number: z.enum(["MS", "MP", "FS", "FP", "MD", "FD"]).optional(),
    gender: z.enum(["M", "F"]).optional(),
    pcpl: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .openapi("MorphologySearch");

export type MorphologyFilter = z.infer<typeof morphologySearchSchema>;

export const phraseSearchSchema = z
  .object({
    q: z.string().min(1).max(300).describe("Phrase to search in verse translations"),
    surah: z.coerce.number().int().min(1).max(114).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .openapi("PhraseSearch");

export type PhraseSearch = z.infer<typeof phraseSearchSchema>;

export const verseSearchSchema = z
  .object({
    q: z.string().min(1).max(200).describe("Search query for verse translation"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .openapi("VerseSearch");

export type VerseSearch = z.infer<typeof verseSearchSchema>;
