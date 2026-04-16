// seedRootMeanings.ts
// Fetches root meanings from tafsir.app for all roots in DB

import mongoose from "mongoose";
import "dotenv/config";
import { Root, RootMeaning } from "../database/models/index.js";
import { buckwalterToArabic } from "../utils/buckwalterToArabic.js";

// ================================================================
// 1. Config & Types
// ================================================================
const DELAY_MS = 500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Source {
  id: string;
  name: string;
  author: string;
  type: "api" | "pdf" | "manual";
}

const SOURCES: Record<string, Source> = {
  lisan: {
    id: "lisan",
    name: "لسان العرب",
    author: "ابن منظور",
    type: "api",
  },
  alsihah: {
    id: "alsihah",
    name: "الصحاح",
    author: "الجوهري",
    type: "api",
  },
  umdahAlhufadh: {
    id: "umdah-alhufadh",
    name: "عمدة الحفاظ",
    author: "السمين الحلبي",
    type: "api",
  },
  maqayees: {
    id: "maqayees",
    name: "معجم مقاييس اللغة",
    author: "ابن فارس",
    type: "api",
  },
};

// ================================================================
// 2. Root Variations Helper
// ================================================================
/**
 * Generates alternative Buckwalter representations for a root to handle
 * normalization issues (e.g., Alh vs >lh).
 */
function getRootVariations(root: string): string[] {
  const variations: string[] = [root];
  if (!root) return variations;

  const alifTypes = ["A", ">", "<", "|", "{", "'"];
  const first = root[0];

  // Try different Alif/Hamza types as the first letter
  if (alifTypes.includes(first)) {
    for (const type of alifTypes) {
      if (type !== first) {
        variations.push(type + root.slice(1));
      }
    }
  }

  // Handle Alif Maksura (Y) vs Ya (y) at the end
  const last = root[root.length - 1];
  if (last === "Y" || last === "y") {
    const other = last === "Y" ? "y" : "Y";
    const currentVariations = [...variations];
    for (const v of currentVariations) {
      variations.push(v.slice(0, -1) + other);
    }
  }

  return [...new Set(variations)];
}

