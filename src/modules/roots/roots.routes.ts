import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { paginationSchema, PaginationParams, autocompleteSchema, AutocompleteParams } from "../../validators/pagination.js";
import { getRoots, getRoot, getRootOccurrences, getRootCoOccurrence, searchRootsAutocomplete, getLemmasByRoot, getRootSurahDistribution, getRootNetwork } from "./roots.service.js";
import { formatZodError } from "../../utils/validation.js";
import { ok, okPaginated } from "../../utils/reply.js";
import { registerCachePolicy, CacheProfile } from "../../utils/cache.js";

export const getRootsHandler = async (
  request: FastifyRequest<{ Querystring: PaginationParams }>,
  reply: FastifyReply,
): Promise<void> => {
  const parsed = paginationSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const result = await getRoots(parsed.data.page, parsed.data.limit);
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
  const parsed = autocompleteSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({
      statusCode: 400,
      error: "Validation Error",
      message: formatZodError(parsed.error),
    });
    return;
  }

  const data = await searchRootsAutocomplete(parsed.data.q, parsed.data.limit);
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

/**
 * Roots routes plugin.
 * Register with: app.register(rootsRoutes, { prefix: "/api/v1/roots" })
 */
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

  app.get("/", getRootsHandler);
  app.get("/search/autocomplete", searchRootsAutocompleteHandler);
  app.get("/:root", getRootHandler);
  app.get("/:root/occurrences", getRootOccurrencesHandler);
  app.get("/:root/co-occurrence", getRootCoOccurrenceHandler);
  app.get("/:root/lemmas", getLemmasByRootHandler);
  app.get("/:root/surahs", getRootSurahDistributionHandler);
  app.get("/:root/network", getRootNetworkHandler);
}
