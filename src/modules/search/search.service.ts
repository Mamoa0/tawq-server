import { monogs } from "../../database/connection.js";
import { arabicToBuckwalter } from "../../utils/arabicToBuckwalter.js";
import { buckwalterToArabic } from "../../utils/buckwalterToArabic.js";
import {
  TokenDocument,
  TokenFilter,
  MorphologyFilter,
  PhraseSearch,
} from "../../validators/search.validator.js";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let cachedLemmas: string[] | null = null;
let lemmasCacheTimeout: NodeJS.Timeout | null = null;

const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function clearLemmasCache() {
  cachedLemmas = null;
  if (lemmasCacheTimeout) clearTimeout(lemmasCacheTimeout);
  lemmasCacheTimeout = null;
}

function setLemmasCacheExpiry() {
  if (lemmasCacheTimeout) clearTimeout(lemmasCacheTimeout);
  lemmasCacheTimeout = setTimeout(clearLemmasCache, CACHE_TTL);
}

async function loadLemmasCache(): Promise<string[]> {
  const lemmas = await monogs.collection<TokenDocument>("tokens").distinct("LEM");
  return lemmas.filter(Boolean).map((lem) => buckwalterToArabic(lem as string));
}

export async function getLemmas(page = 1, limit = 100) {
  if (!cachedLemmas) {
    cachedLemmas = await loadLemmasCache();
    setLemmasCacheExpiry();
  }

  const totalCount = cachedLemmas.length;
  const totalPages = Math.ceil(totalCount / limit);
  const data = cachedLemmas.slice((page - 1) * limit, page * limit);

  return { data, totalCount, page, limit, totalPages };
}

export async function searchLemmasAutocomplete(query: string, limit = 20) {
  if (!query || query.length === 0) {
    if (!cachedLemmas) {
      cachedLemmas = await loadLemmasCache();
      setLemmasCacheExpiry();
    }
    return cachedLemmas.slice(0, limit);
  }

  const queryBw = arabicToBuckwalter(query);
  const pattern = new RegExp(`^${escapeRegex(queryBw)}`);

  const matches = await monogs
    .collection<TokenDocument>("tokens")
    .distinct("LEM", { LEM: { $regex: pattern } });

  return (matches as string[])
    .filter(Boolean)
    .map((lem) => buckwalterToArabic(lem))
    .slice(0, limit);
}

export async function searchPhrase(filter: PhraseSearch) {
  const match: any = { translation: { $regex: escapeRegex(filter.q), $options: "i" } };
  if (filter.surah !== undefined) match.surah = filter.surah;

  const { page, limit } = filter;
  const pipeline = [
    { $match: match },
    {
      $facet: {
        metadata: [{ $count: "totalCount" }],
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 0 } }],
      },
    },
  ];

  const [result] = await monogs.collection("verses").aggregate(pipeline).toArray();
  const totalCount = result.metadata[0]?.totalCount || 0;
  return { data: result.data, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
}

export async function searchMorphology(filter: MorphologyFilter) {
  const q: any = {};
  if (filter.surah !== undefined) q.surah = filter.surah;
  if (filter.ayah !== undefined) q.ayah = filter.ayah;
  if (filter.pos !== undefined) q.POS = filter.pos;
  if (filter.tense !== undefined) q[filter.tense] = true;
  if (filter.case !== undefined) q[filter.case] = true;
  if (filter.voice !== undefined) q[filter.voice] = true;
  if (filter.number !== undefined) q[filter.number] = true;
  if (filter.gender !== undefined) q[filter.gender] = true;
  if (filter.pcpl !== undefined) q.PCPL = filter.pcpl;

  const { page, limit } = filter;
  const pipeline = [
    { $match: q },
    {
      $facet: {
        metadata: [{ $count: "totalCount" }],
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 0 } }],
      },
    },
  ];

  const [result] = await monogs.collection<TokenDocument>("tokens").aggregate(pipeline).toArray();
  const totalCount = result.metadata[0]?.totalCount || 0;
  const data = result.data.map((t: any) => ({
    ...t,
    form: buckwalterToArabic(t.form),
    ROOT: t.ROOT ? buckwalterToArabic(t.ROOT) : undefined,
    LEM: t.LEM ? buckwalterToArabic(t.LEM) : undefined,
  }));
  return { data, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
}

export async function searchVerses(q: string, page = 1, limit = 20) {
  const filter = { translation: { $regex: escapeRegex(q), $options: "i" } };
  const pipeline = [
    { $match: filter },
    {
      $facet: {
        metadata: [{ $count: "totalCount" }],
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 0 } }],
      },
    },
  ];

  const [result] = await monogs.collection("verses").aggregate(pipeline).toArray();
  const totalCount = result.metadata[0]?.totalCount || 0;
  return { data: result.data, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
}

