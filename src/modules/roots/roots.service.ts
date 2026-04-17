import { monogs } from "../../database/connection.js";
import { buckwalterToArabic } from "../../utils/buckwalterToArabic.js";
import { arabicToBuckwalter } from "../../utils/arabicToBuckwalter.js";
import { TokenDocument } from "../../validators/search.validator.js";
import { RootDocument } from "./roots.model.js";

let cachedRoots: string[] | null = null;
let rootsCacheTimeout: NodeJS.Timeout | null = null;

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function clearRootsCache() {
  cachedRoots = null;
  if (rootsCacheTimeout) clearTimeout(rootsCacheTimeout);
  rootsCacheTimeout = null;
}

function setRootsCacheExpiry() {
  if (rootsCacheTimeout) clearTimeout(rootsCacheTimeout);
  rootsCacheTimeout = setTimeout(clearRootsCache, CACHE_TTL);
}

async function loadRootsCache(): Promise<string[]> {
  const roots = await monogs
    .collection<RootDocument>("roots")
    .find({}, { projection: { root: 1 } })
    .sort({ order: 1 })
    .toArray();

  if (roots.length > 0) {
    return roots.map((r) => buckwalterToArabic(r.root));
  }

  const distinctRoots = await monogs
    .collection<TokenDocument>("tokens")
    .distinct("ROOT");
  return distinctRoots
    .filter(Boolean)
    .map((root) => buckwalterToArabic(root as string));
}

export async function getRoots(page = 1, limit = 100) {
  if (!cachedRoots) {
    cachedRoots = await loadRootsCache();
    setRootsCacheExpiry();
  }

  const totalCount = cachedRoots.length;
  const totalPages = Math.ceil(totalCount / limit);
  const data = cachedRoots.slice((page - 1) * limit, page * limit);

  return { data, totalCount, page, limit, totalPages };
}

export async function getRoot(rootArg: string) {
  const rootBw = arabicToBuckwalter(rootArg);

  const rootMeta = await monogs
    .collection<RootDocument>("roots")
    .findOne({ root: rootBw });

  const detailsPipeline = [
    { $match: { ROOT: rootBw } },
    {
      $group: {
        _id: "$ROOT",
        lemmas: { $addToSet: "$LEM" },
        forms: { $addToSet: "$form" },
      },
    },
  ];

  const [details] = await monogs
    .collection<TokenDocument>("tokens")
    .aggregate(detailsPipeline)
    .toArray();

  if (!rootMeta && !details) return null;

  return {
    root: buckwalterToArabic(rootBw),
    order: rootMeta?.order,
    count: rootMeta?.count || details?.count || 0,
    meaning: rootMeta?.meaning,
    lemmas_count: rootMeta?.lemmas_count || details?.lemmas?.length || 0,
    words_count: rootMeta?.words_count || details?.forms?.length || 0,
    surahs_count: rootMeta?.surahs_count,
    related_phonetic: (rootMeta?.related_phonetic || [])
      .filter(Boolean)
      .map((r: string) => buckwalterToArabic(r)),
    related_meaning: (rootMeta?.related_meaning || [])
      .filter(Boolean)
      .map((r: string) => buckwalterToArabic(r)),
    lemmas: (details?.lemmas || [])
      .filter(Boolean)
      .map((l: string) => buckwalterToArabic(l)),
    forms: (details?.forms || [])
      .filter(Boolean)
      .map((f: string) => buckwalterToArabic(f)),
  };
}

export async function getRootOccurrences(rootArg: string) {
  const rootBw = arabicToBuckwalter(rootArg);

  const pipeline: any[] = [
    { $match: { ROOT: rootBw } },
    {
      $group: {
        _id: { surah: "$surah", ayah: "$ayah" },
      },
    },
    { $sort: { "_id.surah": 1, "_id.ayah": 1 } },
    {
      $project: {
        _id: 0,
        surah: "$_id.surah",
        ayah: "$_id.ayah",
      },
    },
  ];

  const occurrences = await monogs
    .collection<TokenDocument>("tokens")
    .aggregate(pipeline)
    .toArray();

  return {
    root: buckwalterToArabic(rootBw),
    count: occurrences.length,
    occurrences,
  };
}

export async function getRootCoOccurrence(rootArg: string) {
  const rootBw = arabicToBuckwalter(rootArg);

  const rootData = await monogs
    .collection<any>("roots")
    .findOne({ root: rootBw }, { projection: { co_occurring: 1 } });

  if (!rootData) return null;

  const coOccurring = (rootData.co_occurring || []).map((item: any) => ({
    root: buckwalterToArabic(item.root),
    count: item.count,
  }));

  return {
    root: buckwalterToArabic(rootBw),
    co_occurring: coOccurring,
  };
}
