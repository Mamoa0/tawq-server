import { Surah as SurahModel } from "../../database/models/surah.model.js";
import { Root as RootModel } from "../../database/models/root.model.js";
import { Token as TokenModel } from "../../database/models/token.model.js";
import { arabicToBuckwalter } from "../../utils/arabicToBuckwalter.js";
import { buckwalterToArabic } from "../../utils/buckwalterToArabic.js";

export async function getSurahStats(surahNumber: number) {
  const surah = await SurahModel.findOne({ number: surahNumber }).lean();
  if (!surah) return null;

  const pipeline: any[] = [
    { $match: { surah: surahNumber } },
    {
      $facet: {
        rootStats: [
          { $match: { ROOT: { $exists: true, $ne: null } } },
          { $group: { _id: "$ROOT", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        posStats: [
          { $match: { POS: { $exists: true, $ne: null } } },
          { $group: { _id: "$POS", count: { $sum: 1 } } },
        ],
        verbStats: [
          { $group: {
            _id: null,
            PERF: { $sum: { $cond: ["$PERF", 1, 0] } },
            IMPF: { $sum: { $cond: ["$IMPF", 1, 0] } },
            IMPV: { $sum: { $cond: ["$IMPV", 1, 0] } },
            totalTokens: { $sum: 1 },
          }},
        ],
        uniqueWords: [
          { $group: { _id: { surah: "$surah", ayah: "$ayah", word: "$word" } } },
          { $count: "count" },
        ],
        uniqueSegments: [
          { $group: { _id: "$form" } },
          { $count: "count" },
        ],
      },
    },
  ];

  const [result] = await TokenModel.aggregate(pipeline);

  const rootStats = result.rootStats || [];
  const posStats = result.posStats || [];
  const verbStats = result.verbStats[0] || { PERF: 0, IMPF: 0, IMPV: 0, totalTokens: 0 };
  const uniqueWordsData = result.uniqueWords[0] || { count: 0 };
  const uniqueSegmentsData = result.uniqueSegments[0] || { count: 0 };

  const rootsArray = rootStats
    .map((r: any) => ({ root: buckwalterToArabic(r._id), count: r.count }))
    .sort((a: any, b: any) => b.count - a.count);

  const totalRoots = rootStats.length;
  const top10Roots = rootsArray.slice(0, 10);

  const totalPos = posStats.reduce((sum: number, p: any) => sum + p.count, 0);
  const posDist: Record<string, string> = {};
  for (const pos of posStats) {
    posDist[pos._id] = ((pos.count / totalPos) * 100).toFixed(2) + "%";
  }

  const totalVerbs = verbStats.PERF + verbStats.IMPF + verbStats.IMPV;
  const verbTenses = {
    PERF: totalVerbs ? ((verbStats.PERF / totalVerbs) * 100).toFixed(2) + "%" : "0%",
    IMPF: totalVerbs ? ((verbStats.IMPF / totalVerbs) * 100).toFixed(2) + "%" : "0%",
    IMPV: totalVerbs ? ((verbStats.IMPV / totalVerbs) * 100).toFixed(2) + "%" : "0%",
  };

  const totalWords = uniqueWordsData.count;
  const s = surah as any;
  const avgWordsPerAyah = totalWords / (s.verses_count as number);
  const repetitionRate = (verbStats.totalTokens - uniqueSegmentsData.count) / verbStats.totalTokens;

  return {
    general: {
      ...surah,
      page_count: (s.pages?.end || 0) - (s.pages?.start || 0) + 1,
    },
    deepInfo: {
      rootsArray,
      top10Roots,
      totalRoots,
      posDist,
      verbTenses,
      totalWords,
      avgWordsPerAyah,
      repetitionRate,
      coreTheme: rootsArray[0] || { root: "", count: 0 },
    },
  };
}

export async function getRootStats(rootStr: string) {
  const rootBw = arabicToBuckwalter(rootStr);
  const root = await RootModel.findOne({ root: rootBw }).lean();
  if (!root) return null;

  const pipeline: any[] = [
    { $match: { ROOT: rootBw } },
    {
      $facet: {
        surahStats: [
          { $group: { _id: "$surah" } },
          { $sort: { _id: 1 } },
        ],
        posStats: [
          { $group: { _id: "$POS" } },
        ],
        lemmaStats: [
          { $match: { LEM: { $exists: true, $ne: null } } },
          { $group: { _id: "$LEM" } },
        ],
      },
    },
  ];

  const [result] = await TokenModel.aggregate(pipeline);

  const surahs = (result.surahStats || []).map((s: any) => s._id).filter((s: any) => s != null);
  const posSet = (result.posStats || []).map((p: any) => p._id).filter((p: any) => p != null);
  const lemmas = (result.lemmaStats || []).map((l: any) => buckwalterToArabic(l._id));

  return {
    general: root as any,
    rootBw,
    deepInfo: { surahs, posSet, lemmas },
  };
}

export async function getCoOccurrenceVerses(
  rootBwA: string,
  rootBwB: string,
): Promise<Array<{ surah: number; ayah: number }>> {
  const pipeline: any[] = [
    { $match: { ROOT: { $in: [rootBwA, rootBwB] } } },
    { $group: { _id: { surah: "$surah", ayah: "$ayah" }, roots: { $addToSet: "$ROOT" } } },
    { $match: { roots: { $all: [rootBwA, rootBwB] } } },
    { $project: { _id: 0, surah: "$_id.surah", ayah: "$_id.ayah" } },
    { $sort: { surah: 1, ayah: 1 } },
  ];

  return await TokenModel.aggregate(pipeline).exec();
}
