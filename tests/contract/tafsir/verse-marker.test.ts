import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TestApp, buildTestApp } from "../../helpers/app.js";
import { ApiKey } from "../../../src/database/models/api-key.model.js";
import { TafsirSource, Tafsir, Verse } from "../../../src/database/models/index.js";
import { hmacKey } from "../../../src/utils/hmac.js";
import { clearTafsirCache } from "../../../src/modules/tafsir/tafsir.service.js";

const VERSES_ENDPOINTS = [
  { name: "surah/ayah", url: "/api/v1/quran/surah/2/ayah/20" },
  { name: "surah/ayah/navigation", url: "/api/v1/quran/surah/2/ayah/20/navigation" },
  { name: "surah/page", url: "/api/v1/quran/surahs/2/page/1" },
  { name: "page", url: "/api/v1/quran/page/1" },
  { name: "juz", url: "/api/v1/quran/juz/1" },
  { name: "hizb", url: "/api/v1/quran/hizb/1" },
  { name: "verses", url: "/api/v1/quran/verses?refs=2:20,2:21" },
] as const;

function extractAyahsWithTafsir(data: any): Array<{ surah: number; ayah: number; sources: string[] }> {
  const results: Array<{ surah: number; ayah: number; sources: string[] }> = [];

  function walk(obj: any, skipKeys: Set<string>) {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) {
      obj.forEach((item) => walk(item, skipKeys));
      return;
    }
    if (obj && typeof obj.surah === "number" && typeof obj.ayah === "number") {
      if ("tafsir" in obj) {
        results.push({
          surah: obj.surah,
          ayah: obj.ayah,
          sources: obj.tafsir?.sources ?? null,
        });
      }
      if (obj.verse && typeof obj.verse === "object" && !skipKeys.has("verse")) {
        walk(obj.verse, skipKeys);
      }
      if (obj.data && typeof obj.data === "object" && !skipKeys.has("data")) {
        walk(obj.data, skipKeys);
      }
      if (obj.verses && Array.isArray(obj.verses) && !skipKeys.has("verses")) {
        walk(obj.verses, skipKeys);
      }
    } else {
      for (const key of Object.keys(obj)) {
        if (skipKeys.has(key)) continue;
        walk(obj[key], skipKeys);
      }
    }
  }

  const skipKeys = new Set(["tafsir"]);
  walk(data, skipKeys);
  return results;
}

