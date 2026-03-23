import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";

export const registry = new OpenAPIRegistry();

export function generateOpenAPI() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Quran API",
      description: "API for Quran and Search functionality",
    },
    servers: [{ url: "http://localhost:5000" }],
  });
}
