import "dotenv/config";
import mongoose from "mongoose";
import { env } from "./config/env.js";
import { connectDB } from "./database/connection.js";
import { createApp } from "./app.js";

const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    const app = await createApp();

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
    console.error(error);
    process.exit(1);
  }
};

startServer();
