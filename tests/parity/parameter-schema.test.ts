/**
 * T030 – Parity: Fastify route schemas match OpenAPI parameter declarations
 *
 * For each route in the intersection, compare:
 *   • path parameters:  names, required flag (always true for path params)
 *   • query parameters: names, required/optional flag, enum members
 *   • request body: presence (if Zod declares body, spec must have requestBody)
 *
 * contracts/openapi-parity.contract.md §3
 * FR-011
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { z } from "zod";
import { TestApp, buildTestApp } from "../helpers/app.js";
import { canonical } from "../../src/utils/route-canonical.js";
import { isExcludedFromSpec as isExcluded } from "../../src/docs/openapi.js";

type OpenAPIParameter = {
  in: string;
  name: string;
  required?: boolean;
  schema?: { type?: string; enum?: unknown[] };
};

type OpenAPIOperation = {
  parameters?: OpenAPIParameter[];
  requestBody?: unknown;
};

type OpenAPISpec = {
  paths?: Record<string, Record<string, OpenAPIOperation>>;
};

/** True when the Zod field is optional (not required on the wire).
 *  Recurses through ZodPipe (Zod 4 transforms) and ZodEffects (Zod 3) to find
 *  ZodOptional or ZodDefault inside pipeline wrappers like .default().transform(). */
function isZodOptional(field: z.ZodTypeAny): boolean {
  if (field instanceof z.ZodOptional) return true;
  if (field instanceof z.ZodDefault) return true;
  const def = (field as any)._def;
  if (!def) return false;
  // ZodPipe (Zod 4): input type lives at def.in
  if (def.in) return isZodOptional(def.in as z.ZodTypeAny);
  // ZodEffects (Zod 3 transform/preprocess): inner schema at def.schema
  if (def.schema) return isZodOptional(def.schema as z.ZodTypeAny);
  return false;
}

/** Return enum values if the Zod schema is (or wraps) a ZodEnum; otherwise undefined. */
function zodEnumValues(field: z.ZodTypeAny): string[] | undefined {
  if (field instanceof z.ZodEnum) return [...(field as z.ZodEnum<any>).options] as string[];
  if (field instanceof z.ZodOptional) return zodEnumValues((field as z.ZodOptional<any>).unwrap());
  if (field instanceof z.ZodDefault) return zodEnumValues((field as z.ZodDefault<any>).removeDefault());
  return undefined;
}

let testApp: TestApp;

beforeAll(async () => {
  testApp = await buildTestApp();
});

afterAll(async () => {
  await testApp.close();
});

