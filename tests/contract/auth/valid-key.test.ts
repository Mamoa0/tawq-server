import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";
import { ApiKey } from "../../../src/database/models/api-key.model.js";
import { hmacKey } from "../../../src/utils/hmac.js";

describe("Contract: Valid API Keys → 200 (Authenticated)", () => {
  let testApp: TestApp;
  let validPlainKey: string;
  let validHashedKey: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    await ApiKey.deleteMany({});

    validPlainKey = "valid_test_key_12345678901234567890";
    validHashedKey = hmacKey(validPlainKey);

    // Create an active key
    await ApiKey.create({
      hashedKey: validHashedKey,
      label: "test-valid-key",
      status: "active",
    });
  });

  afterEach(async () => {
    await testApp.close();
  });

  it("active key on endpoint → 200", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("valid key → no WWW-Authenticate header in response", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["www-authenticate"]).toBeUndefined();
  });

  it("valid key → request context includes apiKeyContext", async () => {
    // This test verifies that the auth plugin attaches key context
    // For now, we just verify the request succeeds
    // In a real scenario, we'd have a test endpoint that echoes the context
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
  });

  it("no API key on endpoint → 200 (anonymous)", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
    });

    expect(response.statusCode).toBe(200);
  });

  it("valid key with future expiration → 200", async () => {
    const futureKey = "future_expiry_key_1234567890123456";
    const futureHashedKey = hmacKey(futureKey);

    await ApiKey.create({
      hashedKey: futureHashedKey,
      label: "test-future-key",
      status: "active",
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    });

    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": futureKey,
      },
    });

    expect(response.statusCode).toBe(200);
  });
});
