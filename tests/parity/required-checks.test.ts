/**
 * T043 – Required-checks parity
 *
 * Asserts that every check name in .github/required-checks.yml has a
 * corresponding job (matched via the job's `name:` field, or key if no name)
 * in one of the GitHub Actions workflow files.
 *
 * FR-019, data-model.md §3
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface RequiredCheck {
  name: string;
  description?: string;
}

interface RequiredChecksFile {
  version: number;
  checks: RequiredCheck[];
}

interface WorkflowJob {
  name?: string;
  [key: string]: unknown;
}

interface WorkflowFile {
  jobs?: Record<string, WorkflowJob>;
  [key: string]: unknown;
}

function loadRequiredChecks(): RequiredChecksFile {
  const path = resolve(ROOT, ".github/required-checks.yml");
  return parse(readFileSync(path, "utf-8")) as RequiredChecksFile;
}

function loadWorkflowJobNames(filename: string): string[] {
  const path = resolve(ROOT, ".github/workflows", filename);
  if (!existsSync(path)) return [];
  const workflow = parse(readFileSync(path, "utf-8")) as WorkflowFile;
  return Object.entries(workflow.jobs ?? {}).map(([key, job]) => job.name ?? key);
}

describe("Required checks parity (T043, FR-019)", () => {
  it(".github/required-checks.yml exists and is valid", () => {
    const path = resolve(ROOT, ".github/required-checks.yml");
    expect(existsSync(path), `${path} not found`).toBe(true);

    const config = loadRequiredChecks();
    expect(config.version).toBe(1);
    expect(Array.isArray(config.checks)).toBe(true);
    expect(config.checks.length).toBeGreaterThan(0);
  });

  it("all check names in required-checks.yml are unique", () => {
    const config = loadRequiredChecks();
    const names = config.checks.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every required check name matches a job name: in a workflow file", () => {
    const config = loadRequiredChecks();

    // Collect job display-names from all relevant workflow files
    const ciJobs = loadWorkflowJobNames("ci.yml");
    const bpJobs = loadWorkflowJobNames("branch-protection-check.yml");
    const allJobNames = new Set([...ciJobs, ...bpJobs]);

    const missing = config.checks
      .map((c) => c.name)
      .filter((name) => !allJobNames.has(name));

    expect(
      missing,
      `Required checks not found in any workflow job:\n  ${missing.join("\n  ")}\n` +
        `ci.yml jobs: ${ciJobs.join(", ")}\n` +
        `branch-protection-check.yml jobs: ${bpJobs.join(", ")}`,
    ).toHaveLength(0);
  });

  it(".github/workflows/ci.yml contains all non-branch-protection required checks", () => {
    const config = loadRequiredChecks();
    const ciJobs = new Set(loadWorkflowJobNames("ci.yml"));
    const expected = config.checks
      .map((c) => c.name)
      .filter((n) => n !== "branch-protection");

    const missing = expected.filter((n) => !ciJobs.has(n));
    expect(
      missing,
      `Checks expected in ci.yml but not found: ${missing.join(", ")}`,
    ).toHaveLength(0);
  });

  it(".github/workflows/branch-protection-check.yml contains the branch-protection job", () => {
    const bpJobs = loadWorkflowJobNames("branch-protection-check.yml");
    expect(bpJobs, "branch-protection job missing from branch-protection-check.yml").toContain(
      "branch-protection",
    );
  });
});
