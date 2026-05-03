/**
 * Parity reporter for the openapi-parity CI job.
 *
 * Accepts diff objects from T028–T031 collectors and emits:
 *   (a) a Markdown block for $GITHUB_STEP_SUMMARY
 *   (b) a plain-text block for stdout
 *
 * Exit code of the parity CI job is non-zero whenever the reporter
 * returns any non-empty category (FR-014, contracts/openapi-parity §6).
 */

export type ParityDriftEntry = {
  method: string;
  path: string;
  detail?: string;
};

export type ParityReport = {
  "missing-from-spec"?: ParityDriftEntry[];
  "missing-from-code"?: ParityDriftEntry[];
  "response-schema-drift"?: ParityDriftEntry[];
  "parameter-schema-drift"?: ParityDriftEntry[];
  "security-drift"?: ParityDriftEntry[];
};

const CATEGORY_LABELS: Record<keyof ParityReport, string> = {
  "missing-from-spec": "Missing from spec (route exists in Fastify but not in /openapi.json)",
  "missing-from-code": "Missing from code (spec declares route not registered in Fastify)",
  "response-schema-drift": "Response schema drift",
  "parameter-schema-drift": "Parameter schema drift",
  "security-drift": "Security declaration drift",
};

function formatEntry(entry: ParityDriftEntry): string {
  const base = `${entry.method.toUpperCase().padEnd(7)}${entry.path}`;
  return entry.detail ? `${base}  →  ${entry.detail}` : base;
}

/** Returns true when there are no drift entries in any category. */
export function isClean(report: ParityReport): boolean {
  return Object.values(report).every((entries) => !entries || entries.length === 0);
}

/** Render as Markdown for GitHub Actions job summary. */
export function renderMarkdown(report: ParityReport): string {
  if (isClean(report)) return "";

  const lines: string[] = ["## OpenAPI Parity Failures\n"];

  for (const [category, entries] of Object.entries(report) as [keyof ParityReport, ParityDriftEntry[] | undefined][]) {
    if (!entries || entries.length === 0) continue;
    lines.push(`### \`${category}\``);
    lines.push(CATEGORY_LABELS[category]);
    lines.push("");
    for (const entry of entries) {
      lines.push(`- \`${formatEntry(entry)}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/** Render as plain text for stdout. */
export function renderText(report: ParityReport): string {
  if (isClean(report)) return "";

  const lines: string[] = ["OpenAPI Parity Failures:", ""];

  for (const [category, entries] of Object.entries(report) as [keyof ParityReport, ParityDriftEntry[] | undefined][]) {
    if (!entries || entries.length === 0) continue;
    lines.push(`[${category}]`);
    lines.push(CATEGORY_LABELS[category]);
    for (const entry of entries) {
      lines.push(`  ${formatEntry(entry)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build a ParityReport from separate per-category diff arrays.
 * Empty arrays produce no entry in the report (omitted categories are clean).
 */
export function buildReport(diffs: {
  missingFromSpec?: ParityDriftEntry[];
  missingFromCode?: ParityDriftEntry[];
  responseSchema?: ParityDriftEntry[];
  parameterSchema?: ParityDriftEntry[];
  security?: ParityDriftEntry[];
}): ParityReport {
  const report: ParityReport = {};

  if (diffs.missingFromSpec?.length) report["missing-from-spec"] = diffs.missingFromSpec;
  if (diffs.missingFromCode?.length) report["missing-from-code"] = diffs.missingFromCode;
  if (diffs.responseSchema?.length) report["response-schema-drift"] = diffs.responseSchema;
  if (diffs.parameterSchema?.length) report["parameter-schema-drift"] = diffs.parameterSchema;
  if (diffs.security?.length) report["security-drift"] = diffs.security;

  return report;
}
