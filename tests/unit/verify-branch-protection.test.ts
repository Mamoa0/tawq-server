/**
 * T044 – Unit tests for verify-branch-protection.ts
 *
 * Tests the pure verifyRuleset() and formatReport() functions using
 * constructed fixtures — no real GitHub API calls.
 *
 * Fixture scenarios:
 *   (a) fully matching ruleset → verifyRuleset returns []  (exit 0)
 *   (b) drifted required_approving_review_count → exit 1, delta in output
 *   (c) missing required check → exit 1, missing check named in output
 *
 * contracts/branch-protection.contract.md §2, §9
 */
import { describe, it, expect } from "vitest";
import {
  verifyRuleset,
  formatReport,
  type LiveRuleset,
  type DeclaredConfig,
} from "../../scripts/verify-branch-protection.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const DECLARED: DeclaredConfig = {
  target: { ref: "main" },
  rules: {
    pull_request: {
      required_approving_review_count: 1,
      dismiss_stale_reviews_on_push: true,
      require_code_owner_review: false,
      require_last_push_approval: false,
    },
    required_status_checks: {
      strict: true,
      contexts_from: ".github/required-checks.yml",
    },
    enforce_admins: true,
    block_force_pushes: true,
    block_deletions: true,
  },
};

const RESOLVED_CHECKS = [
  "correctness",
  "perf-gate",
  "openapi-parity",
  "auth-contract",
  "branch-protection",
];

function makeMatchingRuleset(): LiveRuleset {
  return {
    id: 1,
    name: "main-protection",
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
          required_status_checks: RESOLVED_CHECKS.map((name) => ({ context: name })),
        },
      },
      { type: "non_fast_forward" },
      { type: "deletion" },
    ],
    bypass_actors: [],
  };
}

// ---------------------------------------------------------------------------
// verifyRuleset()
// ---------------------------------------------------------------------------

describe("verifyRuleset() — fixture (a): matching ruleset", () => {
  it("returns an empty drift list when all rules match (exit 0)", () => {
    const drifts = verifyRuleset(DECLARED, RESOLVED_CHECKS, makeMatchingRuleset());
    expect(drifts).toHaveLength(0);
  });
});

describe("verifyRuleset() — fixture (b): drifted required_approving_review_count", () => {
  it("detects the count mismatch and includes declared/live values in the entry", () => {
    const ruleset = makeMatchingRuleset();
    const prRule = ruleset.rules.find((r) => r.type === "pull_request")!;
    (prRule.parameters as Record<string, unknown>).required_approving_review_count = 0;

    const drifts = verifyRuleset(DECLARED, RESOLVED_CHECKS, ruleset);
    expect(drifts.length).toBeGreaterThan(0);

    const drift = drifts.find((d) => d.rule === "required_approving_review_count");
    expect(drift, "drift entry for required_approving_review_count not found").toBeDefined();
    expect(drift?.declared).toBe("1");
    expect(drift?.live).toBe("0");
    expect(drift?.action).toContain("1");
  });
});

describe("verifyRuleset() — fixture (c): missing required check", () => {
  it("detects the missing check and names it in the drift entry", () => {
    const ruleset = makeMatchingRuleset();
    const rscRule = ruleset.rules.find((r) => r.type === "required_status_checks")!;
    // Remove perf-gate from live checks
    (rscRule.parameters as Record<string, unknown>).required_status_checks = [
      { context: "correctness" },
      { context: "openapi-parity" },
      { context: "auth-contract" },
      { context: "branch-protection" },
    ];

    const drifts = verifyRuleset(DECLARED, RESOLVED_CHECKS, ruleset);
    expect(drifts.length).toBeGreaterThan(0);

    const drift = drifts.find((d) => d.rule === "required_status_checks");
    expect(drift, "drift entry for required_status_checks not found").toBeDefined();
    expect(drift?.declared).toContain("perf-gate");
    expect(drift?.action).toContain("perf-gate");
  });
});

