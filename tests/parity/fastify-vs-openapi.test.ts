/**
 * T028 – Parity: Fastify route inventory == /openapi.json path inventory
 *
 * contracts/openapi-parity.contract.md §1
 * FR-008, FR-009
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { TestApp, buildTestApp } from "../helpers/app.js";
import { canonical } from "../../src/utils/route-canonical.js";
import { isExcludedFromSpec as isParityExcluded } from "../../src/docs/openapi.js";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
});

afterAll(async () => {
  await testApp.close();
});

describe("Fastify route inventory vs /openapi.json (FR-008, FR-009)", () => {
  it("every documented Fastify route appears in /openapi.json", async () => {
    const { app, collectedRoutes } = testApp;

    const specResponse = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(specResponse.statusCode).toBe(200);

    const spec = specResponse.json() as {
      paths?: Record<string, Record<string, unknown>>;
    };

    // Build canonical set from OpenAPI spec
    const specRoutes = new Set<string>();
    for (const [path, methods] of Object.entries(spec.paths ?? {})) {
      for (const method of Object.keys(methods)) {
        if (method === "parameters") continue; // shared parameters block, not a method
        specRoutes.add(canonical(method, path));
      }
    }

    // Build canonical set from ALL non-excluded Fastify routes.
    // No summary filter: every non-excluded route must appear in /openapi.json.
    // (The onRoute hook in app.ts throws if a non-excluded route lacks schema.summary,
    //  so this is a second line of defence, not a redundant check.)
    const fastifyRoutes = new Set<string>();
    for (const route of collectedRoutes) {
      if (isParityExcluded(route.url)) continue;
      const method = Array.isArray(route.method) ? route.method[0] : route.method;
      fastifyRoutes.add(canonical(method, route.url));
    }

    // Every documented Fastify route must appear in the spec
    const missingFromSpec = [...fastifyRoutes].filter((r) => !specRoutes.has(r));
    expect(missingFromSpec, `Routes in Fastify but missing from /openapi.json:\n${missingFromSpec.join("\n")}`).toHaveLength(0);
  });

  it("every /openapi.json path corresponds to a registered Fastify route", async () => {
    const { app, collectedRoutes } = testApp;

    const specResponse = await app.inject({ method: "GET", url: "/openapi.json" });
    const spec = specResponse.json() as {
      paths?: Record<string, Record<string, unknown>>;
    };

    const fastifyCanonical = new Set<string>();
    for (const route of collectedRoutes) {
      if (isParityExcluded(route.url)) continue;
      const method = Array.isArray(route.method) ? route.method[0] : route.method;
      fastifyCanonical.add(canonical(method, route.url));
    }

    const missingFromCode: string[] = [];
    for (const [path, methods] of Object.entries(spec.paths ?? {})) {
      for (const method of Object.keys(methods)) {
        if (method === "parameters") continue;
        const c = canonical(method, path);
        if (!fastifyCanonical.has(c)) {
          missingFromCode.push(c);
        }
      }
    }

    expect(missingFromCode, `Routes in /openapi.json but not in Fastify:\n${missingFromCode.join("\n")}`).toHaveLength(0);
  });

  it("non-excluded routes are a non-empty set (sanity guard against vacuous pass)", () => {
    const { collectedRoutes } = testApp;
    const nonExcluded = collectedRoutes.filter((r) => !isParityExcluded(r.url));
    expect(nonExcluded.length).toBeGreaterThan(10);
  });
});
