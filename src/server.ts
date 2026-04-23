import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { connectDB } from "./database/connection.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { searchRoutes } from "./modules/search/search.routes.js";
import { quranRoutes } from "./modules/quran/quran.routes.js";
import { rootsRoutes } from "./modules/roots/roots.routes.js";
import compareRoutes from "./modules/compare/compare.routes.js";
import { statsRoutes } from "./modules/stats/stats.routes.js";
import { generateOpenAPI } from "./docs/openapi.js";
import { registerRoutes } from "./docs/routes.js";
import scalarApiReference from "@scalar/fastify-api-reference";

/**
 * Bootstrap the Fastify server:
 * 1. Register plugins (CORS)
 * 2. Setup global error handler
 * 3. Connect to MongoDB
 * 4. Start listening on the configured port
 */
const startServer = async (): Promise<void> => {
  const isDev = env.NODE_ENV !== "production";

  const app = Fastify({
    logger: {
      level: isDev ? "debug" : "info",
      // In dev, pretty-print logs. In prod, emit structured JSON so logs
      // ship cleanly into ELK / CloudWatch / Datadog.
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
    // Accept an incoming x-request-id for tracing across services; if the
    // client didn't send one, generate a UUID v4 so every log line for
    // this request shares a single correlation ID.
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  app.setErrorHandler(errorHandler);

  // Echo the request ID back so clients can correlate their own logs
  // with server logs. Also record response time.
  app.addHook("onRequest", (_request, reply, done) => {
    (reply as any).startTime = Date.now();
    done();
  });
  app.addHook("onSend", (request, reply, payload, done) => {
    reply.header("X-Response-Time", `${Date.now() - (reply as any).startTime}ms`);
    reply.header("X-Request-Id", request.id);
    done(null, payload);
  });

  // Strict CSP for the API. The Scalar docs UI at /reference needs
  // inline scripts, so we relax CSP only on that route (see below).
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'"],
      },
    },
  });

  // Loosen CSP for the Scalar docs UI only.
  app.addHook("onSend", (request, reply, payload, done) => {
    if (request.url.startsWith("/reference")) {
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:;",
      );
    }
    done(null, payload);
  });

  // Accept a comma-separated list of allowed origins. Special value "*"
  // enables open CORS (useful for public, unauthenticated APIs).
  const corsOrigins = env.CORS_ORIGIN.split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  await app.register(cors, {
    origin:
      corsOrigins.length === 1 && corsOrigins[0] === "*"
        ? true
        : corsOrigins,
  });

  // Rate limiting.
  //
  // Keying by IP alone shares a single bucket across everyone behind a
  // NAT — a real problem for mobile users, university networks, and
  // corporate proxies. We mix in a short hash of the User-Agent so
  // distinct clients on the same IP get separate buckets. An abuser
  // running a fixed client still hits a single bucket.
  //
  // If the caller sends an X-API-Key header, we bucket by (IP, API-Key)
  // and raise the ceiling. We don't validate the key against a list —
  // the mere presence is enough to differentiate traffic today; a
  // future auth layer can reject unknown keys without changing this
  // logic. @fastify/rate-limit emits X-RateLimit-{Limit,Remaining,Reset}
  // headers by default so clients can back off gracefully.
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

  registerRoutes();
  const openApiDoc = generateOpenAPI();

  app.get("/openapi.json", () => openApiDoc);

  await app.register(scalarApiReference, {
    routePrefix: "/reference",
    configuration: {
      url: "/openapi.json",
      metaData: {
        title: "Quran API Documentation",
      },
    },
  });

  // Health check. Returns 200 only when we can actually execute a query
  // against MongoDB — checking readyState alone can report "connected"
  // while queries hang. Load balancers and orchestrators (k8s readiness
  // probes) should hit this endpoint.
  const startedAt = Date.now();
  app.get("/health", async (_request, reply) => {
    const dbState = mongoose.connection.readyState;
    // 1 = connected
    if (dbState !== 1) {
      return reply.status(503).send({
        status: "error",
        db: "disconnected",
        readyState: dbState,
      });
    }

    // Actively ping the DB with a short timeout.
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

  await app.register(searchRoutes, { prefix: "/api/v1/search" });
  await app.register(quranRoutes, { prefix: "/api/v1/quran" });
  await app.register(rootsRoutes, { prefix: "/api/v1/roots" });
  await app.register(compareRoutes, { prefix: "/api/v1/compare" });
  await app.register(statsRoutes, { prefix: "/api/v1/stats" });

  try {
    await connectDB();

    await app.listen({ port: env.PORT, host: "0.0.0.0" });
    app.log.info({ port: env.PORT, nodeEnv: env.NODE_ENV }, "server started");

    // Graceful shutdown on SIGTERM/SIGINT. Fastify's app.close() drains
    // in-flight requests before resolving.
    const shutdown = async (signal: string) => {
      app.log.info({ signal }, "shutdown signal received, closing server");
      try {
        await app.close();
        await mongoose.disconnect();
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, "error during shutdown");
        process.exit(1);
      }
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

startServer();
