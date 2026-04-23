import { FastifyInstance } from "fastify";
import { searchHandler, getLemmasHandler, searchLemmasAutocompleteHandler, searchVersesHandler, getProperNounsHandler, searchMorphologyHandler, searchPhraseHandler } from "./search.controller.js";
import { registerCachePolicy, CacheProfile } from "../../utils/cache.js";

/**
 * Search routes plugin.
 * Register with: app.register(searchRoutes, { prefix: "/api/v1/search" })
 *
 * Search results are deterministic over immutable data, so we cache
 * them — shorter TTL than the Quran endpoints because the parameter
 * space is much larger and we don't want the edge cache to fill up
 * with rare queries.
 */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  registerCachePolicy(app, {
    "/": { value: CacheProfile.SEARCH },
    "/lemmas": { value: CacheProfile.IMMUTABLE },
    "/lemmas/autocomplete": { value: CacheProfile.AUTOCOMPLETE },
    "/verses": { value: CacheProfile.SEARCH },
    "/proper-nouns": { value: CacheProfile.IMMUTABLE },
    "/morphology": { value: CacheProfile.SEARCH },
    "/phrase": { value: CacheProfile.SEARCH },
  });

  app.get("/", searchHandler);
  app.get("/lemmas", getLemmasHandler);
  app.get("/lemmas/autocomplete", searchLemmasAutocompleteHandler);
  app.get("/verses", searchVersesHandler);
  app.get("/proper-nouns", getProperNounsHandler);
  app.get("/morphology", searchMorphologyHandler);
  app.get("/phrase", searchPhraseHandler);
}
