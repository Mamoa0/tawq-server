import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { connectDB } from "./database/connection.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { searchRoutes } from "./modules/search/search.routes.js";
import { quranRoutes } from "./modules/quran/quran.routes.js";
import { rootsRoutes } from "./modules/roots/roots.routes.js";
import compareRoutes from "./modules/compare/compare.routes.js";
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
    origin: true,
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

  app.get("/health", async (_request, _reply) => {
    return { status: "ok" };
  });

  await app.register(searchRoutes, { prefix: "/api/search" });
  await app.register(quranRoutes, { prefix: "/api/quran" });
  await app.register(rootsRoutes, { prefix: "/api/roots" });
  await app.register(compareRoutes, { prefix: "/api/compare" });

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
