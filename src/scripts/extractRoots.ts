// extractRoots.ts
// Extracts Quranic root meanings from Arabic PDFs using Qwen via Ollama
//
// Usage:
//   npx tsx extractRoots.ts --pdf mufradat.pdf --source raghib
//   npx tsx extractRoots.ts --pdf sihah.pdf --source sihah
//   npx tsx extractRoots.ts --pdf muajam.pdf --source muajam
//   npx tsx extractRoots.ts --merge

import fs from "fs";
import path from "path";
import { PDFParse } from "pdf-parse";

// ================================================================
// 1. Config
// ================================================================
const OLLAMA_URL = "http://localhost:11434/api/generate";
const MODEL = "qwen2.5:14b";
const CHUNK_SIZE = 3000;  // chars per chunk
const OVERLAP = 200;      // overlap to avoid cutting roots mid-entry
const DELAY_MS = 200;     // local model, no rate limit

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ================================================================
// 2. Types
// ================================================================
interface RootEntry {
    root_arabic: string;
    root_buckwalter: string;
    arabic_short: string;
    arabic_description: string;
    synonyms: string[];
    related_roots_arabic: string[];
    sources?: string[];
}

// ================================================================
// 3. Extract text from PDF
// ================================================================
async function extractPdfText(pdfPath: string): Promise<string> {
    console.log(`📄 Reading PDF: ${pdfPath}`);
    const buffer = fs.readFileSync(pdfPath);
    const pdf = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await pdf.getText();
    console.log(`✅ Extracted ${result.text.length.toLocaleString()} characters from ${result.total} pages\n`);
    return result.text;
}

// ================================================================
// 4. Split text into chunks
// ================================================================
function splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
        let end = start + CHUNK_SIZE;
        if (end < text.length) {
            const breakPoint = text.lastIndexOf("\n", end);
            if (breakPoint > start) end = breakPoint;
        }
        chunks.push(text.slice(start, end));
        start = end - OVERLAP;
    }

    return chunks;
}

// ================================================================
// 5. Call Qwen via Ollama to extract roots from a chunk
// ================================================================
async function extractRootsFromChunk(
    chunk: string,
    source: string
): Promise<RootEntry[]> {
    const sourceHint: Record<string, string> = {
        raghib: "مفردات ألفاظ القرآن للراغب الأصفهاني",
        sihah: "الصحاح للجوهري",
        muajam: "المعجم الاشتقاقي المؤصل لألفاظ القرآن الكريم",
    };

    const prompt = `You are an expert in Arabic linguistics and Quranic root analysis.
The following text is from the Arabic book: "${sourceHint[source] || source}"

Extract ALL Quranic Arabic roots mentioned in this text with their meanings.
For each root found:
- root_arabic: the Arabic root letters (e.g. أله, رحم, حمد)
- root_buckwalter: Buckwalter transliteration (e.g. Alh, rHm, Hmd)
- arabic_short: 3-7 Arabic words summarizing the core meaning
- arabic_description: the full explanation from the text
- synonyms: Arabic synonyms mentioned in the text
- related_roots_arabic: other Arabic roots mentioned as related

If no roots are found return empty array.
Return ONLY valid JSON array, no explanation:
[
  {
    "root_arabic": "أله",
    "root_buckwalter": "Alh",
    "arabic_short": "التعلق الوجداني بالله",
    "arabic_description": "...",
    "synonyms": [],
    "related_roots_arabic": ["وله"]
  }
]

Text:
${chunk}`;

    const res = await fetch(OLLAMA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: MODEL,
            prompt,
            format: "json",
            stream: false,
            options: { temperature: 0.1, num_predict: 2000 },
        }),
    });

    if (!res.ok) throw new Error(`Ollama error: ${res.status}`);

    const data = await res.json();
    const text = (data.response || "[]")
        .replace(/```json|```/g, "")
        .trim();

    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// ================================================================
