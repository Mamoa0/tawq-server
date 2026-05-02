import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";
import { ApiKey } from "../../../src/database/models/api-key.model.js";
import { hmacKey } from "../../../src/utils/hmac.js";

describe("Contract: Invalid API Keys → 401", () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp();
    // Clear existing keys
    await ApiKey.deleteMany({});
  });

  afterEach(async () => {
    await testApp.close();
  });

  it("unknown key → 401 with stable body shape", async () => {
    const unknownKey = "unknown_key_abc123";
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": unknownKey,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "InvalidApiKey",
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(response.headers["www-authenticate"]).toBe('ApiKey realm="quran-api"');
    expect(response.headers["content-type"]).toContain("application/json");
  });

  it("revoked key → 401 with stable body shape", async () => {
    const plainKey = "revoked_test_key_12345678901234567890";
    const hashedKey = hmacKey(plainKey);

    // Create and revoke a key
    await ApiKey.create({
      hashedKey,
      label: "test-revoked-key",
      status: "revoked",
      revokedAt: new Date(),
    });

    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": plainKey,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "InvalidApiKey",
      message: expect.any(String),
      requestId: expect.any(String),
    });
  });

  it("expired key → 401 with stable body shape", async () => {
    const plainKey = "expired_test_key_1234567890123456789";
    const hashedKey = hmacKey(plainKey);

    // Create an expired key
    await ApiKey.create({
      hashedKey,
      label: "test-expired-key",
      status: "active",
      expiresAt: new Date(Date.now() - 1000), // 1 second in the past
    });

    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": plainKey,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "InvalidApiKey",
      message: expect.any(String),
      requestId: expect.any(String),
    });
  });
});
