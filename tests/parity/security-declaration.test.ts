/**
 * T031 – Parity: Security declarations in /openapi.json match the runtime auth-plugin
 *
 * contracts/openapi-parity.contract.md §5
 * contracts/auth.contract.md §7
 * FR-007, FR-012
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestApp, buildTestApp } from "../helpers/app.js";

type OpenAPISpec = {
  components?: {
    securitySchemes?: Record<
      string,
      { type: string; in?: string; name?: string; description?: string }
    >;
  };
  paths?: Record<
    string,
    Record<string, { security?: Array<Record<string, string[]>> }>
  >;
};

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
});

afterAll(async () => {
  await testApp.close();
});

describe("Security declaration parity (FR-007, FR-012)", () => {
  it("declares components.securitySchemes.ApiKeyAuth with correct shape", async () => {
    const specResponse = await testApp.app.inject({
      method: "GET",
      url: "/openapi.json",
    });
    expect(specResponse.statusCode).toBe(200);

    const spec = specResponse.json() as OpenAPISpec;
    const scheme = spec.components?.securitySchemes?.ApiKeyAuth;

    expect(scheme, "ApiKeyAuth security scheme must be declared").toBeDefined();
    expect(scheme?.type).toBe("apiKey");
    expect(scheme?.in).toBe("header");
    expect(scheme?.name).toBe("X-API-Key");
    expect(scheme?.description, "ApiKeyAuth must have a non-empty description").toBeTruthy();
  });

  it("every operation in the spec references ApiKeyAuth security", async () => {
    const specResponse = await testApp.app.inject({
      method: "GET",
      url: "/openapi.json",
    });
    const spec = specResponse.json() as OpenAPISpec;

    const drift: string[] = [];

    for (const [path, methods] of Object.entries(spec.paths ?? {})) {
      for (const [method, operation] of Object.entries(methods)) {
        if (method === "parameters") continue;

        const security = operation.security;

        // Must have security: [{ApiKeyAuth: []}]
        const hasApiKeyAuth =
          Array.isArray(security) &&
          security.some(
            (entry) =>
              typeof entry === "object" &&
              "ApiKeyAuth" in entry &&
              Array.isArray((entry as any).ApiKeyAuth),
          );

        if (!hasApiKeyAuth) {
          drift.push(`${method.toUpperCase()} ${path}: missing security: [{ApiKeyAuth: []}]`);
        }
      }
    }

    expect(
      drift,
      `Operations missing ApiKeyAuth security declaration:\n${drift.join("\n")}`,
    ).toHaveLength(0);
  });

  it("/openapi.json is itself reachable without an API key (exempt endpoint)", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/openapi.json",
    });
    expect(response.statusCode).toBe(200);
  });

  it("exempt paths are absent from spec.paths — a future regression that leaks them in must fail (FR-007 §2)", async () => {
    const specResponse = await testApp.app.inject({
      method: "GET",
      url: "/openapi.json",
    });
    const spec = specResponse.json() as OpenAPISpec;

    const exemptPaths = ["/health", "/ready", "/openapi.json", "/reference"];
    for (const exemptPath of exemptPaths) {
      expect(
        spec.paths?.[exemptPath],
        `Exempt path "${exemptPath}" must not appear in /openapi.json spec.paths`,
      ).toBeUndefined();
    }
  });

  it("spec has at least one documented operation (sanity guard)", async () => {
    const specResponse = await testApp.app.inject({
      method: "GET",
      url: "/openapi.json",
    });
    const spec = specResponse.json() as OpenAPISpec;

    const opCount = Object.values(spec.paths ?? {}).reduce(
      (sum, methods) => sum + Object.keys(methods).filter((m) => m !== "parameters").length,
      0,
    );
    expect(opCount).toBeGreaterThan(10);
  });
});
