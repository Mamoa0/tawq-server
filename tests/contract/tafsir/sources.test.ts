import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";
import { ApiKey } from "../../../src/database/models/api-key.model.js";
import { TafsirSource } from "../../../src/database/models/index.js";
import { hmacKey } from "../../../src/utils/hmac.js";

describe("Contract: GET /api/v1/tafsir/sources", () => {
  let testApp: TestApp;
  let validPlainKey: string;
  let validHashedKey: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    await ApiKey.deleteMany({});
    await TafsirSource.deleteMany({});

    validPlainKey = "tafsir_test_key_12345678901234567890";
    validHashedKey = hmacKey(validPlainKey);

    await ApiKey.create({
      hashedKey: validHashedKey,
      label: "test-tafsir-key",
      status: "active",
    });

    await TafsirSource.create([
      {
        slug: "muyassar",
        name: { ar: "التفسير الميسر" },
        author: "Ministry of Awqaf and Islamic Affairs, Kuwait",
        language: "ar",
        direction: "rtl",
        format: "text",
        grouping: "ayah",
        generation: 1,
        ingestedAt: new Date("2026-01-01"),
      },
      {
        slug: "mukhtasar",
        name: { ar: "المختصر في تفسير القرآن الكريم" },
        author: "Ibn Kathir",
        language: "ar",
        direction: "rtl",
        format: "text",
        grouping: "ayah",
        generation: 1,
        ingestedAt: new Date("2026-01-01"),
      },
      {
        slug: "tadabbur-wa-amal",
        name: { ar: "التدبر والتحليل" },
        author: "Various scholars",
        language: "ar",
        direction: "rtl",
        format: "text",
        grouping: "range",
        generation: 1,
        ingestedAt: new Date("2026-01-01"),
      },
    ]);
  });

  afterEach(async () => {
    await testApp.close();
  });

  it("returns 200 with all v1 source metadata when called with valid API key", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/sources",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("data");
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(3);

    const slugs = body.data.map((s: any) => s.slug);
    expect(slugs).toContain("muyassar");
    expect(slugs).toContain("mukhtasar");
    expect(slugs).toContain("tadabbur-wa-amal");

    for (const source of body.data) {
      expect(source).toHaveProperty("slug");
      expect(source).toHaveProperty("name");
      expect(source).toHaveProperty("author");
      expect(source).toHaveProperty("language");
      expect(source).toHaveProperty("direction");
      expect(source).toHaveProperty("format");
      expect(source).toHaveProperty("grouping");
      expect(source.name).toHaveProperty("ar");
      expect(source.direction).toMatch(/^(rtl|ltr)$/);
      expect(source.format).toMatch(/^(text|html)$/);
      expect(source.grouping).toMatch(/^(ayah|range)$/);
    }
  });

  it("returns 401 with InvalidApiKey body when called without API key", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/sources",
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body).toHaveProperty("error", "InvalidApiKey");
    expect(body).toHaveProperty("message");
    expect(body).toHaveProperty("requestId");
  });

  it("returns 401 with InvalidApiKey body when called with invalid API key", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/sources",
      headers: {
        "x-api-key": "invalid_key_that_should_fail",
      },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body).toHaveProperty("error", "InvalidApiKey");
  });

  it("?language=ar filters correctly", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/sources?language=ar",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(3);
    for (const source of body.data) {
      expect(source.language).toBe("ar");
    }
  });

  it("?language=en returns empty array when no english sources exist", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/sources?language=en",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });

  it("response shape matches SourceListItem contract", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/sources",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    for (const source of body.data) {
      expect(typeof source.slug).toBe("string");
      expect(source.slug).toMatch(/^[a-z0-9](-?[a-z0-9])*$/);
      expect(typeof source.name).toBe("object");
      expect(typeof source.author).toBe("string");
      expect(typeof source.language).toBe("string");
      expect(source.direction).toMatch(/^(rtl|ltr)$/);
      expect(source.format).toMatch(/^(text|html)$/);
      expect(source.grouping).toMatch(/^(ayah|range)$/);
    }
  });

  it("sources are sorted alphabetically by slug", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/sources",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const slugs = body.data.map((s: any) => s.slug);
    expect(slugs).toEqual([...slugs].sort());
  });
});