export async function getProperNouns(page = 1, limit = 50) {
  const pipeline = [
    { $match: { POS: "PN" } },
    {
      $group: {
        _id: "$LEM",
        count: { $sum: 1 },
        locations: { $addToSet: { surah: "$surah", ayah: "$ayah" } },
      },
    },
    { $sort: { count: -1 } },
    {
      $facet: {
        metadata: [{ $count: "totalCount" }],
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
      },
    },
  ];

  const [result] = await monogs.collection<TokenDocument>("tokens").aggregate(pipeline).toArray();
  const totalCount = result.metadata[0]?.totalCount || 0;
  const data = result.data.map((d: any) => ({
    lemma: buckwalterToArabic(d._id),
    count: d.count,
    locations: d.locations,
  }));

  return { data, totalCount, page, limit, totalPages: Math.ceil(totalCount / limit) };
}

export async function searchTokens(filter: TokenFilter) {
  const mongoFilter: any = {};

  if (filter.surah !== undefined) mongoFilter.surah = filter.surah;
  if (filter.ayah !== undefined) mongoFilter.ayah = filter.ayah;
  if (filter.word !== undefined) mongoFilter.word = filter.word;
  if (filter.segment !== undefined) mongoFilter.segment = filter.segment;

  if (filter.form)
    mongoFilter.form = {
      $regex: escapeRegex(arabicToBuckwalter(filter.form)),
      $options: "i",
    };
  if (filter.tag) mongoFilter.tag = filter.tag;
  if (filter.POS) mongoFilter.POS = filter.POS;
  if (filter.ROOT) mongoFilter.ROOT = arabicToBuckwalter(filter.ROOT);
  if (filter.LEM) mongoFilter.LEM = arabicToBuckwalter(filter.LEM);

  if (filter.STEM !== undefined) mongoFilter.STEM = filter.STEM;
  if (filter.GEN !== undefined) mongoFilter.GEN = filter.GEN;
  if (filter.ACC !== undefined) mongoFilter.ACC = filter.ACC;
  if (filter.INDEF !== undefined) mongoFilter.INDEF = filter.INDEF;
  if (filter.MP !== undefined) mongoFilter.MP = filter.MP;

  const page = filter.page || 1;
  const limit = filter.limit || 20;

  const pipeline = [
    { $match: mongoFilter },
    {
      $facet: {
        metadata: [{ $count: "totalCount" }],
        data: [
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $lookup: {
              from: "tokens",
              let: { surah: "$surah", ayah: "$ayah" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$surah", "$$surah"] },
                        { $eq: ["$ayah", "$$ayah"] },
                      ],
                    },
                  },
                },
                { $sort: { word: 1, segment: 1 } },
                {
                  $group: {
                    _id: "$word",
                    forms: { $push: "$form" },
                  },
                },
                { $sort: { _id: 1 } },
                {
                  $addFields: {
                    wordForm: {
                      $reduce: {
                        input: "$forms",
                        initialValue: "",
                        in: { $concat: ["$$value", "$$this"] },
                      },
                    },
                  },
                },
              ],
              as: "ayahWords",
            },
          },
          {
            $addFields: {
              fullAyah: {
                $reduce: {
                  input: "$ayahWords",
                  initialValue: "",
                  in: {
                    $cond: {
                      if: { $eq: ["$$value", ""] },
                      then: "$$this.wordForm",
                      else: { $concat: ["$$value", " ", "$$this.wordForm"] },
                    },
                  },
                },
              },
            },
          },
          {
            $project: {
              ayahWords: 0,
            },
          },
        ],
      },
    },
  ];

  const [result] = await monogs
    .collection<TokenDocument>("tokens")
    .aggregate(pipeline)
    .toArray();

  const totalCount = result.metadata[0]?.totalCount || 0;
  const tokens = result.data;

  const totalPages = Math.ceil(totalCount / limit);

  // Convert Buckwalter response → Arabic for the client
  const mappedData = tokens.map((token: any) => ({
    ...token,
    form: buckwalterToArabic(token.form),
    ROOT: token.ROOT ? buckwalterToArabic(token.ROOT) : undefined,
    LEM: token.LEM ? buckwalterToArabic(token.LEM) : undefined,
    fullAyah: token.fullAyah ? buckwalterToArabic(token.fullAyah) : undefined,
  }));

  return {
    data: mappedData,
    totalCount,
    page,
    limit,
    totalPages,
  };
}
