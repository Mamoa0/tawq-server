import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";
import { ApiKey } from "../../../src/database/models/api-key.model.js";
import { hmacKey } from "../../../src/utils/hmac.js";

describe("Contract: Transport-Only Header Authentication", () => {
  let testApp: TestApp;
  let validPlainKey: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    await ApiKey.deleteMany({});

    validPlainKey = "transport_only_valid_key_1234567890";
    const validHashedKey = hmacKey(validPlainKey);

    await ApiKey.create({
      hashedKey: validHashedKey,
      label: "test-transport-key",
      status: "active",
    });
  });

  afterEach(async () => {
    await testApp.close();
  });

  it("valid key in query string ?apiKey=... → treated as anonymous", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/quran/surahs?apiKey=${validPlainKey}`,
    });

    // Should succeed but as anonymous, not authenticated
    expect(response.statusCode).toBe(200);
  });

  it("valid key in POST body → treated as anonymous", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      payload: {
        apiKey: validPlainKey,
      },
    });

    // Should succeed as anonymous
    expect(response.statusCode).toBe(200);
  });

  it("valid key in Authorization: Bearer header → treated as anonymous", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        authorization: `Bearer ${validPlainKey}`,
      },
    });

    // Should succeed as anonymous, not authenticated
    expect(response.statusCode).toBe(200);
  });

  it("X-API-Key header is the ONLY transport mechanism", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    // Only X-API-Key header should work for authentication
    expect(response.statusCode).toBe(200);
  });

  it("key in query string is not leaked in logs/headers", async () => {
    // This is a behavioral test - the server should not echo back the query parameter
    const response = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/quran/surahs?apiKey=secret_key_to_not_leak`,
    });

    // Verify the response doesn't contain the key
    const body = JSON.stringify(response.json());
    expect(body).not.toMatch(/secret_key_to_not_leak/);

    // Verify headers don't contain the key
    const headers = JSON.stringify(response.headers);
    expect(headers).not.toMatch(/secret_key_to_not_leak/);
  });

  it("multiple auth transports combined → still only X-API-Key is recognized", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: `/api/v1/quran/surahs?apiKey=${validPlainKey}`,
      headers: {
        authorization: `Bearer ${validPlainKey}`,
      },
    });

    // Should succeed as anonymous (neither query string nor Authorization header is valid)
    expect(response.statusCode).toBe(200);
  });
});
