import { createHash, randomUUID } from "node:crypto";
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { validatorCompiler } from "fastify-type-provider-zod";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { apiKeyPlugin } from "./plugins/api-key.plugin.js";
import { searchRoutes } from "./modules/search/search.routes.js";
import { quranRoutes } from "./modules/quran/quran.routes.js";
import { rootsRoutes } from "./modules/roots/roots.routes.js";
import compareRoutes from "./modules/compare/compare.routes.js";
import { statsRoutes } from "./modules/stats/stats.routes.js";
import {
  CollectedRoute,
  generateOpenAPIFromRoutes,
  isExcludedFromSpec,
} from "./docs/openapi.js";
import scalarApiReference from "@scalar/fastify-api-reference";

/**
 * Create and configure a Fastify app instance without listening.
 * Used by both the server (src/server.ts) and tests (tests/helpers/app.ts).
 */
export const createApp = async (): Promise<FastifyInstance> => {
  const isDev = env.NODE_ENV !== "production";

  const app = Fastify({
    logger: {
      level: isDev ? "debug" : "info",
      ...(isDev
        ? {
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
            },
          }
        : {}),
    },
    bodyLimit: 100_000,
    rewriteUrl: (req) => req.url?.replace(/\/+/g, "/") ?? "/",
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  // Wire Zod type provider for request validation (T034)
  // serializerCompiler is intentionally omitted: response schemas use z.any() data fields
  // and the default JSON.stringify serializer avoids Zod's strip-unknown behavior.
  app.setValidatorCompiler(validatorCompiler);

  const collectedRoutes: CollectedRoute[] = [];
  app.addHook("onRoute", (routeOptions) => {
    const url = routeOptions.url;
    if (!isExcludedFromSpec(url) && !(routeOptions.schema as CollectedRoute["schema"])?.summary) {
      throw new Error(
        `Route ${Array.isArray(routeOptions.method) ? routeOptions.method[0] : routeOptions.method} ${url} is missing schema.summary — every non-excluded route must be documented (contracts/openapi-parity §1)`,
      );
    }
    collectedRoutes.push({
      method: routeOptions.method,
      url,
      schema: routeOptions.schema as CollectedRoute["schema"],
    });
  });

  app.decorate("getCollectedRoutes", () => [...collectedRoutes]);

  app.setErrorHandler(errorHandler);

  app.addHook("onRequest", (_request, reply, done) => {
    (reply as any).startTime = Date.now();
    done();
  });
  app.addHook("onSend", (request, reply, payload, done) => {
    reply.header("X-Response-Time", `${Date.now() - (reply as any).startTime}ms`);
    reply.header("X-Request-Id", request.id);
    done(null, payload);
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'"],
      },
    },
  });

  app.addHook("onSend", (request, reply, payload, done) => {
    if (request.url.startsWith("/reference")) {
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:;",
      );
    }
    done(null, payload);
  });

  const corsOrigins = env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin:
      corsOrigins.length === 1 && corsOrigins[0] === "*"
        ? true
        : corsOrigins,
  });

  const hashUA = (ua: string | undefined): string =>
    createHash("sha1")
      .update(ua ?? "")
      .digest("hex")
      .slice(0, 10);

  const ANON_LIMIT = 100;
  const KEYED_LIMIT = 600;

  await app.register(rateLimit, {
    global: true,
    timeWindow: "1 minute",
    max: (request) => {
      const apiKey = request.headers["x-api-key"];
      return typeof apiKey === "string" && apiKey.length > 0
        ? KEYED_LIMIT
        : ANON_LIMIT;
    },
    keyGenerator: (request) => {
      const apiKey = request.headers["x-api-key"];
      if (typeof apiKey === "string" && apiKey.length > 0) {
        return `k:${request.ip}:${apiKey}`;
      }
      const ua = request.headers["user-agent"];
      return `a:${request.ip}:${hashUA(Array.isArray(ua) ? ua[0] : ua)}`;
    },
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded: ${context.max} req/${context.after}. Retry after ${context.ttl}ms.`,
    }),
  });

  // Register the API key authentication plugin BEFORE route modules
  await app.register(apiKeyPlugin);

  let cachedOpenApiDoc: object | null = null;
  app.get("/openapi.json", async () => {
    if (!cachedOpenApiDoc) {
      cachedOpenApiDoc = generateOpenAPIFromRoutes(collectedRoutes);
    }
    return cachedOpenApiDoc;
  });

  await app.register(scalarApiReference, {
    routePrefix: "/reference",
    configuration: {
      url: "/openapi.json",
      metaData: {
        title: "Quran API Documentation",
      },
    },
  });

  const startedAt = Date.now();
  app.get("/health", async (_request, reply) => {
    const mongoose = await import("mongoose");
    const dbState = mongoose.connection.readyState;
    if (dbState !== 1) {
      return reply.status(503).send({
        status: "error",
        db: "disconnected",
        readyState: dbState,
      });
    }

    try {
      const adminDb = mongoose.connection.db?.admin();
      if (!adminDb) throw new Error("admin handle unavailable");
      const pingStart = Date.now();
      await Promise.race([
        adminDb.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("db ping timeout")), 500),
        ),
      ]);
      const pingMs = Date.now() - pingStart;

      return {
        status: "ok",
        db: "connected",
        dbPingMs: pingMs,
        uptimeSec: Math.round((Date.now() - startedAt) / 1000),
        nodeEnv: env.NODE_ENV,
      };
    } catch (err) {
      app.log.warn({ err }, "health check db ping failed");
      return reply.status(503).send({
        status: "error",
        db: "unreachable",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/ready", async (_request, reply) => {
    const mongoose = await import("mongoose");
    if (mongoose.connection.readyState !== 1) {
      return reply.status(503).send({ status: "not ready" });
    }
    return { status: "ready" };
  });

  await app.register(searchRoutes, { prefix: "/api/v1/search" });
  await app.register(quranRoutes, { prefix: "/api/v1/quran" });
  await app.register(rootsRoutes, { prefix: "/api/v1/roots" });
  await app.register(compareRoutes, { prefix: "/api/v1/compare" });
  await app.register(statsRoutes, { prefix: "/api/v1/stats" });

  return app;
};
