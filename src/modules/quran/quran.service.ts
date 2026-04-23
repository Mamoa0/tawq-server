import { monogs } from "../../database/connection.js";
import { buckwalterToArabic } from "../../utils/buckwalterToArabic.js";
import { getSurahStats } from "../compare/compare.service.js";
import { SAJDA_LOCATIONS, sajdaTypeFor, type SajdaType } from "../../constants/sajda.map.js";

interface DefaultWordResponse {
  surah: number;
  ayah: number;
  word: number;
  arabic: string;
  transliteration?: string;
  translation?: string;
  tokens?: any[];
}

export async function getAllSurahs() {
  return await monogs.collection("surahs").find().sort({ number: 1 }).toArray();
}

export async function getSurahByNumber(number: number) {
  return await monogs.collection("surahs").findOne({ number });
}

export async function getVersesByPage(number: number, page: number) {
  return await monogs
    .collection("verses")
    .find({ surah: number, page })
    .sort({ ayah: 1 })
    .toArray();
}

export async function getAyahWithWords(surah: number, ayah: number) {
  const verse = await monogs.collection("verses").findOne({ surah, ayah });
  if (!verse) return null;

  const words = await monogs
    .collection("words")
    .find({ surah, ayah })
    .sort({ word: 1 })
    .toArray();

  return { verse: annotateSajda(verse as any), words };
}

export async function getWordDetails(
  surah: number,
  ayah: number,
  word: number,
) {
  const tokensPipeline: any[] = [
    { $match: { surah, ayah, word } },
    { $sort: { segment: 1 } },
    {
      $lookup: {
        from: "roots",
        localField: "ROOT",
        foreignField: "root",
        pipeline: [
          { $project: { _id: 1, root: 1, meaning: 1 } },
          {
            $lookup: {
              from: "rootmeanings",
              localField: "root",
              foreignField: "root",
              pipeline: [
                { $project: { _id: 1, source: 1, content: 1, extracted: 1, verified: 1, confidence: 1 } },
              ],
              as: "rootMeanings",
            },
          },
        ],
        as: "rootDetailsArr",
      },
    },
    {
      $addFields: {
        rootDetails: { $arrayElemAt: ["$rootDetailsArr", 0] },
      },
    },
    { $project: { rootDetailsArr: 0 } },
  ];

  const [wordDetails, tokens] = await Promise.all([
    monogs.collection("words").findOne({ surah, ayah, word }),
    monogs.collection("tokens").aggregate(tokensPipeline).toArray(),
  ]);

  if (!wordDetails) return null;

  return { ...(wordDetails as unknown as DefaultWordResponse), tokens };
}

export async function getVersesByJuz(juzNumber: number) {
  return await monogs
    .collection("verses")
    .find({ juz: juzNumber })
    .sort({ surah: 1, ayah: 1 })
    .toArray();
}

export async function getVersesByHizb(hizbNumber: number) {
  return await monogs
    .collection("verses")
    .find({ hizb: hizbNumber })
    .sort({ surah: 1, ayah: 1 })
    .toArray();
}

export async function getVersesBatch(refs: Array<{ surah: number; ayah: number }>) {
  const pipeline: any[] = [
    {
      $match: {
        $or: refs.map((ref) => ({ surah: ref.surah, ayah: ref.ayah })),
      },
    },
    { $sort: { surah: 1, ayah: 1 } },
  ];
  return await monogs.collection("verses").aggregate(pipeline).toArray();
}

export async function getVersesByPageOnly(page: number) {
  return await monogs
    .collection("verses")
    .find({ page })
    .sort({ surah: 1, ayah: 1 })
    .toArray();
}

export async function getAyahWithNavigation(surah: number, ayah: number) {
  const result = await getAyahWithWords(surah, ayah);
  if (!result) return null;
  return {
    ...result,
    navigation: {
      next: result.verse.next,
      prev: result.verse.prev,
    },
  };
}

export async function getSurahThemes(number: number) {
  return await monogs
    .collection("surahs")
    .findOne(
      { number },
      { projection: { number: 1, name_simple: 1, top_roots: 1 } },
    );
}

export async function getRandomVerse() {
  const [verse] = await monogs
    .collection("verses")
    .aggregate([{ $sample: { size: 1 } }])
    .toArray();
  return verse || null;
}

