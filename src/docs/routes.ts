import { registry } from "./openapi.js";
import {
  surahParamSchema,
  pageParamSchema,
  verseParamSchema,
  wordParamSchema,
} from "../validators/quran.validator.js";
import { searchQuerySchema, verseSearchSchema, morphologySearchSchema, phraseSearchSchema } from "../validators/search.validator.js";
import { autocompleteSchema, paginationSchema } from "../validators/pagination.js";
import { z } from "zod";

export function registerRoutes() {
  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surahs",
    description: "Get a list of all Surahs",
    summary: "Get All Surahs",
    tags: ["Reading"],
    responses: {
      200: {
        description: "List of surahs",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.any()),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surahs/{number}",
    description: "Get a Surah by its number",
    summary: "Get Surah",
    tags: ["Reading"],
    request: {
      params: surahParamSchema,
    },
    responses: {
      200: {
        description: "Surah details",
        content: {
          "application/json": {
            schema: z.object({
              data: z.any(),
            }),
          },
        },
      },
      404: {
        description: "Surah not found",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surahs/{number}/page/{page}",
    description: "Get verses by page number",
    summary: "Get Page Verses",
    tags: ["Reading"],
    request: {
      params: pageParamSchema,
    },
    responses: {
      200: {
        description: "Verses for the given page",
        content: {
          "application/json": {
            schema: z.object({
              data: z.any(),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surah/{s}/ayah/{a}",
    description: "Get specific ayah with its words",
    summary: "Get Ayah",
    tags: ["Reading"],
    request: {
      params: verseParamSchema,
    },
    responses: {
      200: {
        description: "Ayah details including words",
        content: {
          "application/json": {
            schema: z.object({
              data: z.any(),
            }),
          },
        },
      },
      404: {
        description: "Ayah not found",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surah/{s}/ayah/{a}/word/{w}",
    description: "Get details for a specific word in an ayah",
    summary: "Get Word Details",
    tags: ["Reading"],
    request: {
      params: wordParamSchema,
    },
    responses: {
      200: {
        description: "Word details",
        content: {
          "application/json": {
            schema: z.object({
              data: z.any(),
            }),
          },
        },
      },
      404: {
        description: "Word not found",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/juz/{juz}",
    description: "Get all verses in a Juz (1-30)",
    summary: "Get Juz Verses",
    tags: ["Reading"],
    request: {
      params: z.object({
        juz: z.coerce.number().int().min(1).max(30),
      }),
    },
    responses: {
      200: {
        description: "All verses in the specified Juz",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.any()),
            }),
          },
        },
      },
      400: {
        description: "Invalid Juz number",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/hizb/{hizb}",
    description: "Get all verses in a Hizb (1-60)",
    summary: "Get Hizb Verses",
    tags: ["Reading"],
    request: {
      params: z.object({
        hizb: z.coerce.number().int().min(1).max(60),
      }),
    },
    responses: {
      200: {
        description: "All verses in the specified Hizb",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.any()),
            }),
          },
        },
      },
      400: {
        description: "Invalid Hizb number",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/verses",
    description: "Batch fetch multiple verses by references (e.g., 2:255,2:256)",
    summary: "Get Batch Verses",
    tags: ["Reading"],
    request: {
      query: z.object({
        refs: z.string().describe("Comma-separated verse references (surah:ayah)"),
      }),
    },
    responses: {
      200: {
        description: "Batch of verses",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.any()),
            }),
          },
        },
      },
      400: {
        description: "Invalid refs format",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/search",
    description: "Search for tokens across the Quran",
    summary: "Search Tokens",
    request: {
      query: searchQuerySchema,
    },
    responses: {
      200: {
        description: "Search results with pagination details",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.any()),
              pagination: z.object({
                total: z.number(),
                page: z.number(),
                limit: z.number(),
                totalPages: z.number(),
              }),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/search/lemmas",
    description: "Get a list of all distinct lemmas",
    summary: "Get All Lemmas",
    responses: {
      200: {
        description: "List of lemmas",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.string()),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/roots",
    description: "Get a list of all distinct roots",
    summary: "Get All Roots",
    responses: {
      200: {
        description: "List of roots",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.string()),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/roots/{root}",
    description: "Get details and statistics for a single root",
    summary: "Get One Root",
    request: {
      params: z.object({
        root: z.string().describe("The root string in Arabic"),
      }),
    },
    responses: {
      200: {
        description: "Root details",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                root: z.string(),
                order: z.number().optional(),
                count: z.number(),
                meaning: z
                  .object({
                    short: z.string(),
                    description: z.string(),
                    arabic_short: z.string(),
                    arabic_description: z.string(),
                  })
                  .optional(),
                lemmas_count: z.number(),
                words_count: z.number(),
                surahs_count: z.number().optional(),
                related_phonetic: z.array(z.string()),
                related_meaning: z.array(z.string()),
                lemmas: z.array(z.string()),
                forms: z.array(z.string()),
              }),
            }),
          },
        },
      },
      404: {
        description: "Root not found",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/roots/{root}/occurrences",
    description: "Get all occurrences of a root in the Quran",
    summary: "Get Root Occurrences",
    tags: ["Roots"],
    request: {
      params: z.object({
        root: z.string().describe("The root string in Arabic"),
      }),
    },
    responses: {
      200: {
        description: "List of verse locations where the root appears",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                root: z.string(),
                count: z.number(),
                occurrences: z.array(
                  z.object({
                    surah: z.number(),
                    ayah: z.number(),
                  })
                ),
              }),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/roots/{root}/co-occurrence",
    description: "Get roots that frequently co-occur with this root",
    summary: "Get Root Co-occurrences",
    tags: ["Roots"],
    request: {
      params: z.object({
        root: z.string().describe("The root string in Arabic"),
      }),
    },
    responses: {
      200: {
        description: "Co-occurring roots",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                root: z.string(),
                co_occurring: z.array(
                  z.object({
                    root: z.string(),
                    count: z.number(),
                  })
                ),
              }),
            }),
          },
        },
      },
      404: {
        description: "Root not found",
      },
    },
  });

  // Stats Routes
  registry.registerPath({
    method: "get",
    path: "/api/v1/stats",
    description: "Get global Quran statistics",
    summary: "Get Global Stats",
    tags: ["Analytics"],
    responses: {
      200: {
        description: "Global statistics",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                total_verses: z.number(),
                total_words: z.number(),
                total_tokens: z.number(),
                total_roots: z.number(),
                total_lemmas: z.number(),
                avg_tokens_per_word: z.number(),
                top_10_roots: z.array(z.object({
                  root: z.string(),
                  count: z.number(),
                })),
                pos_distribution: z.record(z.string(), z.number()),
                verb_tenses: z.record(z.string(), z.number()),
              }),
            }),
          },
        },
      },
    },
  });

  // Compare Routes
  registry.registerPath({
    method: "get",
    path: "/api/v1/compare/surahs",
    description: "Compare statistics and themes between two Surahs",
    summary: "Compare Surahs",
    tags: ["Compare"],
    request: {
      query: z.object({
        a: z.coerce.number().int().min(1).max(114).describe("First Surah number"),
        b: z.coerce.number().int().min(1).max(114).describe("Second Surah number"),
      }),
    },
    responses: {
      200: {
        description: "Comparison results",
        content: {
          "application/json": {
            schema: z.any(), // Using z.any() to cover dynamic nested depths for brevity here
          },
        },
      },
      400: {
        description: "Validation Error",
      },
      404: {
        description: "One or both Surahs not found",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/compare/roots",
    description: "Compare statistics, overlaps, and co-occurrences of two roots",
    summary: "Compare Roots",
    tags: ["Compare"],
    request: {
      query: z.object({
        a: z.string().describe("First root (Arabic)"),
        b: z.string().describe("Second root (Arabic)"),
      }),
    },
    responses: {
      200: {
        description: "Comparison results",
        content: {
          "application/json": {
            schema: z.any(),
          },
        },
      },
      400: {
        description: "Validation Error",
      },
      404: {
        description: "One or both Roots not found",
      },
    },
  });

  // Sprint 7: Navigation
  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surah/{s}/ayah/{a}/navigation",
    description: "Get ayah with next/prev navigation links",
    summary: "Get Ayah Navigation",
    tags: ["Reading"],
    request: {
      params: verseParamSchema,
    },
    responses: {
      200: {
        description: "Ayah with navigation",
        content: {
          "application/json": {
            schema: z.object({
              data: z.any(),
            }),
          },
        },
      },
      404: {
        description: "Ayah not found",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/page/{page}",
    description: "Get all verses on a Quran page regardless of surah",
    summary: "Get Page Verses",
    tags: ["Reading"],
    request: {
      params: z.object({
        page: z.coerce.number().int().min(1).max(604),
      }),
    },
    responses: {
      200: {
        description: "All verses on the page",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.any()),
            }),
          },
        },
      },
      400: {
        description: "Invalid page number",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surahs/{number}/themes",
    description: "Get Surah themes and top roots",
    summary: "Get Surah Themes",
    tags: ["Reading"],
    request: {
      params: surahParamSchema,
    },
    responses: {
      200: {
        description: "Surah themes",
        content: {
          "application/json": {
            schema: z.object({
              data: z.any(),
            }),
          },
        },
      },
      404: {
        description: "Surah not found",
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/random",
    description: "Get a random verse from the Quran",
    summary: "Get Random Verse",
    tags: ["Reading"],
    responses: {
      200: {
        description: "Random verse",
        content: {
          "application/json": {
            schema: z.object({
              data: z.any(),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/daily",
    description: "Get verses for today (deterministic, based on day of year)",
    summary: "Get Verse of the Day",
    tags: ["Reading"],
    responses: {
      200: {
        description: "Verses for today",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.any()),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/sajdas",
    description:
      "Return every sajda (prostration) verse in canonical order, each annotated with its classification (recommended or obligatory).",
    summary: "List Sajda Verses",
    tags: ["Reading"],
    responses: {
      200: {
        description: "All sajda verses with text and classification",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(
                z.object({
                  surah: z.number(),
                  ayah: z.number(),
                  type: z.enum(["recommended", "obligatory"]),
                  isSajda: z.literal(true),
                  sajdaType: z.enum(["recommended", "obligatory"]),
                  arabic: z.string().nullable(),
                  translation: z.string().nullable(),
                  page: z.number().nullable(),
                  juz: z.number().nullable(),
                }),
              ),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/roots/search/autocomplete",
    description: "Autocomplete for root search",
    summary: "Search Roots Autocomplete",
    tags: ["Roots"],
    request: {
      query: autocompleteSchema,
    },
    responses: {
      200: {
        description: "Autocomplete results",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.string()),
            }),
          },
        },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/roots/{root}/lemmas",
    description: "Get all lemmas for a specific root with counts",
    summary: "Get Lemmas by Root",
    tags: ["Roots"],
    request: {
      params: z.object({
        root: z.string().describe("The root string in Arabic"),
      }),
    },
    responses: {
      200: {
        description: "Lemmas for the root",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                root: z.string(),
                lemmas: z.array(z.object({
                  lemma: z.string(),
                  count: z.number(),
                })),
              }),
            }),
          },
        },
      },
    },
  });

  // S8-1: Verse search
  registry.registerPath({
    method: "get",
    path: "/api/v1/search/verses",
    description: "Search verse translations by keyword",
    summary: "Search Verses",
    tags: ["Search"],
    request: {
      query: verseSearchSchema,
    },
    responses: {
      200: {
        description: "Matching verses with pagination",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.any()),
              totalCount: z.number(),
              page: z.number(),
              limit: z.number(),
              totalPages: z.number(),
            }),
          },
        },
      },
      400: { description: "Validation Error" },
    },
  });

  // S8-2: Surah stats
  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surahs/{number}/stats",
    description: "Get detailed linguistic statistics for a Surah",
    summary: "Get Surah Stats",
    tags: ["Reading"],
    request: {
      params: surahParamSchema,
    },
    responses: {
      200: {
        description: "Surah general info and deep analytics",
        content: {
          "application/json": {
            schema: z.object({ data: z.any() }),
          },
        },
      },
      404: { description: "Surah not found" },
    },
  });

  // S8-3: Proper nouns
  registry.registerPath({
    method: "get",
    path: "/api/v1/search/proper-nouns",
    description: "Get all proper nouns (POS=PN) with occurrence counts and locations",
    summary: "Get Proper Nouns",
    tags: ["Search"],
    request: {
      query: paginationSchema,
    },
    responses: {
      200: {
        description: "Paginated list of proper nouns",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.object({
                lemma: z.string(),
                count: z.number(),
                locations: z.array(z.object({ surah: z.number(), ayah: z.number() })),
              })),
              totalCount: z.number(),
              page: z.number(),
              limit: z.number(),
              totalPages: z.number(),
            }),
          },
        },
      },
    },
  });

  // S8-4: Root surah distribution
  registry.registerPath({
    method: "get",
    path: "/api/v1/roots/{root}/surahs",
    description: "Get the distribution of a root across Surahs",
    summary: "Get Root Surah Distribution",
    tags: ["Roots"],
    request: {
      params: z.object({ root: z.string().describe("The root string in Arabic") }),
    },
    responses: {
      200: {
        description: "Per-surah occurrence counts for the root",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                root: z.string(),
                total_occurrences: z.number(),
                surahs: z.array(z.object({ surah: z.number(), count: z.number() })),
              }),
            }),
          },
        },
      },
      404: { description: "Root not found or has no occurrences" },
    },
  });

  // S8-5: Ayah roots
  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surah/{s}/ayah/{a}/roots",
    description: "Get all distinct roots in a specific ayah",
    summary: "Get Ayah Roots",
    tags: ["Reading"],
    request: {
      params: verseParamSchema,
    },
    responses: {
      200: {
        description: "Roots present in the ayah with counts and lemmas",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                surah: z.number(),
                ayah: z.number(),
                roots: z.array(z.object({
                  root: z.string(),
                  count: z.number(),
                  lemmas: z.array(z.string()),
                })),
              }),
            }),
          },
        },
      },
    },
  });

  // S9-1: Ayah analysis
  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surah/{s}/ayah/{a}/analysis",
    description: "Get full morphological analysis of every word segment in an ayah",
    summary: "Get Ayah Analysis",
    tags: ["Reading"],
    request: { params: verseParamSchema },
    responses: {
      200: {
        description: "Word-by-word breakdown with all morphological flags",
        content: { "application/json": { schema: z.object({ data: z.any() }) } },
      },
      404: { description: "Ayah not found" },
    },
  });

  // S9-2: Surah word frequency
  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/surahs/{number}/word-frequency",
    description: "Get top N most frequent lemmas in a Surah",
    summary: "Get Surah Word Frequency",
    tags: ["Reading"],
    request: {
      params: surahParamSchema,
      query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20).optional() }),
    },
    responses: {
      200: {
        description: "Lemma frequency list",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                surah: z.number(),
                limit: z.number(),
                frequencies: z.array(z.object({ lemma: z.string(), count: z.number(), forms: z.array(z.string()) })),
              }),
            }),
          },
        },
      },
      404: { description: "Surah not found" },
    },
  });

  // S9-3: Root network
  registry.registerPath({
    method: "get",
    path: "/api/v1/roots/{root}/network",
    description: "Get co-occurrence network for a root (nodes + edges for graph visualization)",
    summary: "Get Root Network",
    tags: ["Roots"],
    request: { params: z.object({ root: z.string().describe("Root in Arabic") }) },
    responses: {
      200: {
        description: "Graph-ready node/edge structure",
        content: {
          "application/json": {
            schema: z.object({
              data: z.object({
                center: z.string(),
                nodes: z.array(z.object({ root: z.string(), count: z.number(), is_center: z.boolean() })),
                edges: z.array(z.object({ source: z.string(), target: z.string(), weight: z.number() })),
              }),
            }),
          },
        },
      },
      404: { description: "Root not found" },
    },
  });

  // S9-4: Morphology search
  registry.registerPath({
    method: "get",
    path: "/api/v1/search/morphology",
    description: "Filter tokens by morphological features (tense, case, voice, gender, number, POS)",
    summary: "Search by Morphology",
    tags: ["Search"],
    request: { query: morphologySearchSchema },
    responses: {
      200: {
        description: "Paginated morphological search results",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.any()),
              totalCount: z.number(),
              page: z.number(),
              limit: z.number(),
              totalPages: z.number(),
            }),
          },
        },
      },
      400: { description: "Validation Error" },
    },
  });

  // S10-1: Phrase search
  registry.registerPath({
    method: "get",
    path: "/api/v1/search/phrase",
    description: "Search verse translations for an exact phrase, with optional Surah scoping",
    summary: "Phrase Search",
    tags: ["Search"],
    request: { query: phraseSearchSchema },
    responses: {
      200: {
        description: "Matching verses with pagination",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.any()),
              totalCount: z.number(),
              page: z.number(),
              limit: z.number(),
              totalPages: z.number(),
            }),
          },
        },
      },
      400: { description: "Validation Error" },
    },
  });

  // S10-2: Revelation order
  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/revelation-order",
    description: "Get all Surahs sorted by their revelation order (chronological)",
    summary: "Get Surahs by Revelation Order",
    tags: ["Reading"],
    responses: {
      200: {
        description: "Surahs in revelation order",
        content: { "application/json": { schema: z.object({ data: z.array(z.any()) }) } },
      },
    },
  });

  // S10-3: Meccan surahs
  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/meccan",
    description: "Get all Meccan Surahs (revealed in Makkah) sorted by revelation order",
    summary: "Get Meccan Surahs",
    tags: ["Reading"],
    responses: {
      200: {
        description: "Meccan surahs",
        content: { "application/json": { schema: z.object({ data: z.array(z.any()) }) } },
      },
    },
  });

  // S10-4: Medinan surahs
  registry.registerPath({
    method: "get",
    path: "/api/v1/quran/medinan",
    description: "Get all Medinan Surahs (revealed in Madinah) sorted by revelation order",
    summary: "Get Medinan Surahs",
    tags: ["Reading"],
    responses: {
      200: {
        description: "Medinan surahs",
        content: { "application/json": { schema: z.object({ data: z.array(z.any()) }) } },
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/v1/search/lemmas/autocomplete",
    description: "Autocomplete for lemma search",
    summary: "Search Lemmas Autocomplete",
    tags: ["Search"],
    request: {
      query: autocompleteSchema,
    },
    responses: {
      200: {
        description: "Autocomplete results",
        content: {
          "application/json": {
            schema: z.object({
              data: z.array(z.string()),
            }),
          },
        },
      },
    },
  });
}