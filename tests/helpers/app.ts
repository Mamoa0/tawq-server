import { FastifyInstance } from "fastify";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { clearCache } from "../../src/services/api-key.service.js";
import { clearRateLimiter } from "../../src/plugins/api-key.plugin.js";
import type { CollectedRoute } from "../../src/docs/openapi.js";

export interface TestApp {
  app: FastifyInstance;
  close: () => Promise<void>;
  /** Routes collected by the onRoute hook — populated after app.ready(). */
  collectedRoutes: CollectedRoute[];
}

/**
 * Build a test app instance connected to mongodb-memory-server.
 * Uses MONGO_URI_TEST env var (set by globalSetup), falling back to MONGO_URI if needed.
 */
export const buildTestApp = async (): Promise<TestApp> => {
  const mongoUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error(
      "MONGO_URI_TEST or MONGO_URI must be set to build a test app",
    );
  }

  clearCache();
  clearRateLimiter();

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  const app = await createApp();

  // Register a test echo route to verify apiKeyContext attachment
  app.get("/__test/whoami", async (request, reply) => {
    const keyId = (request as any).apiKeyContext?.keyId ?? null;
    reply.send({ keyId });
  });

  await app.ready();

  const collectedRoutes: CollectedRoute[] =
    (app as any).getCollectedRoutes?.() ?? [];

  return {
    app,
    collectedRoutes,
    close: async () => {
      await app.close();
    },
  };
};
