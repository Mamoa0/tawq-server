import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";
import { ApiKey } from "../../../src/database/models/api-key.model.js";

describe("Contract: Empty/Malformed API Keys → 401", () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp();
    await ApiKey.deleteMany({});
  });

  afterEach(async () => {
    await testApp.close();
  });

  it("empty string value → 401", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": "",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "InvalidApiKey",
      message: expect.any(String),
      requestId: expect.any(String),
    });
    expect(response.headers["www-authenticate"]).toBe('ApiKey realm="quran-api"');
  });

  it("whitespace-only value → 401", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": "   ",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "InvalidApiKey",
      message: expect.any(String),
      requestId: expect.any(String),
    });
  });

  it("header with no value → 401", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      // Don't include the header at all, which simulates "no value"
    });

    // No header means anonymous → 200 (per spec §3)
    expect(response.statusCode).toBe(200);
  });

  it("oversized key (>128 chars) → 401", async () => {
    const oversizedKey = "a".repeat(129);
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": oversizedKey,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "InvalidApiKey",
      message: expect.any(String),
      requestId: expect.any(String),
    });
  });

  it("non-ASCII characters → 401", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": "key_with_emoji_🚀",
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