export async function getAyahAnalysis(surah: number, ayah: number) {
  const verse = await monogs.collection("verses").findOne({ surah, ayah }, { projection: { _id: 0 } });
  if (!verse) return null;

  const tokens = await monogs.collection("tokens")
    .find({ surah, ayah }, { projection: { _id: 0 } })
    .sort({ word: 1, segment: 1 })
    .toArray();

  const wordMap = new Map<number, any[]>();
  for (const t of tokens) {
    if (!wordMap.has(t.word)) wordMap.set(t.word, []);
    wordMap.get(t.word)!.push({
      form: buckwalterToArabic(t.form),
      POS: t.POS,
      tag: t.tag,
      root: t.ROOT ? buckwalterToArabic(t.ROOT) : null,
      lemma: t.LEM ? buckwalterToArabic(t.LEM) : null,
      NOM: t.NOM || false, ACC: t.ACC || false, GEN: t.GEN || false,
      PERF: t.PERF || false, IMPF: t.IMPF || false, IMPV: t.IMPV || false,
      ACT: t.ACT || false, PASS: t.PASS || false,
      M: t.M || false, F: t.F || false,
      MS: t.MS || false, MP: t.MP || false,
      FS: t.FS || false, FP: t.FP || false,
      MD: t.MD || false, FD: t.FD || false,
      PCPL: t.PCPL || false, INDEF: t.INDEF || false,
    });
  }

  const words = Array.from(wordMap.entries()).map(([wordIdx, segs]) => ({
    word: wordIdx,
    segments: segs,
  }));

  return { surah, ayah, translation: (verse as any).translation, words };
}

export async function getSurahWordFrequency(number: number, limit = 20) {
  const surah = await monogs.collection("surahs").findOne({ number });
  if (!surah) return null;

  const pipeline: any[] = [
    { $match: { surah: number, LEM: { $exists: true, $ne: null } } },
    { $group: { _id: "$LEM", count: { $sum: 1 }, forms: { $addToSet: "$form" } } },
    { $sort: { count: -1 } },
    { $limit: limit },
  ];

  const rows = await monogs.collection("tokens").aggregate(pipeline).toArray();
  return {
    surah: number,
    limit,
    frequencies: rows.map((r: any) => ({
      lemma: buckwalterToArabic(r._id),
      count: r.count,
      forms: (r.forms as string[]).filter(Boolean).map(buckwalterToArabic),
    })),
  };
}

export async function getSurahDetailedStats(number: number) {
  return await getSurahStats(number);
}

export async function getAyahRoots(surah: number, ayah: number) {
  const pipeline: any[] = [
    { $match: { surah, ayah, ROOT: { $exists: true, $ne: null } } },
    { $group: { _id: "$ROOT", count: { $sum: 1 }, lemmas: { $addToSet: "$LEM" } } },
    { $sort: { count: -1 } },
  ];

  const rows = await monogs.collection("tokens").aggregate(pipeline).toArray();

  return {
    surah,
    ayah,
    roots: rows.map((r: any) => ({
      root: buckwalterToArabic(r._id),
      count: r.count,
      lemmas: (r.lemmas as string[]).filter(Boolean).map(buckwalterToArabic),
    })),
  };
}

export async function getSurahsByRevelationOrder() {
  return await monogs.collection("surahs").find({}, { projection: { _id: 0 } }).sort({ revelation_order: 1 }).toArray();
}

export async function getSurahsByPlace(place: "makkah" | "madinah") {
  return await monogs
    .collection("surahs")
    .find({ revelation_place: place }, { projection: { _id: 0 } })
    .sort({ revelation_order: 1 })
    .toArray();
}

export async function getVersesOfTheDay() {
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) /
      86400000,
  );
  const pageNumber = (dayOfYear % 604) + 1;
  return await getVersesByPageOnly(pageNumber);
}

/**
 * Annotate a verse (or verse-like object with surah+ayah) with
 * `isSajda` / `sajdaType` derived from the canonical sajda location
 * table. This keeps the classification authoritative and consistent
 * across responses regardless of what ended up in the `sajda` column
 * during seeding.
 */
export function annotateSajda<T extends { surah: number; ayah: number }>(
  verse: T,
): T & { isSajda: boolean; sajdaType: SajdaType | null } {
  const type = sajdaTypeFor(verse.surah, verse.ayah);
  return { ...verse, isSajda: type !== null, sajdaType: type };
}

/**
 * Return every sajda verse with its Arabic text and classification.
 * The canonical list is baked into constants; we look up the Arabic
 * text from the verses collection in one batched query.
 */
export async function getSajdaVerses() {
  const refs = SAJDA_LOCATIONS.map((l) => ({ surah: l.surah, ayah: l.ayah }));
  const verses = await monogs
    .collection("verses")
    .find(
      { $or: refs },
      { projection: { _id: 0, surah: 1, ayah: 1, arabic: 1, translation: 1, page: 1, juz: 1 } },
    )
    .toArray();

  const byKey = new Map<string, any>();
  for (const v of verses) byKey.set(`${v.surah}:${v.ayah}`, v);

  // Preserve the canonical order from SAJDA_LOCATIONS so the response
  // is stable and clients can rely on sajda sequence.
  return SAJDA_LOCATIONS.map((l) => {
    const v = byKey.get(`${l.surah}:${l.ayah}`);
    return {
      surah: l.surah,
      ayah: l.ayah,
      type: l.type,
      isSajda: true,
      sajdaType: l.type,
      arabic: v?.arabic ?? null,
      translation: v?.translation ?? null,
      page: v?.page ?? null,
      juz: v?.juz ?? null,
    };
  });
}
