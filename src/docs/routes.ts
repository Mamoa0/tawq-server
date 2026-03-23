import { registry } from "./openapi.js";
import {
  surahParamSchema,
  pageParamSchema,
  verseParamSchema,
  wordParamSchema,
} from "../validators/quran.validator.js";
import { searchQuerySchema } from "../validators/search.validator.js";
import { z } from "zod";

export function registerRoutes() {
  registry.registerPath({
    method: "get",
    path: "/api/quran/surahs",
    description: "Get a list of all Surahs",
    summary: "Get All Surahs",
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
    path: "/api/quran/surahs/{number}",
    description: "Get a Surah by its number",
    summary: "Get Surah",
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
    path: "/api/quran/page/{page}",
    description: "Get verses by page number",
    summary: "Get Page Verses",
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
    path: "/api/quran/surah/{s}/ayah/{a}",
    description: "Get specific ayah with its words",
    summary: "Get Ayah",
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
    path: "/api/quran/surah/{s}/ayah/{a}/word/{w}",
    description: "Get details for a specific word in an ayah",
    summary: "Get Word Details",
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
    path: "/api/search",
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
    path: "/api/search/lemmas",
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
    path: "/api/roots",
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
    path: "/api/roots/{root}",
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

  // Compare Routes
  registry.registerPath({
    method: "get",
    path: "/api/compare/surahs",
    description: "Compare statistics and themes between two Surahs",
    summary: "Compare Surahs",
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
    path: "/api/compare/roots",
    description: "Compare statistics, overlaps, and co-occurrences of two roots",
    summary: "Compare Roots",
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
            schema: z.any(), // Using z.any() to cover dynamic nested depths for brevity here
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
}
