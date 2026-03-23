import fs from "fs";
import readline from "readline";
import { Token } from "../database/models/index.js";

function parseLocation(loc: string) {
  const match = loc.match(/\((\d+):(\d+):(\d+):(\d+)\)/);
  if (!match) return null;
  return {
    surah: Number(match[1]),
    ayah: Number(match[2]),
    word: Number(match[3]),
    segment: Number(match[4]),
  };
}

function parseFeatures(features: string) {
  const result: Record<string, any> = {};
  const parts = features.split("|");
  for (const p of parts) {
    if (p.includes(":")) {
      const [k, v] = p.split(":");
      result[k] = v;
    } else {
      result[p] = true;
    }
  }
  return result;
}

export async function seedTokens(filePath: string) {
  console.log(`🧬 Starting Token seed from ${filePath}...`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Token source file not found: ${filePath}`);
    return;
  }

  const count = await Token.countDocuments();
  if (count > 0) {
    console.log(`⚠️  Tokens already seeded (${count} docs). Skipping.\n`);
    return;
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  const batchSize = 1000;
  let docs = [];
  let totalSaved = 0;

  for await (const line of rl) {
    if (!line.trim() || line.startsWith("#")) continue;

    const parts = line.split("\t");
    const location = parseLocation(parts[0]);
    if (!location) continue;

    const form = parts[1];
    const tag = parts[2];
    const features = parseFeatures(parts[3] || "");

    docs.push({ ...location, form, tag, ...features });

    if (docs.length >= batchSize) {
      await Token.insertMany(docs);
      totalSaved += docs.length;
      docs = [];
      process.stdout.write(`\r✅ Tokens - Processed ${totalSaved}...`);
    }
  }

  if (docs.length) {
    await Token.insertMany(docs);
    totalSaved += docs.length;
  }

  console.log(`\n🎉 Token seed complete! Total: ${totalSaved}\n`);
}
