/**
 * T029 – Parity: 200 responses validate against declared response schemas
 *
 * For each route in the Fastify ∩ /openapi.json intersection that returns 200
 * (with empty test DB), validates the response body against the Zod schema
 * declared in the route definition.
 *
 * Closed-shape enforcement (contracts/openapi-parity §2):
 *   The outer response envelope is validated with .strict() so extra undeclared
 *   top-level fields cause the test to fail.  The `data` payload itself remains
 *   unchecked (z.any()) — envelope truthfulness is the contract boundary.
 *
 * Path-parametric routes:
 *   Routes with :param segments require a seeded DB to produce a 200.
 *   Fixture-driven testing for these routes is deferred (T029-deferred);
 *   only param-free routes are exercised in this test.
 *
 * contracts/openapi-parity.contract.md §2
 * FR-010
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { TestApp, buildTestApp } from "../helpers/app.js";
import { isExcludedFromSpec as isExcluded } from "../../src/docs/openapi.js";
import type { CollectedRoute } from "../../src/docs/openapi.js";

const hasPathParams = (url: string): boolean => /:([^/]+)/.test(url);
const hasRequiredQuery = (route: CollectedRoute): boolean => {
  const qs = route.schema?.querystring as z.ZodTypeAny | undefined;
  if (!qs || !(qs instanceof z.ZodObject)) return false;
  for (const [, fieldSchema] of Object.entries((qs as z.ZodObject<any>).shape ?? {})) {
    const s = fieldSchema as z.ZodTypeAny;
    if (!(s instanceof z.ZodOptional) && !(s instanceof z.ZodDefault)) {
      return true;
    }
  }
  return false;
};

/**
 * Return a strict clone of a ZodObject schema for closed-shape validation.
 * Non-object schemas are returned as-is.
 */
function strictEnvelope(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodObject) {
    return schema.strict();
  }
  return schema;
}

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
});

afterAll(async () => {
  await testApp.close();
});

describe("Response schema truthfulness (FR-010)", () => {
  it("simple GET routes without required params return a body matching their declared schema (closed-shape on envelope)", async () => {
    const { app, collectedRoutes } = testApp;

    const candidates = collectedRoutes.filter(
      (r) =>
        !isExcluded(r.url) &&
        r.schema?.summary &&
        !hasPathParams(r.url) &&
        !hasRequiredQuery(r),
    );

    expect(candidates.length, "should have some simple routes to test").toBeGreaterThan(0);

    for (const route of candidates) {
      const method = Array.isArray(route.method) ? route.method[0] : route.method;
      const response = await app.inject({ method, url: route.url });

      if (response.statusCode !== 200) continue;

      const responseSchema200 = (route.schema?.zodResponse as Record<string, z.ZodTypeAny> | undefined)?.[200];
      if (!responseSchema200) continue;

      if (!response.body) continue;
      let body: unknown;
      try {
        body = response.json();
      } catch {
        continue;
      }

      // Enforce closed-shape on the envelope — extra top-level fields must fail.
      const result = strictEnvelope(responseSchema200).safeParse(body);
      expect(
        result.success,
        `${method.toUpperCase()} ${route.url} → response body failed closed-shape schema validation:\n${
          result.success ? "" : JSON.stringify((result as any).error?.issues, null, 2)
        }`,
      ).toBe(true);
    }
  });

  it("all routes with declared response schemas produce 200 or non-5xx for simple requests", async () => {
    const { app, collectedRoutes } = testApp;

    const candidates = collectedRoutes.filter(
      (r) => !isExcluded(r.url) && r.schema?.summary && !hasPathParams(r.url) && !hasRequiredQuery(r),
    );

    for (const route of candidates) {
      const method = Array.isArray(route.method) ? route.method[0] : route.method;
      const response = await app.inject({ method, url: route.url });
      expect(
        response.statusCode,
        `${method.toUpperCase()} ${route.url} returned a 5xx error`,
      ).toBeLessThan(500);
    }
  });
});
