/**
 * verify-branch-protection.ts
 *
 * Diffs the declared branch-protection config in .github/branch-protection.yml
 * against the live GitHub Ruleset for `main`. Exits 1 on any drift.
 *
 * Usage:
 *   GITHUB_TOKEN=<pat> GITHUB_REPOSITORY=owner/repo npx tsx scripts/verify-branch-protection.ts
 *   GITHUB_TOKEN=<pat> GITHUB_REPOSITORY=owner/repo npx tsx scripts/verify-branch-protection.ts --dry-run
 *
 * Required check names come from .github/required-checks.yml (contexts_from pointer).
 * Failure report is written to $GITHUB_STEP_SUMMARY when set, and always to stdout.
 *
 * contracts/branch-protection.contract.md §2, §9
 */

import { readFileSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { Octokit } from "@octokit/rest";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeclaredPullRequest {
  required_approving_review_count: number;
  dismiss_stale_reviews_on_push: boolean;
  require_code_owner_review: boolean;
  require_last_push_approval: boolean;
}

export interface DeclaredConfig {
  target: { ref: string };
  rules: {
    pull_request: DeclaredPullRequest;
    required_status_checks: {
      strict: boolean;
      contexts_from: string;
    };
    enforce_admins: boolean;
    block_force_pushes: boolean;
    block_deletions: boolean;
  };
}

export interface GitHubRule {
  type: string;
  parameters?: Record<string, unknown>;
}

export interface BypassActor {
  actor_id?: number;
  actor_type?: string;
  bypass_mode?: string;
}

export interface LiveRuleset {
  id: number;
  name: string;
  target?: string;
  enforcement?: string;
  conditions?: {
    ref_name?: {
      include?: string[];
      exclude?: string[];
    };
  };
  rules: GitHubRule[];
  bypass_actors?: BypassActor[];
}

export interface DriftEntry {
  rule: string;
  declared: string;
  live: string;
  action: string;
}

/** Injectable API call — swap out in tests to avoid real network calls. */
export type FetchRulesets = (owner: string, repo: string) => Promise<LiveRuleset[]>;

// ---------------------------------------------------------------------------
// Pure functions (exported for unit testing)
// ---------------------------------------------------------------------------

export function loadDeclaredConfig(rootDir: string): DeclaredConfig {
  const configPath = resolve(rootDir, ".github/branch-protection.yml");
  return parse(readFileSync(configPath, "utf-8")) as DeclaredConfig;
}

export function resolveChecks(declared: DeclaredConfig, rootDir: string): string[] {
  const checksPath = resolve(rootDir, declared.rules.required_status_checks.contexts_from);
  const raw = parse(readFileSync(checksPath, "utf-8")) as {
    version: number;
    checks: Array<{ name: string }>;
  };
  return raw.checks.map((c) => c.name);
}

export function verifyRuleset(
  declared: DeclaredConfig,
  resolvedChecks: string[],
  ruleset: LiveRuleset,
): DriftEntry[] {
  const drifts: DriftEntry[] = [];

  // --- pull_request rule ---
  const prRule = ruleset.rules.find((r) => r.type === "pull_request");
  if (!prRule) {
    drifts.push({
      rule: "pull_request",
      declared: "present",
      live: "missing",
      action: "Add pull_request rule to ruleset",
    });
  } else {
    const p = prRule.parameters ?? {};
    const d = declared.rules.pull_request;

    if (p.required_approving_review_count !== d.required_approving_review_count) {
      drifts.push({
        rule: "required_approving_review_count",
        declared: String(d.required_approving_review_count),
        live: String(p.required_approving_review_count ?? "missing"),
        action: `Set live to ${d.required_approving_review_count}`,
      });
    }

    if (p.dismiss_stale_reviews_on_push !== d.dismiss_stale_reviews_on_push) {
      drifts.push({
        rule: "dismiss_stale_reviews_on_push",
        declared: String(d.dismiss_stale_reviews_on_push),
        live: String(p.dismiss_stale_reviews_on_push ?? "missing"),
        action: `Set dismiss_stale_reviews_on_push to ${d.dismiss_stale_reviews_on_push}`,
      });
    }
  }

  // --- required_status_checks rule ---
  const rscRule = ruleset.rules.find((r) => r.type === "required_status_checks");
  if (!rscRule) {
    drifts.push({
      rule: "required_status_checks",
      declared: "present",
      live: "missing",
      action: "Add required_status_checks rule to ruleset",
    });
  } else {
    const p = rscRule.parameters ?? {};

    if (p.strict_required_status_checks_policy !== declared.rules.required_status_checks.strict) {
      drifts.push({
        rule: "required_status_checks.strict",
        declared: String(declared.rules.required_status_checks.strict),
        live: String(p.strict_required_status_checks_policy ?? "missing"),
        action: `Set strict_required_status_checks_policy to ${declared.rules.required_status_checks.strict}`,
      });
    }

    const liveChecks = (
      (p.required_status_checks as Array<{ context: string }> | undefined) ?? []
    ).map((c) => c.context);

    const missingFromLive = resolvedChecks.filter((c) => !liveChecks.includes(c));
    const extraInLive = liveChecks.filter((c) => !resolvedChecks.includes(c));

    if (missingFromLive.length > 0 || extraInLive.length > 0) {
      const action =
        missingFromLive.length > 0
          ? `Add missing checks to live ruleset: ${missingFromLive.join(", ")}`
          : `Remove undeclared checks from live ruleset: ${extraInLive.join(", ")}`;
      drifts.push({
        rule: "required_status_checks",
        declared: `{${resolvedChecks.join(", ")}}`,
        live: `{${liveChecks.join(", ")}}`,
        action,
      });
    }
  }

  // --- block_force_pushes (non_fast_forward rule) ---
  if (declared.rules.block_force_pushes) {
    const hasNff = ruleset.rules.some((r) => r.type === "non_fast_forward");
    if (!hasNff) {
      drifts.push({
        rule: "block_force_pushes",
        declared: "true",
        live: "missing non_fast_forward rule",
        action: "Add non_fast_forward rule to ruleset",
      });
    }
  }

  // --- block_deletions (deletion rule) ---
  if (declared.rules.block_deletions) {
    const hasDel = ruleset.rules.some((r) => r.type === "deletion");
    if (!hasDel) {
      drifts.push({
        rule: "block_deletions",
        declared: "true",
        live: "missing deletion rule",
        action: "Add deletion rule to ruleset",
      });
    }
  }

  // --- enforce_admins (no bypass actors with always/pull_request bypass) ---
  if (declared.rules.enforce_admins) {
    const adminBypass = (ruleset.bypass_actors ?? []).some(
      (a) => a.bypass_mode === "always" || a.bypass_mode === "pull_request",
    );
    if (adminBypass) {
      drifts.push({
        rule: "enforce_admins",
        declared: "true (no admin bypass)",
        live: "bypass actor(s) with always/pull_request bypass mode present",
        action: "Remove bypass actors or set bypass_mode to a restricted value",
      });
    }
  }

  return drifts;
}

export function formatReport(drifts: DriftEntry[]): string {
  if (drifts.length === 0) return "";

  const rows = drifts
    .map((d) => `| ${d.rule} | ${d.declared} | ${d.live} | ${d.action} |`)
    .join("\n");

  return [
    "## Branch protection drift on `main`",
    "",
    "| Rule | Declared | Live | Action |",
    "|---|---|---|---|",
    rows,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Orchestration — exported so CLI tests can inject a stub fetchRulesets
// ---------------------------------------------------------------------------

function defaultFetcher(token: string): FetchRulesets {
  const octokit = new Octokit({ auth: token });
  return async (owner, repo) => {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/rulesets", {
      owner,
      repo,
    });
    return data as unknown as LiveRuleset[];
  };
}

/**
 * Core verification logic. Returns the exit code (0 = clean, 1 = drift / error).
 * Never calls process.exit() itself — that's the CLI entry point's job.
 */
export async function runVerification(opts: {
  dryRun: boolean;
  token: string | undefined;
  repository: string | undefined;
  rootDir: string;
  /** Injected for testing; defaults to real Octokit call when omitted. */
  fetchRulesets?: FetchRulesets;
}): Promise<number> {
  const { dryRun, token, repository, rootDir } = opts;
  const exit = (code: number) => (dryRun ? 0 : code);

  if (!token) {
    process.stderr.write(
      "No GITHUB_TOKEN or BRANCH_PROTECTION_READ_TOKEN set.\n" +
        "To fix: add a fine-grained PAT with administration:read as the BRANCH_PROTECTION_READ_TOKEN secret.\n",
    );
    return exit(1);
  }

  if (!repository) {
    process.stderr.write("GITHUB_REPOSITORY env var is required (format: owner/repo).\n");
    return exit(1);
  }

  const [owner, repo] = repository.split("/");
  const declared = loadDeclaredConfig(rootDir);
  const resolvedChecks = resolveChecks(declared, rootDir);

  const fetcher = opts.fetchRulesets ?? defaultFetcher(token);

  let rulesets: LiveRuleset[];
  try {
    rulesets = await fetcher(owner, repo);
  } catch (err: unknown) {
    const status = (err as { status?: number }).status;
    if (status === 403 || status === 404) {
      process.stderr.write(
        "GitHub token lacks administration:read permission or repository not found.\n" +
          "To fix: configure an admin-read token as the BRANCH_PROTECTION_READ_TOKEN secret.\n",
      );
      return exit(1);
    }
    throw err;
  }

  const targetRef = declared.target.ref;
  const mainRuleset = rulesets.find((rs) =>
    rs.conditions?.ref_name?.include?.some(
      (ref) =>
        ref === `refs/heads/${targetRef}` ||
        ref === "~DEFAULT_BRANCH" ||
        ref === `~refs/heads/${targetRef}`,
    ),
  );

  if (!mainRuleset) {
    process.stderr.write(
      `No active ruleset found targeting '${targetRef}'.\n` +
        "Branch protection may not be configured yet.\n" +
        "See quickstart.md §5 for setup instructions.\n",
    );
    return exit(1);
  }

  const drifts = verifyRuleset(declared, resolvedChecks, mainRuleset);
  const report = formatReport(drifts);

  if (report) {
    process.stdout.write(report + "\n");
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
    }
    return exit(1);
  }

  process.stdout.write("✓ Branch protection on `main` matches declared configuration.\n");
  return 0;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const token = process.env.BRANCH_PROTECTION_READ_TOKEN ?? process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  const code = await runVerification({ dryRun, token, repository, rootDir: root });
  process.exit(code);
}

// Run only when this file is the CLI entry point (not when imported by tests)
const __filename = fileURLToPath(import.meta.url);
if (resolve(process.argv[1] ?? "") === resolve(__filename)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
