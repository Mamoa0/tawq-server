import { Root, Token } from "../database/models/index.js";

// ================================================================
// 1. Config
// ================================================================
const MIN_CO_OCCURRENCE = 3;  // minimum times 2 roots must appear together
const MAX_RELATED = 10;       // max co-occurring roots to save per root (before AI filter)

// ================================================================
// 2. Main Export
// ================================================================
export async function runCoOccurrence() {
  // Get all unprocessed roots
  const roots = await Root.find({ co_occurrence_processed: { $ne: true } })
    .sort({ count: -1 }) // start with most frequent
    .select("root")
    .lean();

  console.log(`🔍 Processing co-occurrence for ${roots.length} roots...\n`);

  let processed = 0;

  for (const rootDoc of roots) {
    try {
      // ── Step 1: Find all verses containing this root ──────────
      const verses = await Token.aggregate([
        { $match: { ROOT: rootDoc.root } },
        {
          $group: {
            _id: { surah: "$surah", ayah: "$ayah" }, // unique verse
          },
        },
      ]);

      if (verses.length === 0) {
        await Root.findOneAndUpdate(
          { root: rootDoc.root },
          { $set: { co_occurring: [], co_occurrence_processed: true } }
        );
        processed++;
        continue;
      }

      // Extract verse keys
      const verseKeys = verses.map((v) => ({
        surah: v._id.surah,
        ayah: v._id.ayah,
      }));

      // ── Step 2: Find all OTHER roots in those same verses ─────
      const coRoots = await Token.aggregate([
        {
          // Match tokens in the same verses
          $match: {
            $or: verseKeys.map((v) => ({ surah: v.surah, ayah: v.ayah })),
            ROOT: {
              $exists: true,
              $nin: [null, "", rootDoc.root],
            },
          },
        },
        {
          // Group by verse + root to count unique verse appearances
          $group: {
            _id: {
              surah: "$surah",
              ayah: "$ayah",
              root: "$ROOT",
            },
          },
        },
        {
          // Now count how many verses each co-root appears in
          $group: {
            _id: "$_id.root",
            count: { $sum: 1 },
          },
        },
        {
          // Only keep roots that appear together enough times
          $match: { count: { $gte: MIN_CO_OCCURRENCE } },
        },
        { $sort: { count: -1 } },
        { $limit: MAX_RELATED },
      ]);

      // ── Step 3: Save co-occurring roots ───────────────────────
      const coOccurring = coRoots.map((r: any) => ({
        root: r._id,
        count: r.count,
      }));

      await Root.findOneAndUpdate(
        { root: rootDoc.root },
        {
          $set: {
            co_occurring: coOccurring,
            co_occurrence_processed: true,
          },
        }
      );

      processed++;
      process.stdout.write(
        `\r✅ ${processed}/${roots.length} | "${rootDoc.root}" → ${coOccurring.length} co-roots (top: ${coOccurring[0]?.root || "none"} x${coOccurring[0]?.count || 0})`
      );
    } catch (err: any) {
      console.error(`\n❌ Failed on "${rootDoc.root}": ${err.message}`);
    }
  }

  console.log(`\n\n🎉 Co-occurrence analysis complete!`);
  console.log(`   Processed: ${processed} roots\n`);

  // Show sample
  const sample = await Root.find({ co_occurrence_processed: true })
    .sort({ count: -1 })
    .limit(5)
    .select("root co_occurring")
    .lean();

  console.log("📊 Sample results:");
  for (const r of sample) {
    const top3 = r.co_occurring
      .slice(0, 3)
      .map((c: any) => `${c.root}(${c.count})`)
      .join(", ");
    console.log(`   ${r.root.padEnd(10)} → ${top3}`);
  }
}