// ================================================================
// 3. Fetch from API
// ================================================================
async function fetchFromAPI(sourceId: string, arabicRoot: string): Promise<string | null> {
  const encoded = encodeURIComponent(arabicRoot);
  const url = `https://tafsir.app/get_word.php?src=${sourceId}&w=${encoded}`;

  const res = await fetch(url, {
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const raw = await res.text();

  // Empty responses
  if (!raw || raw.trim() === "" || raw.trim() === "null") return null;

  // Try JSON parse
  try {
    const json = JSON.parse(raw);

    if (json && typeof json === "object") {
      // Handle common response shapes: { data: "..." }, { text: "..." }, etc.
      const content =
        json.data ?? json.text ?? json.content ?? json.result ?? null;

      if (!content || content === "") return null;
      return typeof content === "string" ? content : JSON.stringify(content);
    }

    return null;
  } catch {
    // Raw text response
    const text = raw.trim();
    return text.length > 5 ? text : null;
  }
}

// ================================================================
// ================================================================
// 4. Seed one source
// ================================================================
async function seedSource(sourceId: string) {
  const source = SOURCES[sourceId];
  if (!source) {
    console.error(`❌ Unknown source: "${sourceId}"`);
    console.log(`Available: ${Object.keys(SOURCES).join(", ")}`);
    return;
  }

  console.log(`\n📚 Source: ${source.name} (${sourceId})`);

  // Get all roots from DB
  const roots = await Root.find().select("root meaning").lean();

  console.log(`🔍 ${roots.length} roots to process...\n`);


  let saved = 0;
  let skipped = 0;
  let empty = 0;
  let failed = 0;
  const missingRoots: string[] = [];

  for (const rootDoc of roots) {
    try {
      // Skip already processed (resumable)
      const exists = await RootMeaning.exists({
        root: rootDoc.root,
        "source.id": sourceId,
      });

      if (exists) {
        skipped++;
        process.stdout.write(
          `\r✅ ${saved} saved | ⏭️  ${skipped} skipped | 📭 ${empty} empty | ❌ ${failed} failed`
        );
        continue;
      }

      // 1. Check if meaning already exists in Root document
      if (rootDoc.meaning?.arabic_short || rootDoc.meaning?.arabic_description) {
        skipped++;
        process.stdout.write(
          `\r✅ ${saved} saved | ⏭️  ${skipped} skipped | 📭 ${empty} empty | ❌ ${failed} failed`
        );
        continue;
      }

      // 2. Fetch from API with variations
      const variations = getRootVariations(rootDoc.root);
      let content: string | null = null;
      let searchedVariations = [];

      for (const v of variations) {
        const rootArabic = buckwalterToArabic(v);
        searchedVariations.push(rootArabic);
        content = await fetchFromAPI(sourceId, rootArabic);
        if (content) break;
        if (variations.length > 1) await sleep(100); // Small delay between variations
      }


      if (!content) {
        empty++;
        missingRoots.push(`${rootDoc.root} (empty)`);
        process.stdout.write(
          `\r✅ ${saved} saved | ⏭️  ${skipped} skipped | 📭 ${empty} empty | ❌ ${failed} failed`
        );
        await sleep(DELAY_MS);
        continue;
      }

      // Save to DB
      await RootMeaning.create({
        root: rootDoc.root,
        source: {
          id: source.id,
          name: source.name,
          author: source.author,
          type: source.type,
        },
        content,
        extracted: {
          arabic_short: "",
          synonyms: [],
          related_roots: [],
        },
        verified: false,
        confidence: 1.0,
      });

      saved++;
    } catch (err: any) {
      if (err.code === 11000) {
        skipped++; // duplicate key
      } else {
        failed++;
        missingRoots.push(`${rootDoc.root} (error: ${err.message})`);
        console.error(`\n⚠️  "${rootDoc.root}": ${err.message}`);
      }
    }

    process.stdout.write(
      `\r✅ ${saved} saved | ⏭️  ${skipped} skipped | 📭 ${empty} empty | ❌ ${failed} failed`
    );

    await sleep(DELAY_MS);
  }

  console.log(`\n\n🎉 "${source.name}" done!`);
  console.log(`   Saved   : ${saved}`);
  console.log(`   Skipped : ${skipped}`);
  console.log(`   Empty   : ${empty} (root not in this source)`);
  console.log(`   Failed  : ${failed}`);

  if (missingRoots.length > 0) {
    console.log(`\n📋 Roots not added (${missingRoots.length}):`);
    const batchList = missingRoots.slice(0, 100);
    console.log(`   ${batchList.join(", ")}${missingRoots.length > 100 ? "..." : ""}`);
  }
}

// ================================================================
// 4. Stats
// ================================================================
async function printStats() {
  const total = await RootMeaning.countDocuments();
  const bySources = await RootMeaning.aggregate([
    { $group: { _id: "$source.id", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  console.log(`\n📊 root_meanings collection:`);
  console.log(`   Total docs : ${total}`);
  for (const s of bySources) {
    const name = (SOURCES as any)[s._id]?.name || s._id;
    console.log(`   ${s._id.padEnd(12)} (${name}) : ${s.count}`);
  }
}

// ================================================================
// 5. Exported Function for index.ts
// ================================================================
export async function seedRootMeanings(options: { source?: string; all?: boolean; drop?: boolean } = {}) {
  const { source, all, drop } = options;

  if (drop) {
    await RootMeaning.deleteMany({});
    console.log("🗑️  Dropped root_meanings collection\n");
    if (!all && !source) return;
  }

  if (all) {
    for (const sourceId of Object.keys(SOURCES)) {
      await seedSource(sourceId);
    }
  } else if (source) {
    await seedSource(source);
  } else if (!drop) {
    console.log(`
Usage:
  --source [id]   ← one source (e.g., lisan)
  --all           ← all sources
  --drop          ← drop & restart

Available sources:
${Object.entries(SOURCES).map(([id, s]) => `  ${id.padEnd(12)} → ${s.name} (${s.author})`).join("\n")}
    `);
    return;
  }

  await printStats();
}

// ================================================================
// 6. Standalone Execution
// ================================================================
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const sourceIndex = args.indexOf("--source");
  const sourceArg = sourceIndex !== -1 ? args[sourceIndex + 1] : null;
  const isAll = args.includes("--all");
  const isDrop = args.includes("--drop");
  const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/quran_db";

  (async () => {
    console.log("⏳ Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected\n");

    await seedRootMeanings({ source: sourceArg || undefined, all: isAll, drop: isDrop });

    await mongoose.disconnect();
    console.log("\n🔌 Disconnected.");
    process.exit(0);
  })().catch((e) => {
    console.error("❌ Fatal:", e);
    process.exit(1);
  });
}