describe("Parameter schema truthfulness (FR-011)", () => {
  it("routes with Zod param schemas have matching path parameters in the OpenAPI spec (names + always-required)", async () => {
    const { app, collectedRoutes } = testApp;

    const specResponse = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(specResponse.statusCode).toBe(200);
    const spec = specResponse.json() as OpenAPISpec;

    const drift: string[] = [];

    for (const route of collectedRoutes) {
      if (isExcluded(route.url) || !route.schema?.summary) continue;

      const zodParams = route.schema.params as z.ZodObject<any> | undefined;
      if (!zodParams || !(zodParams instanceof z.ZodObject)) continue;

      const method = (Array.isArray(route.method) ? route.method[0] : route.method).toLowerCase();
      const openApiPath = route.url.replace(/:([^/{}?]+)/g, "{$1}");

      const specOperation = spec.paths?.[openApiPath]?.[method];
      if (!specOperation) {
        drift.push(`${canonical(method, route.url)}: operation missing from spec`);
        continue;
      }

      const specPathParams = (specOperation.parameters ?? []).filter((p) => p.in === "path");
      const zodParamKeys = Object.keys(zodParams.shape);

      for (const key of zodParamKeys) {
        const specParam = specPathParams.find((p) => p.name === key);
        if (!specParam) {
          drift.push(`${canonical(method, route.url)}: path param "${key}" missing from spec`);
          continue;
        }
        // Path params are always required in OpenAPI
        if (specParam.required !== true) {
          drift.push(`${canonical(method, route.url)}: path param "${key}" should be required:true in spec`);
        }
      }

      for (const specParam of specPathParams) {
        if (!zodParamKeys.includes(specParam.name)) {
          drift.push(`${canonical(method, route.url)}: spec path param "${specParam.name}" not in Zod schema`);
        }
      }
    }

    expect(drift, `Parameter schema drift detected:\n${drift.join("\n")}`).toHaveLength(0);
  });

  it("routes with Zod querystring schemas have matching query parameters (names, required-ness, enum members)", async () => {
    const { app, collectedRoutes } = testApp;

    const specResponse = await app.inject({ method: "GET", url: "/openapi.json" });
    const spec = specResponse.json() as OpenAPISpec;

    const drift: string[] = [];

    for (const route of collectedRoutes) {
      if (isExcluded(route.url) || !route.schema?.summary) continue;

      const zodQS = route.schema.querystring as z.ZodObject<any> | undefined;
      if (!zodQS || !(zodQS instanceof z.ZodObject)) continue;

      const method = (Array.isArray(route.method) ? route.method[0] : route.method).toLowerCase();
      const openApiPath = route.url.replace(/:([^/{}?]+)/g, "{$1}");

      const specOperation = spec.paths?.[openApiPath]?.[method];
      if (!specOperation) continue;

      const specQueryParams = (specOperation.parameters ?? []).filter((p) => p.in === "query");

      for (const key of Object.keys(zodQS.shape)) {
        const zodField = zodQS.shape[key] as z.ZodTypeAny;
        const specParam = specQueryParams.find((p) => p.name === key);

        if (!specParam) {
          drift.push(`${canonical(method, route.url)}: query param "${key}" missing from spec`);
          continue;
        }

        // required-ness: Zod optional/default → required:false, otherwise required:true
        const zodOptional = isZodOptional(zodField);
        const specRequired = specParam.required ?? false;
        if (zodOptional === specRequired) {
          drift.push(
            `${canonical(method, route.url)}: query param "${key}" required mismatch — Zod:${!zodOptional} spec:${specRequired}`,
          );
        }

        // enum members: if Zod declares an enum, spec must declare the same members
        const zodEnums = zodEnumValues(zodField);
        if (zodEnums !== undefined) {
          const specEnums = specParam.schema?.enum as string[] | undefined;
          if (!specEnums) {
            drift.push(`${canonical(method, route.url)}: query param "${key}" has Zod enum but spec lacks enum`);
          } else {
            const a = [...zodEnums].sort().join(",");
            const b = [...specEnums].sort().join(",");
            if (a !== b) {
              drift.push(
                `${canonical(method, route.url)}: query param "${key}" enum mismatch — Zod:[${a}] spec:[${b}]`,
              );
            }
          }
        }
      }
    }

    expect(drift, `Query parameter drift detected:\n${drift.join("\n")}`).toHaveLength(0);
  });

  it("routes with a Zod body schema have a requestBody in the OpenAPI spec", async () => {
    const { app, collectedRoutes } = testApp;

    const specResponse = await app.inject({ method: "GET", url: "/openapi.json" });
    const spec = specResponse.json() as OpenAPISpec;

    const drift: string[] = [];

    for (const route of collectedRoutes) {
      if (isExcluded(route.url) || !route.schema?.summary) continue;
      if (!route.schema.body) continue;

      const method = (Array.isArray(route.method) ? route.method[0] : route.method).toLowerCase();
      const openApiPath = route.url.replace(/:([^/{}?]+)/g, "{$1}");

      const specOperation = spec.paths?.[openApiPath]?.[method];
      if (!specOperation?.requestBody) {
        drift.push(`${canonical(method, route.url)}: has Zod body schema but spec lacks requestBody`);
      }
    }

    expect(drift, `Body schema drift:\n${drift.join("\n")}`).toHaveLength(0);
  });
});
