/**
 * CLI-level integration tests for verify-branch-protection.ts
 *
 * Two layers:
 *   1. spawnSync — exercises the real CLI binary for exit-code behaviour that
 *      does not require a GitHub API call (no-token cases). These prove the
 *      process.exit() wiring works correctly.
 *   2. runVerification() with injected fetchRulesets — exercises the full
 *      orchestration path (token validation, API error handling, ruleset
 *      lookup, drift detection) without real network calls.
 *
 * Pure verifyRuleset() / formatReport() unit tests live in
 * verify-branch-protection.test.ts and are not duplicated here.
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runVerification,
  type FetchRulesets,
  type LiveRuleset,
} from "../../scripts/verify-branch-protection.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = resolve(ROOT, "scripts/verify-branch-protection.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function spawnScript(
  args: string[] = [],
  extraEnv: Record<string, string> = {},
): ReturnType<typeof spawnSync> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extraEnv };
  delete env.GITHUB_TOKEN;
  delete env.BRANCH_PROTECTION_READ_TOKEN;
  // Use the current node binary with tsx/esm as the import hook so we avoid
  // shell: true (which triggers a deprecation warning on Node ≥ 20 when args
  // are passed) and don't need to resolve the platform-specific tsx.cmd shim.
  return spawnSync(process.execPath, ["--import", "tsx/esm", SCRIPT, ...args], {
    cwd: ROOT,
    env,
    encoding: "utf-8",
    timeout: 30_000,
  });
}

function makeMatchingRuleset(): LiveRuleset {
  return {
    id: 1,
    name: "main-protection",
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"] } },
    rules: [
      {
        type: "pull_request",
        parameters: {
          required_approving_review_count: 1,
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: false,
        },
      },
      {
        type: "required_status_checks",
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: [
            { context: "correctness" },
            { context: "perf-gate" },
            { context: "openapi-parity" },
            { context: "auth-contract" },
            { context: "branch-protection" },
          ],
        },
      },
      { type: "non_fast_forward" },
      { type: "deletion" },
    ],
    bypass_actors: [],
  };
}

// ---------------------------------------------------------------------------
// Layer 1: spawnSync — process exit-code wiring (no API needed)
// ---------------------------------------------------------------------------

describe("CLI binary — no-token exit behaviour", () => {
  it("exits 1 and prints an actionable message when no token is set", () => {
    const result = spawnScript();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No GITHUB_TOKEN");
    expect(result.stderr).toContain("administration:read");
  });

  it("exits 0 with --dry-run even when no token is set", () => {
    const result = spawnScript(["--dry-run"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toContain("No GITHUB_TOKEN");
  });
});

// ---------------------------------------------------------------------------
// Layer 2: runVerification() with injected fetchRulesets
// ---------------------------------------------------------------------------

const COMMON = {
  token: "test-token",
  repository: "owner/repo",
  rootDir: ROOT,
};

describe("runVerification() — missing GITHUB_REPOSITORY", () => {
  it("returns exit code 1 when repository env is missing", async () => {
    const code = await runVerification({ dryRun: false, token: "tok", repository: undefined, rootDir: ROOT });
    expect(code).toBe(1);
  });

  it("returns exit code 0 in dry-run mode even when repository is missing", async () => {
    const code = await runVerification({ dryRun: true, token: "tok", repository: undefined, rootDir: ROOT });
    expect(code).toBe(0);
  });
});

describe("runVerification() — fetchRulesets throws 403", () => {
  it("returns exit code 1 and does not throw", async () => {
    const stub: FetchRulesets = async () => {
      const err = new Error("Forbidden") as Error & { status: number };
      err.status = 403;
      throw err;
    };
    const code = await runVerification({ ...COMMON, dryRun: false, fetchRulesets: stub });
    expect(code).toBe(1);
  });

  it("returns exit code 0 in dry-run mode when 403 is thrown", async () => {
    const stub: FetchRulesets = async () => {
      const err = new Error("Forbidden") as Error & { status: number };
      err.status = 403;
      throw err;
    };
    const code = await runVerification({ ...COMMON, dryRun: true, fetchRulesets: stub });
    expect(code).toBe(0);
  });
});

describe("runVerification() — no matching ruleset returned", () => {
  it("returns exit code 1 when the ruleset list is empty", async () => {
    const stub: FetchRulesets = async () => [];
    const code = await runVerification({ ...COMMON, dryRun: false, fetchRulesets: stub });
    expect(code).toBe(1);
  });

  it("returns exit code 0 in dry-run mode when no ruleset is found", async () => {
    const stub: FetchRulesets = async () => [];
    const code = await runVerification({ ...COMMON, dryRun: true, fetchRulesets: stub });
    expect(code).toBe(0);
  });
});

describe("runVerification() — matching ruleset (clean state)", () => {
  it("returns exit code 0 when the live ruleset fully matches declared config", async () => {
    const stub: FetchRulesets = async () => [makeMatchingRuleset()];
    const code = await runVerification({ ...COMMON, dryRun: false, fetchRulesets: stub });
    expect(code).toBe(0);
  });
});

describe("runVerification() — drifted ruleset", () => {
  it("returns exit code 1 when required_approving_review_count differs", async () => {
    const ruleset = makeMatchingRuleset();
    const prRule = ruleset.rules.find((r) => r.type === "pull_request")!;
    (prRule.parameters as Record<string, unknown>).required_approving_review_count = 0;

    const stub: FetchRulesets = async () => [ruleset];
    const code = await runVerification({ ...COMMON, dryRun: false, fetchRulesets: stub });
    expect(code).toBe(1);
  });

  it("returns exit code 0 in dry-run mode even when drift exists", async () => {
    const ruleset = makeMatchingRuleset();
    const prRule = ruleset.rules.find((r) => r.type === "pull_request")!;
    (prRule.parameters as Record<string, unknown>).required_approving_review_count = 0;

    const stub: FetchRulesets = async () => [ruleset];
    const code = await runVerification({ ...COMMON, dryRun: true, fetchRulesets: stub });
    expect(code).toBe(0);
  });

  it("returns exit code 1 when a required check is missing from live ruleset", async () => {
    const ruleset = makeMatchingRuleset();
    const rscRule = ruleset.rules.find((r) => r.type === "required_status_checks")!;
    (rscRule.parameters as Record<string, unknown>).required_status_checks = [
      { context: "correctness" },
    ];

    const stub: FetchRulesets = async () => [ruleset];
    const code = await runVerification({ ...COMMON, dryRun: false, fetchRulesets: stub });
    expect(code).toBe(1);
  });
});
