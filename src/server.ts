import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import mongoose from "mongoose";
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
  const app = Fastify({ logger: true });

  app.setErrorHandler(errorHandler);

  await app.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    // Compare endpoints are heavier — tighten their limit
    keyGenerator: (request) => request.ip,
  });

  registerRoutes();
  const openApiDoc = generateOpenAPI();

  app.get("/openapi.json", () => openApiDoc);

  await app.register(scalarApiReference, {
    routePrefix: "/reference",
    configuration: {
      content: openApiDoc,
      metaData: {
        title: "Quran API Documentation",
      },
    },
  });

  app.get("/health", async (_request, reply) => {
    const dbState = mongoose.connection.readyState;
    // 1 = connected
    if (dbState !== 1) {
      return reply.status(503).send({ status: "error", db: "disconnected" });
    }
    return { status: "ok", db: "connected" };
  });

  await app.register(searchRoutes, { prefix: "/api/v1/search" });
  await app.register(quranRoutes, { prefix: "/api/v1/quran" });
  await app.register(rootsRoutes, { prefix: "/api/v1/roots" });
  await app.register(compareRoutes, { prefix: "/api/v1/compare" });
  await app.register(statsRoutes, { prefix: "/api/v1/stats" });

  try {
    await connectDB();

    const PORT = parseInt(process.env.PORT || "5000", 10);
    await app.listen({ port: PORT, host: "0.0.0.0" });

    console.log(`🚀 Server is running on port ${PORT}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

startServer();
