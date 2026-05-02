import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";
import { ApiKey } from "../../../src/database/models/api-key.model.js";
import { hmacKey } from "../../../src/utils/hmac.js";

describe("Contract: Rate-Limited Invalid Attempts", () => {
  let testApp: TestApp;
  let validPlainKey: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    await ApiKey.deleteMany({});

    validPlainKey = "valid_rate_limit_key_123456789012";
    const validHashedKey = hmacKey(validPlainKey);

    // Create a valid key for later tests
    await ApiKey.create({
      hashedKey: validHashedKey,
      label: "test-rate-limit-key",
      status: "active",
    });
  });

  afterEach(async () => {
    await testApp.close();
  });

  it("30 invalid-key attempts → each 401", async () => {
    const invalidKey = "invalid_key_for_rate_limit_test";

    for (let i = 0; i < 30; i++) {
      const response = await testApp.app.inject({
        method: "GET",
        url: "/api/v1/quran/surahs",
        headers: {
          "x-api-key": invalidKey,
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: "InvalidApiKey",
        message: expect.any(String),
        requestId: expect.any(String),
      });
    }
  });

  it("31st invalid-key attempt → 429 with Retry-After", async () => {
    const invalidKey = "invalid_key_for_rate_limit_test_31";

    // Make 30 requests to fill the bucket
    for (let i = 0; i < 30; i++) {
      await testApp.app.inject({
        method: "GET",
        url: "/api/v1/quran/surahs",
        headers: {
          "x-api-key": invalidKey,
        },
      });
    }

    // 31st request should be rate-limited
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": invalidKey,
      },
    });

    expect(response.statusCode).toBe(429);
    expect(response.headers["retry-after"]).toBeDefined();
  });

  it("valid-key traffic from same IP is unaffected by invalid-key rate limit", async () => {
    const invalidKey = "another_invalid_key_for_testing";

    // Flood with invalid keys to hit the rate limit
    for (let i = 0; i < 30; i++) {
      await testApp.app.inject({
        method: "GET",
        url: "/api/v1/quran/surahs",
        headers: {
          "x-api-key": invalidKey,
        },
      });
    }

    // Now try valid key - should still succeed (separate bucket)
    const validResponse = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(validResponse.statusCode).toBe(200);
  });

  it("invalid-key rate limit bucket is per-key digest", async () => {
    // Each different key should have its own bucket
    const key1 = "invalid_key_bucket_1";
    const key2 = "invalid_key_bucket_2";

    // 30 attempts with key1
    for (let i = 0; i < 30; i++) {
      await testApp.app.inject({
        method: "GET",
        url: "/api/v1/quran/surahs",
        headers: {
          "x-api-key": key1,
        },
      });
    }

    // key1 should be rate-limited
    const key1Response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": key1,
      },
    });
    expect(key1Response.statusCode).toBe(429);

    // key2 should not be rate-limited (different bucket)
    const key2Response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": key2,
      },
    });
    expect(key2Response.statusCode).toBe(401);
  });
});
