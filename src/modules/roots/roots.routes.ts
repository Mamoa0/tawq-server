import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { paginationSchema, PaginationParams, autocompleteSchema, AutocompleteParams } from "../../validators/pagination.js";
import { getRoots, getRoot, getRootOccurrences, getRootCoOccurrence, searchRootsAutocomplete, getLemmasByRoot, getRootSurahDistribution, getRootNetwork } from "./roots.service.js";
import { ok, okPaginated } from "../../utils/reply.js";
import { registerCachePolicy, CacheProfile } from "../../utils/cache.js";

export const getRootsHandler = async (
  request: FastifyRequest<{ Querystring: PaginationParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const { page, limit } = request.query;
  const result = await getRoots(page, limit);
  okPaginated(reply, result);
};

export const getRootHandler = async (
  request: FastifyRequest<{ Params: { root: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { root } = request.params;
  const result = await getRoot(root);
  if (!result) {
    reply.status(404).send({
      statusCode: 404,
      error: "Not Found",
      message: "Root not found",
    });
    return;
  }
  ok(reply, result);
};

export const getRootOccurrencesHandler = async (
  request: FastifyRequest<{ Params: { root: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { root } = request.params;
  const result = await getRootOccurrences(root);
  ok(reply, result);
};

export const getRootCoOccurrenceHandler = async (
  request: FastifyRequest<{ Params: { root: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { root } = request.params;
  const result = await getRootCoOccurrence(root);
  if (!result) {
    reply.status(404).send({
      statusCode: 404,
      error: "Not Found",
      message: "Root not found",
    });
    return;
  }
  ok(reply, result);
};

export const searchRootsAutocompleteHandler = async (
  request: FastifyRequest<{ Querystring: AutocompleteParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const { q, limit } = request.query;
  const data = await searchRootsAutocomplete(q, limit);
  ok(reply, data);
};

export const getRootNetworkHandler = async (
  request: FastifyRequest<{ Params: { root: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { root } = request.params;
  const result = await getRootNetwork(root);
  if (!result) {
    reply.status(404).send({
      statusCode: 404,
      error: "Not Found",
      message: "Root not found or has no occurrences",
    });
    return;
  }
  ok(reply, result);
};

export const getRootSurahDistributionHandler = async (
  request: FastifyRequest<{ Params: { root: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { root } = request.params;
  const result = await getRootSurahDistribution(root);
  if (!result) {
    reply.status(404).send({
      statusCode: 404,
      error: "Not Found",
      message: "Root not found or has no occurrences",
    });
    return;
  }
  ok(reply, result);
};

export const getLemmasByRootHandler = async (
  request: FastifyRequest<{ Params: { root: string } }>,
  reply: FastifyReply,
): Promise<void> => {
  const { root } = request.params;
  const result = await getLemmasByRoot(root);
  ok(reply, result);
};

const rootParamSchema = z.object({ root: z.string().describe("The root string in Arabic") });

export async function rootsRoutes(app: FastifyInstance): Promise<void> {
  registerCachePolicy(app, {
    "/": { value: CacheProfile.IMMUTABLE },
    "/search/autocomplete": { value: CacheProfile.AUTOCOMPLETE },
    "/:root": { value: CacheProfile.IMMUTABLE },
    "/:root/occurrences": { value: CacheProfile.IMMUTABLE },
    "/:root/co-occurrence": { value: CacheProfile.IMMUTABLE },
    "/:root/lemmas": { value: CacheProfile.IMMUTABLE },
    "/:root/surahs": { value: CacheProfile.IMMUTABLE },
    "/:root/network": { value: CacheProfile.IMMUTABLE },
  });

  app.get("/", {
    schema: {
      summary: "Get All Roots",
      description: "Get a paginated list of all distinct roots",
      tags: ["Roots"],
      querystring: paginationSchema,
      zodResponse: {
        200: z.object({
          data: z.array(z.any()),
          meta: z.object({
            page: z.number(),
            limit: z.number(),
            totalCount: z.number(),
            totalPages: z.number(),
          }),
        }),
      },
    },
  }, getRootsHandler);

  app.get("/search/autocomplete", {
    schema: {
      summary: "Search Roots Autocomplete",
      description: "Autocomplete for root search",
      tags: ["Roots"],
      querystring: autocompleteSchema,
      zodResponse: { 200: z.object({ data: z.array(z.string()) }) },
    },
  }, searchRootsAutocompleteHandler);

  app.get("/:root", {
    schema: {
      summary: "Get One Root",
      description: "Get details and statistics for a single root",
      tags: ["Roots"],
      params: rootParamSchema,
      zodResponse: { 200: z.object({ data: z.any() }) },
    },
  }, getRootHandler);

  app.get("/:root/occurrences", {
    schema: {
      summary: "Get Root Occurrences",
      description: "Get all occurrences of a root in the Quran",
      tags: ["Roots"],
      params: rootParamSchema,
      zodResponse: {
        200: z.object({
          data: z.object({
            root: z.string(),
            count: z.number(),
            occurrences: z.array(z.object({ surah: z.number(), ayah: z.number() })),
          }),
        }),
      },
    },
  }, getRootOccurrencesHandler);

  app.get("/:root/co-occurrence", {
    schema: {
      summary: "Get Root Co-occurrences",
      description: "Get roots that frequently co-occur with this root",
      tags: ["Roots"],
      params: rootParamSchema,
      zodResponse: {
        200: z.object({
          data: z.object({
            root: z.string(),
            co_occurring: z.array(z.object({ root: z.string(), count: z.number() })),
          }),
        }),
      },
    },
  }, getRootCoOccurrenceHandler);

  app.get("/:root/lemmas", {
    schema: {
      summary: "Get Lemmas by Root",
      description: "Get all lemmas for a specific root with counts",
      tags: ["Roots"],
      params: rootParamSchema,
      zodResponse: {
        200: z.object({
          data: z.object({
            root: z.string(),
            lemmas: z.array(z.object({ lemma: z.string(), count: z.number() })),
          }),
        }),
      },
    },
  }, getLemmasByRootHandler);

  app.get("/:root/surahs", {
    schema: {
      summary: "Get Root Surah Distribution",
      description: "Get the distribution of a root across Surahs",
      tags: ["Roots"],
      params: rootParamSchema,
      zodResponse: {
        200: z.object({
          data: z.object({
            root: z.string(),
            total_occurrences: z.number(),
            surahs: z.array(z.object({ surah: z.number(), count: z.number() })),
          }),
        }),
      },
    },
  }, getRootSurahDistributionHandler);

  app.get("/:root/network", {
    schema: {
      summary: "Get Root Network",
      description: "Get co-occurrence network for a root (nodes + edges for graph visualization)",
      tags: ["Roots"],
      params: rootParamSchema,
      zodResponse: {
        200: z.object({
          data: z.object({
            center: z.string(),
            nodes: z.array(z.object({ root: z.string(), count: z.number(), is_center: z.boolean() })),
            edges: z.array(z.object({ source: z.string(), target: z.string(), weight: z.number() })),
          }),
        }),
      },
    },
  }, getRootNetworkHandler);
}
