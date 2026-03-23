import { Root, Token } from "../database/models/index.js";
import { getPhoneticGroup } from "./helpers.js";

export async function seedRoots() {
  console.log("🌱 Starting Root seed...\n");

  if (process.argv.includes("--force")) {
    console.log("⚠️  Force flag detected. Dropping existing roots...");
    await Root.deleteMany({});
  }

  const count = await Root.countDocuments();
  if (count > 0) {
    console.log(
      `⚠️  Roots already seeded (${count} docs). Use --force to overwrite. Skipping.\n`,
    );
    return;
  }

  console.log("📊 Step 1/3 — Aggregating stats from tokens collection...");

  // Single aggregation query to calculate all stats per root
  const stats = await Token.aggregate([
    {
      // Only process tokens that have a ROOT field
      $match: { ROOT: { $exists: true, $nin: [null, ""] } },
    },
    {
      $group: {
        _id: "$ROOT",
        count: { $sum: 1 }, // total occurrences
        lemmas: { $addToSet: "$LEM" }, // unique lemmas
        forms: { $addToSet: "$form" }, // unique word forms
        surahs: { $addToSet: "$surah" }, // unique surahs
      },
    },
    {
      $project: {
        root: "$_id",
        count: 1,
        lemmas_count: { $size: "$lemmas" },
        words_count: { $size: "$forms" },
        surahs_count: { $size: "$surahs" },
      },
    },
    { $sort: { count: -1 } },
  ]);

  console.log(`✅ Found ${stats.length} unique roots\n`);

  console.log("🔤 Step 2/3 — Building phonetic groups...");

  // Group all roots by their phonetic group
  const groups: Record<string, string[]> = {};
  for (const s of stats as any[]) {
    const group = getPhoneticGroup(s.root);
    if (!groups[group]) groups[group] = [];
    groups[group].push(s.root);
  }

  // Log group summary
  for (const [group, groupRoots] of Object.entries(groups).sort()) {
    console.log(`   ${group.padEnd(12)} → ${groupRoots.length} roots`);
  }
  console.log();

  console.log("💾 Step 3/3 — Saving roots to MongoDB...");

  const docs = (stats as any[]).map((s, index) => {
    const group = getPhoneticGroup(s.root);

    // related_phonetic = other roots in same phonetic group (exclude self)
    const related = (groups[group] || [])
      .filter((r) => r !== s.root)
      .slice(0, 20); // limit to 20 related roots per doc

    return {
      root: s.root,
      phonetic_group: group,
      meaning: {
        short: "", // to be filled later
        description: "",
        arabic_short: "",
        arabic_description: "",
      },
      synonyms: [],
      related_phonetic: related,
      related_meaning: [],
      semantic_processed: false,
      order: index + 1, // 1 for most frequent, 2 for second most...
      count: s.count,
      lemmas_count: s.lemmas_count,
      words_count: s.words_count,
      surahs_count: s.surahs_count,
    };
  });

  // Insert in batches
  const batchSize = 100;
  for (let i = 0; i < docs.length; i += batchSize) {
    await Root.insertMany(docs.slice(i, i + batchSize), { ordered: false });
    process.stdout.write(
      `\r   Saved ${Math.min(i + batchSize, docs.length)}/${docs.length} roots...`,
    );
  }

  console.log(`\n\n🎉 Root seed complete!`);
  console.log(`   Total roots    : ${docs.length}`);
  console.log(`   Phonetic groups: ${Object.keys(groups).length}`);
  console.log(
    `   Most common    : "${stats[0].root}" (${stats[0].count} occurrences)\n`,
  );
}
