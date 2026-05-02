import { FastifyInstance } from "fastify";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";
import { clearCache } from "../../src/services/api-key.service.js";
import { clearRateLimiter } from "../../src/plugins/api-key.plugin.js";

export interface TestApp {
  app: FastifyInstance;
  close: () => Promise<void>;
}

/**
 * Build a test app instance connected to mongodb-memory-server.
 * Uses MONGO_URI_TEST env var (set by globalSetup), falling back to MONGO_URI if needed.
 * Initializes Mongoose connection and readies the app before returning.
 */
export const buildTestApp = async (): Promise<TestApp> => {
  const mongoUri = process.env.MONGO_URI_TEST || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error(
      "MONGO_URI_TEST or MONGO_URI must be set to build a test app",
    );
  }

  // Clear the API key validation cache and rate limiter to ensure fresh state for each test
  clearCache();
  clearRateLimiter();

  // Connect Mongoose to the test DB if not already connected
  // We keep the connection open between tests to avoid disconnect/reconnect race conditions
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  // Create the Fastify app
  const app = await createApp();

  // Register a test echo route to verify apiKeyContext attachment
  // This route sits behind the auth plugin to test context propagation
  app.get("/__test/whoami", async (request, reply) => {
    const keyId = (request as any).apiKeyContext?.keyId ?? null;
    reply.send({ keyId });
  });

  // Ready the app (register all hooks and plugins)
  await app.ready();

  // Return both the app and a close function for cleanup
  return {
    app,
    close: async () => {
      // Close the Fastify app but keep the Mongoose connection open
      // to avoid disconnect/reconnect race conditions that cause test isolation failures
      await app.close();
    },
  };
};
