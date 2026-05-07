import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";
import { ApiKey } from "../../../src/database/models/api-key.model.js";
import { TafsirSource, Tafsir } from "../../../src/database/models/index.js";
import { hmacKey } from "../../../src/utils/hmac.js";
import { clearTafsirCache } from "../../../src/modules/tafsir/tafsir.service.js";

describe("Contract: GET /api/v1/tafsir/:surah/:ayah", () => {
  let testApp: TestApp;
  let validPlainKey: string;
  let validHashedKey: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    clearTafsirCache();
    await ApiKey.deleteMany({});
    await TafsirSource.deleteMany({});
    await Tafsir.deleteMany({});

    validPlainKey = "tafsir_ayah_test_key_12345678901234567890";
    validHashedKey = hmacKey(validPlainKey);

    await ApiKey.create({
      hashedKey: validHashedKey,
      label: "test-tafsir-ayah-key",
      status: "active",
    });

    await TafsirSource.create([
      {
        slug: "muyassar",
        name: { ar: "التفسير الميسر" },
        author: "Ministry of Awqaf",
        language: "ar",
        direction: "rtl",
        format: "text",
        grouping: "ayah",
        generation: 1,
        ingestedAt: new Date("2026-01-01"),
      },
      {
        slug: "mukhtasar",
        name: { ar: "المختصر" },
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
        name: { ar: "التدبر" },
        author: "Various",
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

  it("returns 200 with results + missing for valid ayah", async () => {
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Tafsir text for ayah 2:20",
      ingestedAt: new Date("2026-01-01"),
    });

    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("surah", 2);
    expect(body).toHaveProperty("ayah", 20);
    expect(body).toHaveProperty("results");
    expect(body).toHaveProperty("missing");
    expect(Array.isArray(body.results)).toBe(true);
    expect(Array.isArray(body.missing)).toBe(true);
    expect(body.results.length).toBe(1);
    expect(body.results[0].source.slug).toBe("muyassar");
    expect(body.missing).toContain("mukhtasar");
    expect(body.missing).toContain("tadabbur-wa-amal");
  });

  it("returns 200 with all sources in missing when no data exists", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.results.length).toBe(0);
    expect(body.missing).toContain("muyassar");
    expect(body.missing).toContain("mukhtasar");
    expect(body.missing).toContain("tadabbur-wa-amal");
  });

  it("returns 400 for invalid surah", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/999/20",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 400 for invalid ayah", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/999",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("Validation Error");
    expect(body.message).toContain("does not exist");
  });

  it("returns 401 for missing API key", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20",
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error).toBe("InvalidApiKey");
  });

  it("returns 401 for invalid API key", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20",
      headers: {
        "x-api-key": "invalid_key",
      },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error).toBe("InvalidApiKey");
  });

  it("range-shaped entry returns actual ayahStart/ayahEnd across different requested ayahs", async () => {
    await Tafsir.create({
      sourceSlug: "tadabbur-wa-amal",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 25,
      text: "Range tafsir for ayahs 20-25",
      ingestedAt: new Date("2026-01-01"),
    });

    const response20 = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response20.statusCode).toBe(200);
    const body20 = response20.json();
    const tadabburEntry = body20.results.find((r: any) => r.source.slug === "tadabbur-wa-amal");
    expect(tadabburEntry).toBeDefined();
    expect(tadabburEntry.ayahStart).toBe(20);
    expect(tadabburEntry.ayahEnd).toBe(25);

    const response21 = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/21",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response21.statusCode).toBe(200);
    const body21 = response21.json();
    const tadabburEntry21 = body21.results.find((r: any) => r.source.slug === "tadabbur-wa-amal");
    expect(tadabburEntry21).toBeDefined();
    expect(tadabburEntry21.ayahStart).toBe(20);
    expect(tadabburEntry21.ayahEnd).toBe(25);
  });

  it("ETag header is present and 304 works", async () => {
    const response1 = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response1.statusCode).toBe(200);
    const etag = response1.headers["etag"] as string;
    expect(etag).toBeDefined();
    expect(etag.startsWith("W/")).toBe(true);

    const response2 = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20",
      headers: {
        "x-api-key": validPlainKey,
        "if-none-match": etag,
      },
    });

    expect(response2.statusCode).toBe(304);
  });

  it("?sources= comma-separated filtering works", async () => {
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Muyassar text",
      ingestedAt: new Date("2026-01-01"),
    });

    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20?sources=muyassar",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.results.length).toBe(1);
    expect(body.results[0].source.slug).toBe("muyassar");
  });

  it("unknown slug appears in missing", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20?sources=muyassar,nonexistent",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.missing).toContain("nonexistent");
  });

  it("defaults to all registered sources when sources omitted", async () => {
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Muyassar text",
      ingestedAt: new Date("2026-01-01"),
    });

    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.results.length).toBe(1);
    expect(body.missing).toContain("mukhtasar");
    expect(body.missing).toContain("tadabbur-wa-amal");
  });

  it("response includes Cache-Control header", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/tafsir/2/20",
      headers: {
        "x-api-key": validPlainKey,
      },
    });

    expect(response.statusCode).toBe(200);
    const cacheControl = response.headers["cache-control"] as string;
    expect(cacheControl).toContain("public");
    expect(cacheControl).toContain("max-age");
  });
});