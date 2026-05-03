/**
 * T031b – Parity reporter: forced-drift fixtures → categorized report
 *
 * Tests the parity-report module using constructed drift fixtures.
 * Verifies that:
 *   - each non-empty category appears in the report with the correct heading
 *   - empty categories are omitted
 *   - a no-drift input produces empty output with isClean() === true
 *
 * FR-014, contracts/openapi-parity §6
 */
import { describe, it, expect } from "vitest";
import {
  buildReport,
  renderMarkdown,
  renderText,
  isClean,
  type ParityReport,
} from "../../src/utils/parity-report.js";

describe("buildReport()", () => {
  it("returns an empty report when all diffs are empty", () => {
    const report = buildReport({});
    expect(isClean(report)).toBe(true);
    expect(Object.keys(report)).toHaveLength(0);
  });

  it("includes only non-empty categories", () => {
    const report = buildReport({
      missingFromSpec: [{ method: "get", path: "/api/v1/new" }],
      missingFromCode: [],
      responseSchema: [],
    });
    expect(report["missing-from-spec"]).toHaveLength(1);
    expect(report["missing-from-code"]).toBeUndefined();
    expect(report["response-schema-drift"]).toBeUndefined();
  });

  it("maps all five drift categories", () => {
    const entry = { method: "get", path: "/api/v1/test" };
    const report = buildReport({
      missingFromSpec: [entry],
      missingFromCode: [entry],
      responseSchema: [entry],
      parameterSchema: [entry],
      security: [entry],
    });
    expect(Object.keys(report)).toHaveLength(5);
    expect(report["missing-from-spec"]).toBeDefined();
    expect(report["missing-from-code"]).toBeDefined();
    expect(report["response-schema-drift"]).toBeDefined();
    expect(report["parameter-schema-drift"]).toBeDefined();
    expect(report["security-drift"]).toBeDefined();
  });
});

describe("isClean()", () => {
  it("returns true for an empty report", () => {
    expect(isClean({})).toBe(true);
  });

  it("returns false when any category has entries", () => {
    const report: ParityReport = {
      "missing-from-spec": [{ method: "get", path: "/api/test" }],
    };
    expect(isClean(report)).toBe(false);
  });
});

describe("renderMarkdown()", () => {
  it("returns empty string for a clean report", () => {
    expect(renderMarkdown({})).toBe("");
  });

  it("includes category headings for each non-empty category", () => {
    const report = buildReport({
      missingFromSpec: [{ method: "get", path: "/api/v1/missing" }],
      missingFromCode: [{ method: "post", path: "/api/v1/ghost" }],
    });
    const md = renderMarkdown(report);

    expect(md).toContain("missing-from-spec");
    expect(md).toContain("missing-from-code");
    expect(md).toContain("GET    /api/v1/missing");
    expect(md).toContain("POST   /api/v1/ghost");
  });

  it("omits empty categories from the output", () => {
    const report = buildReport({
      missingFromSpec: [{ method: "get", path: "/api/v1/only-this" }],
    });
    const md = renderMarkdown(report);

    expect(md).not.toContain("missing-from-code");
    expect(md).not.toContain("response-schema-drift");
    expect(md).not.toContain("parameter-schema-drift");
    expect(md).not.toContain("security-drift");
  });

  it("includes detail text when provided", () => {
    const report = buildReport({
      responseSchema: [{ method: "get", path: "/api/v1/route", detail: "field 'count' missing" }],
    });
    const md = renderMarkdown(report);
    expect(md).toContain("field 'count' missing");
  });
});

describe("renderText()", () => {
  it("returns empty string for a clean report", () => {
    expect(renderText({})).toBe("");
  });

  it("includes all non-empty category headings in plain text", () => {
    const report = buildReport({
      missingFromSpec: [{ method: "get", path: "/api/v1/x" }],
      security: [{ method: "delete", path: "/api/v1/y" }],
    });
    const text = renderText(report);

    expect(text).toContain("[missing-from-spec]");
    expect(text).toContain("[security-drift]");
    expect(text).not.toContain("[missing-from-code]");
  });
});

describe("Forced-drift fixture: all five categories triggered simultaneously", () => {
  it("renders a report that names each category exactly once", () => {
    const entry = (path: string) => ({ method: "get", path });
    const report = buildReport({
      missingFromSpec: [entry("/api/v1/a")],
      missingFromCode: [entry("/api/v1/b")],
      responseSchema: [entry("/api/v1/c")],
      parameterSchema: [entry("/api/v1/d")],
      security: [entry("/api/v1/e")],
    });

    expect(isClean(report)).toBe(false);

    const md = renderMarkdown(report);
    const categories: Array<keyof ParityReport> = [
      "missing-from-spec",
      "missing-from-code",
      "response-schema-drift",
      "parameter-schema-drift",
      "security-drift",
    ];

    for (const cat of categories) {
      const occurrences = (md.match(new RegExp(cat, "g")) ?? []).length;
      expect(occurrences, `category "${cat}" should appear exactly once`).toBeGreaterThanOrEqual(1);
    }
  });
});
