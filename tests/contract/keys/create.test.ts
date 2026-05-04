import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";
import { ApiKey } from "../../../src/database/models/api-key.model.js";

describe("Contract: POST /api/v1/keys", () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp();
    await ApiKey.deleteMany({});
  });

  afterEach(async () => {
    await testApp.close();
  });

  it("201 returns a plaintext key that is exactly 64 hex chars", async () => {
    const response = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/keys",
      payload: { label: "test-key" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.key).toMatch(/^[0-9a-f]{64}$/);
    expect(body.id).toBeTypeOf("string");
    expect(body.label).toBe("test-key");
    expect(body.createdAt).toBeTypeOf("string");
  });

  it("returned key authenticates against a protected endpoint", async () => {
    const createResponse = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/keys",
      payload: {},
    });

    expect(createResponse.statusCode).toBe(201);
    const { key } = createResponse.json();

    const authResponse = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: { "x-api-key": key },
    });

    expect(authResponse.statusCode).toBe(200);
  });

  it("missing label defaults to 'self-service'", async () => {
    const response = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/keys",
      payload: {},
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().label).toBe("self-service");
  });

  it("label longer than 64 chars → 400", async () => {
    const response = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/keys",
      payload: { label: "a".repeat(65) },
    });

    expect(response.statusCode).toBe(400);
  });

  it("6th request from same IP within an hour → 429 with Retry-After", async () => {
    for (let i = 0; i < 5; i++) {
      const response = await testApp.app.inject({
        method: "POST",
        url: "/api/v1/keys",
        payload: {},
      });
      expect(response.statusCode).toBe(201);
    }

    const response = await testApp.app.inject({
      method: "POST",
      url: "/api/v1/keys",
      payload: {},
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBeDefined();
  });
});
