import "dotenv/config";
import { Root, Token } from "../database/models/index.js";
import { sleep } from "./helpers.js";

// ================================================================
// 1. Config
// ================================================================
const DELAY_MS = 200;
const COMPARE_BATCH = 50;   // compare target root vs 50 roots at a time
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "qwen2.5:14b";

// ================================================================
// 2. Build root context
// ================================================================
async function buildRootContext(rootDoc: any) {
  const lemmas = await Token.find({ ROOT: rootDoc.root }).distinct("LEM");
  const posTags = await Token.find({ ROOT: rootDoc.root }).distinct("POS");
  const forms = await Token.find({ ROOT: rootDoc.root, STEM: true }).distinct("form");

  return {
    root: rootDoc.root,
    arabic: rootDoc.arabic || "",
    lemmas: lemmas.filter(Boolean).slice(0, 5),
    pos: posTags.filter(Boolean),
    forms: forms.filter(Boolean).slice(0, 5),
  };
}

// ================================================================
// 3. Compare target root vs a small batch of candidates
// Returns only related roots from that batch
// ================================================================
async function compareBatch(ctx: any, candidates: any[]) {
  const candidateList = candidates
    .map((r) => `${r.root}${r.arabic ? `(${r.arabic})` : ""}`)
    .join(", ");

  const prompt = `You are an expert in Quranic Arabic linguistics.

Target root: "${ctx.root}"
Arabic: "${ctx.arabic || "?"}"
Lemmas: ${ctx.lemmas.join(", ")}
POS: ${ctx.pos.join(", ")}
Forms: ${ctx.forms.join(", ")}

Compare the target root to each root in this list:
${candidateList}

Return ONLY the roots that are SEMANTICALLY related to "${ctx.root}".
Semantic = shared meaning, same concept family, or thematic connection in Quran.
Be strict. If none are related return empty array.

Respond with valid JSON only:
{"related": ["root1", "root2"]}`;

  const res = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt,
      format: "json",
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 100,
      },
    }),
  });

  if (!res.ok) throw new Error(`Ollama error: ${res.status}`);
  const data = await res.json();

  try {
    const parsed = JSON.parse((data as any).response || "{}");
    const related = parsed.related || [];
    const validRoots = candidates.map((r: any) => r.root);
    return related.filter((r: any) => validRoots.includes(r) && r !== ctx.root);
  } catch {
    return [];
  }
}

// ================================================================
// 4. Compare target root against ALL other roots in batches
// ================================================================
async function findRelatedRoots(ctx: any, allRoots: any[]) {
  const others = allRoots.filter((r) => r.root !== ctx.root);
  const allRelated = [];

  // Split into batches of COMPARE_BATCH
  for (let i = 0; i < others.length; i += COMPARE_BATCH) {
    const batch = others.slice(i, i + COMPARE_BATCH);
    const related = await compareBatch(ctx, batch);
    allRelated.push(...related);
    await sleep(DELAY_MS);
  }

  return [...new Set(allRelated)]; // deduplicate
}

// ================================================================
// 5. Save bidirectionally (memory)
// ================================================================
async function saveBidirectional(rootA: string, relatedRoots: string[]) {
  // A → [B, C, D]
  await Root.findOneAndUpdate(
    { root: rootA },
    {
      $addToSet: { related_meaning: { $each: relatedRoots } },
      $set: { semantic_processed: true },
    }
  );

  // B → A, C → A, D → A (free, no extra call)
  if (relatedRoots.length > 0) {
    await Root.updateMany(
      { root: { $in: relatedRoots } },
      { $addToSet: { related_meaning: rootA } }
    );
  }
}

// ================================================================
// 6. Main Export
// ================================================================
export async function runSemanticRoots() {
  const allRoots = await Root.find()
    .sort({ count: -1 })
    .select("root arabic")
    .lean();

  const roots = await Root.find({ semantic_processed: { $ne: true } })
    .sort({ count: -1 })
    .select("root arabic count")
    .lean();

  const batchesPerRoot = Math.ceil((allRoots.length - 1) / COMPARE_BATCH);
  const totalCalls = roots.length * batchesPerRoot;

  console.log(`📚 Total roots      : ${allRoots.length}`);
  console.log(`🔀 Batches per root : ${batchesPerRoot} (${COMPARE_BATCH} candidates each)`);
  console.log(`📞 Total API calls  : ~${totalCalls.toLocaleString()}`);
  console.log(`⏱️  Est. time       : ~${Math.ceil((totalCalls * 1.5) / 3600)} hours\n`);

  let processed = 0;
  let totalRelations = 0;
  let failed = 0;

  for (const rootDoc of roots) {
    try {
      const ctx = await buildRootContext(rootDoc);

      process.stdout.write(`\n🔍 [${processed + 1}/${roots.length}] Processing "${rootDoc.root}"...`);

      // Compare against all other roots in batches of 50
      const relatedRoots = await findRelatedRoots(ctx, allRoots);

      // Save A→B and B→A
      await saveBidirectional(rootDoc.root, relatedRoots);

      totalRelations += relatedRoots.length;
      processed++;

      process.stdout.write(
        ` → found ${relatedRoots.length} related: [${relatedRoots.join(", ") || "none"}]`
      );
    } catch (err: any) {
      failed++;
      console.error(`\n❌ Failed on "${rootDoc.root}": ${err.message}`);
    }
  }

  console.log(`\n\n🎉 Done!`);
  console.log(`   Processed       : ${processed}`);
  console.log(`   Failed          : ${failed}`);
  console.log(`   Total relations : ${totalRelations} (+ ${totalRelations} reverse = ${totalRelations * 2} links)`);

  const sample = await Root.find({
    semantic_processed: true,
    "related_meaning.0": { $exists: true },
  })
    .sort({ count: -1 })
    .limit(5)
    .select("root related_meaning")
    .lean();

  console.log("\n📊 Sample:");
  for (const r of sample) {
    console.log(`   ${r.root.padEnd(10)} → [${r.related_meaning.join(", ")}]`);
  }
}
