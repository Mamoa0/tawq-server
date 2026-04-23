import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  MONGO_URI: z.string().url("MONGO_URI must be a valid MongoDB connection string"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  API_URL: z.string().url().optional(),
  GEMINI_API_KEY: z.string().optional(),
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  // If API_URL is not set, fall back to the local dev URL for OpenAPI docs.
  API_URL: parsed.API_URL ?? `http://localhost:${parsed.PORT}`,
};