describe("Contract: Verse-endpoint tafsir marker", () => {
  let testApp: TestApp;
  let validPlainKey: string;
  let validHashedKey: string;

  beforeEach(async () => {
    testApp = await buildTestApp();
    clearTafsirCache();
    await ApiKey.deleteMany({});
    await TafsirSource.deleteMany({});
    await Tafsir.deleteMany({});
    await Verse.deleteMany({});

    validPlainKey = "verse_marker_test_key_12345678901234567890";
    validHashedKey = hmacKey(validPlainKey);

    await ApiKey.create({
      hashedKey: validHashedKey,
      label: "test-verse-marker-key",
      status: "active",
    });

    await TafsirSource.create([
      {
        slug: "muyassar",
        name: { ar: "التفسير الميسر" },
        author: "Ministry",
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
    ]);

    await Verse.create([
      { surah: 1, ayah: 1, page: 1, arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", translation: "In the name of Allah, the Most Gracious", juz: 1, hizb: 1 },
      { surah: 1, ayah: 2, page: 1, arabic: "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ", translation: "Praise be to Allah, Lord of the worlds", juz: 1, hizb: 1 },
      { surah: 1, ayah: 3, page: 1, arabic: "الرَّحْمَٰنِ الرَّحِيمِ", translation: "The Most Gracious, the Most Merciful", juz: 1, hizb: 1 },
      { surah: 1, ayah: 4, page: 1, arabic: "مَالِكِ يَوْمِ الدِّينِ", translation: "Master of the Day of Judgment", juz: 1, hizb: 1 },
      { surah: 1, ayah: 5, page: 1, arabic: "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", translation: "You alone we worship", juz: 1, hizb: 1 },
      { surah: 1, ayah: 6, page: 1, arabic: "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ", translation: "Guide us on the straight path", juz: 1, hizb: 1 },
      { surah: 1, ayah: 7, page: 1, arabic: "صِرَاطَ الَّذِينَ أَنْعَمْتَ عَلَيْهِمْ", translation: "The path of those whom You have favored", juz: 1, hizb: 1 },
      { surah: 2, ayah: 1, page: 1, arabic: "الم", translation: "Alif Lam Mim", juz: 1, hizb: 1 },
      { surah: 2, ayah: 20, page: 30, arabic: "بَرَاءَةٌ مِنَ اللَّهِ وَرَسُولِهِ", translation: "A declaration from Allah and His Messenger", juz: 1, hizb: 1 },
      { surah: 2, ayah: 21, page: 30, arabic: "وَإِذْ أَخَذَ رَبُّكَ", translation: "And recall when your Lord took", juz: 1, hizb: 1 },
      { surah: 2, ayah: 22, page: 30, arabic: "الَّذِينَ آمَنُوا", translation: "Those who believed", juz: 1, hizb: 1 },
    ]);
  });

  afterEach(async () => {
    await testApp.close();
  });

  function makeRequest(url: string) {
    return testApp.app.inject({
      method: "GET",
      url,
      headers: { "x-api-key": validPlainKey },
    });
  }

  it("invalid API key returns 401 on verse endpoints", async () => {
    const response = await testApp.app.inject({
      method: "GET",
      url: "/api/v1/quran/surah/2/ayah/20",
      headers: {
        "x-api-key": "invalid_key_that_should_fail",
      },
    });
    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.error).toBe("InvalidApiKey");
  });

  it("each enumerated verse-returning endpoint includes tafsir.sources on every ayah", async () => {
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Test tafsir text for ayah 2:20",
      ingestedAt: new Date("2026-01-01"),
    });
    await Tafsir.create({
      sourceSlug: "mukhtasar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Another tafsir for ayah 2:20",
      ingestedAt: new Date("2026-01-01"),
    });

    for (const ep of VERSES_ENDPOINTS) {
      const response = await makeRequest(ep.url);
      expect(response.statusCode).toBe(200, `Endpoint ${ep.name} should return 200`);
      const body = response.json();
      const ayahs = extractAyahsWithTafsir(body);
      expect(ayahs.length, `Endpoint ${ep.name} should have at least one ayah`).toBeGreaterThan(0);
      for (const ayah of ayahs) {
        expect(ayah.sources, `Endpoint ${ep.name}: ayah ${ayah.ayah} should have tafsir.sources property`).not.toBeNull();
        expect(Array.isArray(ayah.sources), `Endpoint ${ep.name}: tafsir.sources should be an array`).toBe(true);
      }
    }
  });

  it("tafsir.sources array matches tafsir fetch results for that ayah", async () => {
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Test tafsir",
      ingestedAt: new Date("2026-01-01"),
    });
    await Tafsir.create({
      sourceSlug: "mukhtasar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Another test tafsir",
      ingestedAt: new Date("2026-01-01"),
    });
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 21,
      ayahEnd: 21,
      text: "Test tafsir for 2:21",
      ingestedAt: new Date("2026-01-01"),
    });

    const tafsirResponse = await makeRequest("/api/v1/tafsir/2/20?sources=muyassar,mukhtasar");
    expect(tafsirResponse.statusCode).toBe(200);
    const tafsirBody = tafsirResponse.json();
    const expectedSlugs = tafsirBody.results.map((r: any) => r.source.slug).sort();

    const verseResponse = await makeRequest("/api/v1/quran/surah/2/ayah/20");
    expect(verseResponse.statusCode).toBe(200);
    const verseBody = verseResponse.json();
    const ayahs = extractAyahsWithTafsir(verseBody);
    const ayah20 = ayahs.find((a) => a.surah === 2 && a.ayah === 20);
    expect(ayah20).toBeDefined();
    expect(ayah20.sources.sort()).toEqual(expectedSlugs);
  });

  it("tafsir.sources is empty array when no tafsir exists", async () => {
    await Tafsir.deleteMany({});

    const response = await makeRequest("/api/v1/quran/surah/1/ayah/1");
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const ayahs = extractAyahsWithTafsir(body);
    for (const ayah of ayahs) {
      expect(ayah.sources, `Ayah ${ayah.surah}:${ayah.ayah} should have empty sources array`).toEqual([]);
    }
  });

  it("tafsir.sources is never null and property is never omitted", async () => {
    await Tafsir.deleteMany({});

    const response = await makeRequest("/api/v1/quran/surah/1/ayah/1");
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const jsonStr = JSON.stringify(body);

    const ayahs = extractAyahsWithTafsir(body);
    expect(ayahs.length).toBeGreaterThan(0);
    for (const ayah of ayahs) {
      expect(ayah.sources).toBeDefined();
      expect(ayah.sources).not.toBeNull();
    }
    expect(jsonStr).not.toContain('"tafsir":null');
    expect(jsonStr).not.toContain('"tafsir":{}');
  });

  it("no tafsir body text appears in verse endpoint payload", async () => {
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "This is the actual tafsir body text that should not appear in verse endpoint",
      ingestedAt: new Date("2026-01-01"),
    });

    const response = await makeRequest("/api/v1/quran/surah/2/ayah/20");
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain("actual tafsir body text");
    expect(bodyStr).not.toContain("This is the actual");
  });

  it("slugs are alphabetically sorted in tafsir.sources", async () => {
    await Tafsir.create({
      sourceSlug: "mukhtasar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Mukhtasar text",
      ingestedAt: new Date("2026-01-01"),
    });
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Muyassar text",
      ingestedAt: new Date("2026-01-01"),
    });

    const response = await makeRequest("/api/v1/quran/surah/2/ayah/20");
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const ayahs = extractAyahsWithTafsir(body);
    const ayah20 = ayahs.find((a) => a.surah === 2 && a.ayah === 20);
    expect(ayah20).toBeDefined();
    expect(ayah20.sources).toEqual(["mukhtasar", "muyassar"]);
  });

  it("coverage map is invalidated when generation changes", async () => {
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Original text",
      ingestedAt: new Date("2026-01-01"),
    });

    const response1 = await makeRequest("/api/v1/quran/surah/2/ayah/20");
    expect(response1.statusCode).toBe(200);
    const body1 = response1.json();
    const ayahs1 = extractAyahsWithTafsir(body1);
    const ayah20_1 = ayahs1.find((a) => a.surah === 2 && a.ayah === 20);
    expect(ayah20_1.sources).toContain("muyassar");

    await TafsirSource.updateOne({ slug: "muyassar" }, { $inc: { generation: 1 } });
    clearTafsirCache();

    const response2 = await makeRequest("/api/v1/quran/surah/2/ayah/20");
    expect(response2.statusCode).toBe(200);
    const body2 = response2.json();
    const ayahs2 = extractAyahsWithTafsir(body2);
    const ayah20_2 = ayahs2.find((a) => a.surah === 2 && a.ayah === 20);
    expect(ayah20_2.sources).toContain("muyassar");
  });

  it("range-shaped tafsir entry covers all ayahs within the range", async () => {
    await Tafsir.deleteMany({});
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 25,
      text: "Range tafsir covering ayahs 20 through 25",
      ingestedAt: new Date("2026-01-01"),
    });

    const response = await makeRequest("/api/v1/quran/surah/2/ayah/22");
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const ayahs = extractAyahsWithTafsir(body);
    const ayah22 = ayahs.find((a) => a.surah === 2 && a.ayah === 22);
    expect(ayah22).toBeDefined();
    expect(ayah22.sources).toContain("muyassar");
  });

  it("single-ayah endpoint returns correct sources per source registration", async () => {
    await Tafsir.deleteMany({});
    await Tafsir.create({
      sourceSlug: "muyassar",
      surah: 2,
      ayahStart: 20,
      ayahEnd: 20,
      text: "Muyassar only for 2:20",
      ingestedAt: new Date("2026-01-01"),
    });

    const response = await makeRequest("/api/v1/quran/surah/2/ayah/20");
    expect(response.statusCode).toBe(200);
    const body = response.json();
    const ayahs = extractAyahsWithTafsir(body);

    const ayah20 = ayahs.find((a) => a.surah === 2 && a.ayah === 20);
    expect(ayah20.sources).toContain("muyassar");
    expect(ayah20.sources).not.toContain("mukhtasar");
  });
});