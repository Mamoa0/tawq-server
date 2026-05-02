import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";
import { ApiKey } from "../../../src/database/models/api-key.model.js";
import { hmacKey } from "../../../src/utils/hmac.js";

describe("Contract: No-Leak (Cross-State Body Equality)", () => {
  let testApp: TestApp;

  beforeEach(async () => {
    testApp = await buildTestApp();
    await ApiKey.deleteMany({});
  });

  afterEach(async () => {
    await testApp.close();
  });

  it("unknown, revoked, and expired keys all return identical response bodies (minus requestId)", async () => {
    // Create keys for each state
    const unknownKey = "unknown_key_for_leak_test_1234";
    const revokedPlain = "revoked_key_for_leak_test_1234";
    const expiredPlain = "expired_key_for_leak_test_1234";

    const revokedHashed = hmacKey(revokedPlain);
    const expiredHashed = hmacKey(expiredPlain);

    // Create revoked key
    await ApiKey.create({
      hashedKey: revokedHashed,
      label: "revoked-for-leak-test",
      status: "revoked",
      revokedAt: new Date(),
    });

    // Create expired key
    await ApiKey.create({
      hashedKey: expiredHashed,
      label: "expired-for-leak-test",
      status: "active",
      expiresAt: new Date(Date.now() - 1000),
    });

    // Get responses for each state
    const unknownResponse = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: { "x-api-key": unknownKey },
    });

    const revokedResponse = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: { "x-api-key": revokedPlain },
    });

    const expiredResponse = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: { "x-api-key": expiredPlain },
    });

    // Extract bodies without requestId
    const unknownBody = unknownResponse.json();
    const revokedBody = revokedResponse.json();
    const expiredBody = expiredResponse.json();

    // Strip requestId for comparison
    const { requestId: _, ...unknownStripped } = unknownBody;
    const { requestId: __, ...revokedStripped } = revokedBody;
    const { requestId: ___, ...expiredStripped } = expiredBody;

    // All three should have identical error and message
    expect(unknownStripped.error).toBe(revokedStripped.error);
    expect(unknownStripped.error).toBe(expiredStripped.error);

    expect(unknownStripped.message).toBe(revokedStripped.message);
    expect(unknownStripped.message).toBe(expiredStripped.message);

    // Verify the message is generic and doesn't reveal the reason
    expect(unknownStripped.message).not.toMatch(/unknown/i);
    expect(unknownStripped.message).not.toMatch(/revoked/i);
    expect(unknownStripped.message).not.toMatch(/expired/i);
  });

  it("empty key and malformed keys return identical response bodies (minus requestId)", async () => {
    const emptyResponse = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: { "x-api-key": "" },
    });

    const malformedResponse = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: { "x-api-key": "a".repeat(129) }, // Oversized = malformed
    });

    const emptyBody = emptyResponse.json();
    const malformedBody = malformedResponse.json();

    // Strip requestId
    const { requestId: _, ...emptyStripped } = emptyBody;
    const { requestId: __, ...malformedStripped } = malformedBody;

    expect(emptyStripped.error).toBe(malformedStripped.error);
    expect(emptyStripped.message).toBe(malformedStripped.message);
    expect(emptyStripped.error).toBe("InvalidApiKey");
  });

  it("response headers include WWW-Authenticate for all rejection reasons", async () => {
    const testKey = "header_test_key_123456789012345678";
    const hashedKey = hmacKey(testKey);

    // Test unknown key
    const unknownResp = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: { "x-api-key": "not_a_real_key" },
    });
    expect(unknownResp.headers["www-authenticate"]).toBe('ApiKey realm="quran-api"');

    // Test empty key
    const emptyResp = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: { "x-api-key": "" },
    });
    expect(emptyResp.headers["www-authenticate"]).toBe('ApiKey realm="quran-api"');

    // Test revoked key
    await ApiKey.create({
      hashedKey,
      label: "test-header-revoked",
      status: "revoked",
      revokedAt: new Date(),
    });

    const revokedResp = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: { "x-api-key": testKey },
    });
    expect(revokedResp.headers["www-authenticate"]).toBe('ApiKey realm="quran-api"');
  });

  it("reason enum (unknown/revoked/expired/empty/malformed) does NOT appear in response body", async () => {
    const unknownResp = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surahs",
      headers: { "x-api-key": "unknown_key_test_12345678" },
    });

    const body = JSON.stringify(unknownResp.json());
    expect(body).not.toMatch(/unknown/i);
    expect(body).not.toMatch(/revoked/i);
    expect(body).not.toMatch(/expired/i);
    expect(body).not.toMatch(/empty/i);
    expect(body).not.toMatch(/malformed/i);
  });
});
