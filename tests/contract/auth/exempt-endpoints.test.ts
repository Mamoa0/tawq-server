import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";

describe("Contract: Exempt Endpoints Ignore Auth Headers", () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp();
  });

  afterEach(async () => {
    await testApp.close();
  });

  const invalidKey = "this_is_not_a_valid_key_at_all";

  it("GET /openapi.json with invalid key → 200", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/openapi.json",
      headers: {
        "x-api-key": invalidKey,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty("openapi");
  });

  it("GET /reference with invalid key → 200", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/reference",
      headers: {
        "x-api-key": invalidKey,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("GET /reference/* with invalid key → 200", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/reference/config.json",
      headers: {
        "x-api-key": invalidKey,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("GET /health with invalid key → 200", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/health",
      headers: {
        "x-api-key": invalidKey,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty("status");
  });

  it("GET /ready with invalid key → 200", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/ready",
      headers: {
        "x-api-key": invalidKey,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("valid key on /openapi.json → 200 (no auth required)", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/openapi.json",
    });

    expect(response.statusCode).toBe(200);
  });
});
