import { monogs } from "../../database/connection.js";
import { buckwalterToArabic } from "../../utils/buckwalterToArabic.js";
import { arabicToBuckwalter } from "../../utils/arabicToBuckwalter.js";
import { TokenDocument } from "../../validators/search.validator.js";
import { RootDocument } from "./roots.model.js";

let cachedRoots: string[] | null = null;

export async function getRoots() {
  if (cachedRoots) return cachedRoots;

  const roots = await monogs
    .collection<RootDocument>("roots")
    .find({}, { projection: { root: 1 }, sort: { order: 1 } })
    .toArray();

  if (roots.length > 0) {
    cachedRoots = roots.map((r) => buckwalterToArabic(r.root));
  } else {
    const distinctRoots = await monogs
      .collection<TokenDocument>("tokens")
      .distinct("ROOT");
    cachedRoots = distinctRoots
      .filter(Boolean)
      .map((root) => buckwalterToArabic(root as string));
  }

  return cachedRoots;
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
