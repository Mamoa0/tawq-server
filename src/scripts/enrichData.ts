import mongoose from "mongoose";
import { Verse, Surah, Token, Word } from "../database/models/index.js";
import { getAyahMeta } from "quran-meta/hafs";
import { quran } from "quran-meta";

// ================================================================
// 2. Sajda ayahs (only 15 in entire Quran — hardcoded, never changes)
// ================================================================
const SAJDA_AYAHS = new Set([
  "7:206", "13:15", "16:50", "17:109", "19:58",
  "22:18", "22:77", "25:60", "27:26", "32:15",
  "38:24", "41:38", "53:62", "84:21", "96:19",
]);

function isSajda(surah: number, ayah: number) {
  return SAJDA_AYAHS.has(`${surah}:${ayah}`);
}

// ================================================================
// 3. Models imported from database/models
// ================================================================


// ================================================================
// 4. Enrich Verses — add juz, hizb, rub, manzil, sajda, next, prev
// ================================================================
export async function enrichVerses() {
  console.log("📖 Enriching verses...\n");

  const verses: any[] = await Verse.find().sort({ surah: 1, ayah: 1 }).lean();
  console.log(`🔍 ${verses.length} verses to enrich\n`);

  let updated = 0;
  let failed = 0;

  // Build absolute ayah ID lookup
  // quran-meta uses absolute ayah index (1-6236)
  const surahsData = await Surah.find().sort({ number: 1 }).lean();
  const surahStarts: Record<number, number> = {};
  let cumulative = 1;
  for (const s of surahsData) {
    surahStarts[s.number] = cumulative;
    cumulative += s.verses_count;
  }

  for (const verse of verses) {
    try {
      const absId = surahStarts[verse.surah] + verse.ayah - 1;
      const meta = getAyahMeta(absId);

      // Get next/prev from quran-meta
      const nextAyah = quran.nextAyah(verse.surah, verse.ayah);
      const prevAyah = quran.prevAyah(verse.surah, verse.ayah);

      await Verse.findOneAndUpdate(
        { surah: verse.surah, ayah: verse.ayah },
        {
          $set: {
            juz: meta.juz,
            hizb: meta.hizbId,
            rub: meta.rubAlHizbId,
            manzil: (meta as any).manzil,
            sajda: isSajda(verse.surah, verse.ayah),
            next: nextAyah ? { surah: nextAyah[0], ayah: nextAyah[1] } : null,
            prev: prevAyah ? { surah: prevAyah[0], ayah: prevAyah[1] } : null,
          },
        }
      );

      updated++;
      if (updated % 100 === 0) {
        process.stdout.write(`\r✅ ${updated}/${verses.length} verses enriched`);
      }
    } catch (err: any) {
      failed++;
      console.error(`\n⚠️  ${verse.surah}:${verse.ayah} — ${err.message}`);
    }
  }

  process.stdout.write(`\r✅ ${updated}/${verses.length} verses enriched`);
  console.log(`\n\n🎉 Verses enriched!`);
  console.log(`   Updated : ${updated}`);
  console.log(`   Failed  : ${failed}\n`);
}

// ================================================================
// 5. Enrich Surahs — add words_count, roots_count, top_roots
// ================================================================
export async function enrichSurahs() {
  console.log("📚 Enriching surahs...\n");

  const surahs: any[] = await Surah.find().sort({ number: 1 }).lean();
  console.log(`🔍 ${surahs.length} surahs to enrich\n`);

  let updated = 0;

  for (const surah of surahs) {
    // Words count
    const words_count = await Word.countDocuments({ surah: surah.number });

    // Roots count (unique roots in this surah)
    const uniqueRoots = await Token.distinct("ROOT", {
      surah: surah.number,
      ROOT: { $nin: [null, ""] },
    });

    // Top 10 most frequent roots in this surah
    const topRoots = await Token.aggregate([
      {
        $match: {
          surah: surah.number,
          ROOT: { $nin: [null, ""] },
        },
      },
      { $group: { _id: "$ROOT", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      { $project: { root: "$_id", count: 1, _id: 0 } },
    ]);

    await Surah.findOneAndUpdate(
      { number: surah.number },
      {
        $set: {
          words_count,
          roots_count: uniqueRoots.length,
          top_roots: topRoots,
        },
      }
    );

    updated++;
    process.stdout.write(
      `\r✅ ${updated}/${surahs.length} | Surah ${surah.number} — ${words_count} words, ${uniqueRoots.length} roots`
    );
  }

  console.log(`\n\n🎉 Surahs enriched! Updated: ${updated}\n`);
}


