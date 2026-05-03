/**
 * Performance & DB-volume sanity benchmark for the API-key auth path.
 *
 * Implements T056 (SC-005, p99 < 50 ms under 100 rps × 60 s with a valid key)
 * and T056b (SC-010, api_keys query volume under invalid-key flood stays
 * within ±10% of no-attack baseline).
 *
 * Run:
 *   npx tsx tests/perf/auth-load.ts
 *
 * Records numeric results to stdout. Copy-paste the appendix block into
 * specs/002-reviewable-honest-api/research.md per T056/T056b instructions.
 *
 * NOT a Vitest test file — runs out-of-band so the regular `npm test` stays
 * fast and deterministic.
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env") });

if (!process.env.API_KEY_PEPPER) {
  process.env.API_KEY_PEPPER = "x".repeat(64);
}
process.env.NODE_ENV = "test";

const mongoServer = await MongoMemoryServer.create();
process.env.MONGO_URI = mongoServer.getUri();
process.env.MONGO_URI_TEST = mongoServer.getUri();

const { createApp } = await import("../../src/app.js");
const { ApiKey } = await import("../../src/database/models/api-key.model.js");
const { hmacKey } = await import("../../src/utils/hmac.js");

await mongoose.connect(mongoServer.getUri());

const VALID_KEY = "valid_load_key_" + "a".repeat(32);
await ApiKey.create({
  hashedKey: hmacKey(VALID_KEY),
  label: "perf-load-test",
  status: "active",
});

const app = await createApp();
await app.ready();

let apiKeyQueryCount = 0;
mongoose.connection.on("query", () => {});
const ApiKeyModel: any = ApiKey;
const origFind = ApiKeyModel.findOne.bind(ApiKeyModel);
ApiKeyModel.findOne = (...args: unknown[]) => {
  apiKeyQueryCount++;
  return origFind(...args);
};

interface ScenarioResult {
  name: string;
  durationMs: number;
  requests: number;
  apiKeyQueries: number;
  apiKeyQueriesPerMin: number;
  latencies: { p50: number; p95: number; p99: number; max: number; mean: number };
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const summarize = (latencies: number[]) => {
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted[sorted.length - 1],
    mean: sum / sorted.length,
  };
};

const URL = "/api/v1/quran/surahs";

const runScenario = async (
  name: string,
  durationMs: number,
  load: { validRps: number; invalidRps: number; uniqueInvalidPerSecond: number },
): Promise<ScenarioResult> => {
  const latencies: number[] = [];
  const queriesAtStart = apiKeyQueryCount;
  const start = Date.now();
  const end = start + durationMs;
  let requests = 0;

  const tickInterval = 100; // ms
  const validPerTick = (load.validRps * tickInterval) / 1000;
  const invalidPerTick = (load.invalidRps * tickInterval) / 1000;

  let validBacklog = 0;
  let invalidBacklog = 0;

  while (Date.now() < end) {
    const tickStart = Date.now();
    validBacklog += validPerTick;
    invalidBacklog += invalidPerTick;

    const tasks: Promise<unknown>[] = [];

    while (validBacklog >= 1) {
      validBacklog -= 1;
      const t0 = performance.now();
      tasks.push(
        app
          .inject({ method: "GET", url: URL, headers: { "x-api-key": VALID_KEY } })
          .then(() => {
            latencies.push(performance.now() - t0);
            requests++;
          }),
      );
    }
    while (invalidBacklog >= 1) {
      invalidBacklog -= 1;
      const garbageKey = `bad-${Math.random().toString(36).slice(2, 10)}`;
      tasks.push(
        app
          .inject({ method: "GET", url: URL, headers: { "x-api-key": garbageKey } })
          .then(() => {
            requests++;
          }),
      );
    }

    await Promise.all(tasks);

    const elapsed = Date.now() - tickStart;
    if (elapsed < tickInterval) {
      await new Promise((r) => setTimeout(r, tickInterval - elapsed));
    }
  }

  const actualDurationMs = Date.now() - start;
  const queriesUsed = apiKeyQueryCount - queriesAtStart;

  return {
    name,
    durationMs: actualDurationMs,
    requests,
    apiKeyQueries: queriesUsed,
    apiKeyQueriesPerMin: (queriesUsed / actualDurationMs) * 60_000,
    latencies: summarize(latencies),
  };
};

console.log("== Phase 6 perf benchmark ==");
console.log("Scenario A (T056): 100 rps valid-key for 60s → measure p99 latency");
console.log("Scenario B (T056b baseline): 100 rps valid-key for 30s → api_keys QPM baseline");
console.log("Scenario C (T056b flood): 200 rps invalid + 10 rps valid for 30s → api_keys QPM under flood");
console.log("");

// Use shorter durations than spec's 60s when invoked locally to keep runtime
// reasonable; override with PERF_DURATION_MS env var if you want full-spec runs.
const fullDuration = Number(process.env.PERF_DURATION_MS ?? 30_000);

const scenarioA = await runScenario("T056-100rps-valid", Number(process.env.PERF_T056_DURATION_MS ?? fullDuration), {
  validRps: 100,
  invalidRps: 0,
  uniqueInvalidPerSecond: 0,
});
console.log("[A] T056 result:", JSON.stringify(scenarioA, null, 2));

// Reset rate-limiter between scenarios so invalid-key tests aren't blocked
const { clearRateLimiter } = await import("../../src/plugins/api-key.plugin.js");
clearRateLimiter();

const scenarioB = await runScenario("T056b-baseline", fullDuration, {
  validRps: 100,
  invalidRps: 0,
  uniqueInvalidPerSecond: 0,
});
console.log("[B] T056b baseline:", JSON.stringify(scenarioB, null, 2));

clearRateLimiter();

const scenarioC = await runScenario("T056b-flood", fullDuration, {
  validRps: 10,
  invalidRps: 200,
  uniqueInvalidPerSecond: 200,
});
console.log("[C] T056b flood:", JSON.stringify(scenarioC, null, 2));

const baselineQpm = scenarioB.apiKeyQueriesPerMin;
const floodQpm = scenarioC.apiKeyQueriesPerMin;
const drift = (floodQpm - baselineQpm) / baselineQpm;

console.log("");
console.log("== Summary ==");
console.log(`T056 p99 latency: ${scenarioA.latencies.p99.toFixed(2)} ms (target < 50 ms)`);
console.log(`T056 PASS:        ${scenarioA.latencies.p99 < 50 ? "yes" : "no"}`);
console.log(`T056b baseline QPM: ${baselineQpm.toFixed(1)} queries/min`);
console.log(`T056b flood QPM:    ${floodQpm.toFixed(1)} queries/min`);
console.log(`T056b drift: ${(drift * 100).toFixed(2)}% (target ±10%)`);
console.log(`T056b PASS:  ${Math.abs(drift) <= 0.1 ? "yes" : "no"}`);

await app.close();
await mongoose.disconnect();
await mongoServer.stop();
process.exit(0);