describe("verifyRuleset() — additional drift scenarios", () => {
  it("detects missing non_fast_forward rule (block_force_pushes)", () => {
    const ruleset = makeMatchingRuleset();
    ruleset.rules = ruleset.rules.filter((r) => r.type !== "non_fast_forward");

    const drifts = verifyRuleset(DECLARED, RESOLVED_CHECKS, ruleset);
    const drift = drifts.find((d) => d.rule === "block_force_pushes");
    expect(drift, "block_force_pushes drift not detected").toBeDefined();
    expect(drift?.declared).toBe("true");
    expect(drift?.action).toContain("non_fast_forward");
  });

  it("detects missing deletion rule (block_deletions)", () => {
    const ruleset = makeMatchingRuleset();
    ruleset.rules = ruleset.rules.filter((r) => r.type !== "deletion");

    const drifts = verifyRuleset(DECLARED, RESOLVED_CHECKS, ruleset);
    const drift = drifts.find((d) => d.rule === "block_deletions");
    expect(drift, "block_deletions drift not detected").toBeDefined();
    expect(drift?.declared).toBe("true");
    expect(drift?.action).toContain("deletion");
  });

  it("detects admin bypass actor (enforce_admins violation)", () => {
    const ruleset = makeMatchingRuleset();
    ruleset.bypass_actors = [{ actor_type: "OrganizationAdmin", bypass_mode: "always" }];

    const drifts = verifyRuleset(DECLARED, RESOLVED_CHECKS, ruleset);
    const drift = drifts.find((d) => d.rule === "enforce_admins");
    expect(drift, "enforce_admins drift not detected").toBeDefined();
    expect(drift?.declared).toContain("true");
    expect(drift?.action).toContain("bypass");
  });

  it("detects drifted dismiss_stale_reviews_on_push", () => {
    const ruleset = makeMatchingRuleset();
    const prRule = ruleset.rules.find((r) => r.type === "pull_request")!;
    (prRule.parameters as Record<string, unknown>).dismiss_stale_reviews_on_push = false;

    const drifts = verifyRuleset(DECLARED, RESOLVED_CHECKS, ruleset);
    const drift = drifts.find((d) => d.rule === "dismiss_stale_reviews_on_push");
    expect(drift).toBeDefined();
    expect(drift?.declared).toBe("true");
    expect(drift?.live).toBe("false");
  });

  it("detects missing pull_request rule entirely", () => {
    const ruleset = makeMatchingRuleset();
    ruleset.rules = ruleset.rules.filter((r) => r.type !== "pull_request");

    const drifts = verifyRuleset(DECLARED, RESOLVED_CHECKS, ruleset);
    const drift = drifts.find((d) => d.rule === "pull_request");
    expect(drift).toBeDefined();
    expect(drift?.live).toBe("missing");
  });
});

// ---------------------------------------------------------------------------
// formatReport()
// ---------------------------------------------------------------------------

describe("formatReport()", () => {
  it("returns empty string when there are no drifts", () => {
    expect(formatReport([])).toBe("");
  });

  it("includes the 'Branch protection drift' heading", () => {
    const report = formatReport([
      {
        rule: "required_approving_review_count",
        declared: "1",
        live: "0",
        action: "Set live to 1",
      },
    ]);
    expect(report).toContain("Branch protection drift");
  });

  it("includes the drift values in a markdown table row", () => {
    const report = formatReport([
      {
        rule: "required_approving_review_count",
        declared: "1",
        live: "0",
        action: "Set live to 1",
      },
    ]);
    expect(report).toContain("required_approving_review_count");
    expect(report).toContain("| 1 | 0 |");
    expect(report).toContain("Set live to 1");
  });

  it("includes all drift entries when multiple drifts exist", () => {
    const report = formatReport([
      { rule: "required_approving_review_count", declared: "1", live: "0", action: "Fix count" },
      { rule: "enforce_admins", declared: "true", live: "false", action: "Re-enable" },
    ]);
    expect(report).toContain("required_approving_review_count");
    expect(report).toContain("enforce_admins");
  });
});