// 6. Process one PDF
// ================================================================
async function processPdf(pdfPath: string, source: string) {
    const outputFile = `roots_${source}.json`;

    // Load existing progress
    const existing: Record<string, RootEntry> = {};
    if (fs.existsSync(outputFile)) {
        const data: RootEntry[] = JSON.parse(fs.readFileSync(outputFile, "utf-8"));
        data.forEach((r) => { existing[r.root_arabic] = r; });
        console.log(`📂 Loaded ${Object.keys(existing).length} existing roots\n`);
    }

    const text = await extractPdfText(pdfPath);
    const chunks = splitIntoChunks(text);
    console.log(`📦 Split into ${chunks.length} chunks\n`);

    const allRoots: Record<string, RootEntry> = { ...existing };
    let newFound = 0;

    for (let i = 0; i < chunks.length; i++) {
        process.stdout.write(
            `\r🔍 Chunk ${i + 1}/${chunks.length} | Roots found: ${Object.keys(allRoots).length}`
        );

        const roots = await extractRootsFromChunk(chunks[i], source);

        for (const root of roots) {
            const key = root.root_arabic;
            if (!key) continue;

            if (!allRoots[key]) {
                allRoots[key] = root;
                newFound++;
            } else {
                // Merge — enrich existing entry
                const e = allRoots[key];
                if (!e.arabic_description && root.arabic_description)
                    e.arabic_description = root.arabic_description;
                if (root.synonyms?.length)
                    e.synonyms = [...new Set([...e.synonyms, ...root.synonyms])];
                if (root.related_roots_arabic?.length)
                    e.related_roots_arabic = [...new Set([...e.related_roots_arabic, ...root.related_roots_arabic])];
                if (!e.root_buckwalter && root.root_buckwalter)
                    e.root_buckwalter = root.root_buckwalter;
            }
        }

        // Save progress every 10 chunks
        if ((i + 1) % 10 === 0) {
            fs.writeFileSync(outputFile, JSON.stringify(Object.values(allRoots), null, 2), "utf-8");
        }

        await sleep(DELAY_MS);
    }

    // Final save
    fs.writeFileSync(outputFile, JSON.stringify(Object.values(allRoots), null, 2), "utf-8");

    console.log(`\n\n🎉 Done! Source: ${source}`);
    console.log(`   Total roots : ${Object.keys(allRoots).length}`);
    console.log(`   New found   : ${newFound}`);
    console.log(`   Saved to    : ${outputFile}\n`);
}

// ================================================================
// 7. Merge all sources into one file
// ================================================================
function mergeSources() {
    const sources = ["raghib", "sihah", "muajam"];
    const merged: Record<string, RootEntry> = {};

    for (const source of sources) {
        const file = `roots_${source}.json`;
        if (!fs.existsSync(file)) {
            console.log(`⚠️  ${file} not found, skipping...`);
            continue;
        }

        const roots: RootEntry[] = JSON.parse(fs.readFileSync(file, "utf-8"));
        console.log(`📂 ${file}: ${roots.length} roots`);

        for (const root of roots) {
            const key = root.root_arabic;
            if (!key) continue;

            if (!merged[key]) {
                merged[key] = { ...root, sources: [source] };
            } else {
                const e = merged[key];
                if (!e.sources?.includes(source)) e.sources?.push(source);

                // Prefer longer description
                if ((root.arabic_description?.length || 0) > (e.arabic_description?.length || 0))
                    e.arabic_description = root.arabic_description;

                // Merge synonyms + related roots
                e.synonyms = [...new Set([...e.synonyms, ...root.synonyms])];
                e.related_roots_arabic = [...new Set([...e.related_roots_arabic, ...root.related_roots_arabic])];

                // Fill missing buckwalter
                if (!e.root_buckwalter && root.root_buckwalter)
                    e.root_buckwalter = root.root_buckwalter;
            }
        }
    }

    const output = Object.values(merged);
    fs.writeFileSync("roots_merged.json", JSON.stringify(output, null, 2), "utf-8");

    console.log(`\n✅ Merged ${output.length} unique roots → roots_merged.json`);
}

// ================================================================
// 8. CLI
// ================================================================
const args = process.argv.slice(2);
const pdfArg = args[args.indexOf("--pdf") + 1];
const sourceArg = args[args.indexOf("--source") + 1] as "raghib" | "sihah" | "muajam";
const isMerge = args.includes("--merge");

if (isMerge) {
    mergeSources();
} else if (pdfArg && sourceArg) {
    processPdf(pdfArg, sourceArg).catch((e) => {
        console.error("❌ Fatal:", e);
        process.exit(1);
    });
} else {
    console.log(`
Usage:
  npx tsx extractRoots.ts --pdf mufradat.pdf --source raghib
  npx tsx extractRoots.ts --pdf sihah.pdf --source sihah
  npx tsx extractRoots.ts --pdf muajam.pdf --source muajam
  npx tsx extractRoots.ts --merge
  `);
}
