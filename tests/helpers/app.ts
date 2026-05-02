import { FastifyInstance } from "fastify";
import mongoose from "mongoose";
import { createApp } from "../../src/app.js";

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

  // Connect Mongoose to the test DB
  await mongoose.connect(mongoUri);

  // Create the Fastify app
  const app = await createApp();

  // Ready the app (register all hooks and plugins)
  await app.ready();

  // Return both the app and a close function for cleanup
  return {
    app,
    close: async () => {
      await app.close();
      await mongoose.disconnect();
    },
  };
};
