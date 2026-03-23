import { monogs } from "../../database/connection.js";
import { arabicToBuckwalter } from "../../utils/arabicToBuckwalter.js";
import { buckwalterToArabic } from "../../utils/buckwalterToArabic.js";
import {
  TokenDocument,
  TokenFilter,
} from "../../validators/search.validator.js";

let cachedLemmas: string[] | null = null;

export async function getLemmas() {
  if (cachedLemmas) return cachedLemmas;
  const lemmas = await monogs
    .collection<TokenDocument>("tokens")
    .distinct("LEM");
  cachedLemmas = lemmas
    .filter(Boolean)
    .map((lem) => buckwalterToArabic(lem as string));
  return cachedLemmas;
}

export async function searchTokens(filter: TokenFilter) {
  const mongoFilter: any = {};

  if (filter.surah !== undefined) mongoFilter.surah = filter.surah;
  if (filter.ayah !== undefined) mongoFilter.ayah = filter.ayah;
  if (filter.word !== undefined) mongoFilter.word = filter.word;
  if (filter.segment !== undefined) mongoFilter.segment = filter.segment;

  if (filter.form)
    mongoFilter.form = {
      $regex: arabicToBuckwalter(filter.form),
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
