import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import type { RouteConfig } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { env } from "../config/env.js";
import { paramToOpenApi } from "../utils/route-canonical.js";

extendZodWithOpenApi(z);

export type CollectedRoute = {
  method: string | string[];
  url: string;
  schema?: {
    summary?: string;
    description?: string;
    tags?: string[];
    params?: z.ZodTypeAny;
    querystring?: z.ZodTypeAny;
    body?: z.ZodTypeAny;
    /** Zod response schemas — stored here instead of schema.response to avoid Fastify's JSON-schema serializer. */
    zodResponse?: Record<string | number, z.ZodTypeAny>;
    [key: string]: unknown;
  };
};

/** Paths excluded from the public OpenAPI spec (contracts/openapi-parity §1). */
const SPEC_EXCLUDE_PREFIXES = new Set(["/reference", "/openapi.json", "/health", "/ready"]);

export const isExcludedFromSpec = (url: string): boolean => {
  const path = url.split("?")[0];
  if (!path.startsWith("/")) return true; // wildcard routes (e.g. CORS OPTIONS *)
  return (
    SPEC_EXCLUDE_PREFIXES.has(path) ||
    path.startsWith("/reference/") ||
    path.startsWith("/__")
  );
};

/**
 * Build an OpenAPI 3.0 document from routes collected via the `onRoute` hook.
 * Creates a fresh OpenAPIRegistry per call — no module-level state, safe for tests.
 */
export function generateOpenAPIFromRoutes(
  routes: CollectedRoute[],
): ReturnType<OpenApiGeneratorV3["generateDocument"]> {
  const reg = new OpenAPIRegistry();

  reg.registerComponent("securitySchemes", "ApiKeyAuth", {
    type: "apiKey",
    in: "header",
    name: env.API_KEY_HEADER,
    description:
      "Optional API key for elevated quotas and future gated endpoints.\nObtain a key from the project administrator.",
  });

  const seen = new Set<string>();

  for (const route of routes) {
    if (isExcludedFromSpec(route.url)) continue;

    const method = (
      Array.isArray(route.method) ? route.method[0] : route.method
    ).toLowerCase() as "get" | "post" | "put" | "patch" | "delete";

    const openApiPath = paramToOpenApi(route.url);
    const dedupeKey = `${method}:${openApiPath}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const s = route.schema!;

    const responses: RouteConfig["responses"] = {};
    if (s.zodResponse) {
      for (const [status, zodSchema] of Object.entries(s.zodResponse)) {
        responses[String(status)] = {
          description: "Success",
          content: { "application/json": { schema: zodSchema } },
        };
      }
    }
    if (Object.keys(responses).length === 0) {
      responses["200"] = { description: "Success" };
    }

    reg.registerPath({
      method,
      path: openApiPath,
      summary: s.summary,
      description: s.description,
      tags: s.tags,
      security: [{ ApiKeyAuth: [] }],
      ...(s.params || s.querystring || s.body
        ? {
            request: {
              ...(s.params ? { params: s.params } : {}),
              ...(s.querystring ? { query: s.querystring } : {}),
              ...(s.body
                ? {
                    body: {
                      content: {
                        "application/json": { schema: s.body },
                      },
                    },
                  }
                : {}),
            },
          }
        : {}),
      responses,
    });
  }

  return new OpenApiGeneratorV3(reg.definitions).generateDocument({
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Quran API",
      description: "API for Quran and Search functionality",
    },
    servers: [{ url: env.API_URL }],
  });
}
