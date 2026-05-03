import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression guard for T040 (the type-provider migration).
 *
 * The manual dual-registration pattern in `src/docs/routes.ts` was the
 * primary source of OpenAPI ↔ Fastify drift before this feature. The file
 * was deleted as part of the migration. If anyone re-introduces it (or any
 * function exports from it), this test fails — forcing a conscious decision
 * rather than silently re-creating the drift surface.
 *
 * See specs/002-reviewable-honest-api/research.md R1 and tasks.md T040/T058.
 */
describe("no-registerRoutes regression guard", () => {
  const docsRoutesPath = resolve(process.cwd(), "src/docs/routes.ts");

  it("src/docs/routes.ts does not exist, OR exports no functions", async () => {
    if (!existsSync(docsRoutesPath)) {
      // Preferred state: file is gone.
      expect(existsSync(docsRoutesPath)).toBe(false);
      return;
    }

    // File exists — its public exports must contain no callables.
    const mod = await import(docsRoutesPath);
    const callableExports = Object.entries(mod).filter(
      ([, value]) => typeof value === "function",
    );

    expect(
      callableExports,
      `src/docs/routes.ts must not export any functions (found: ${callableExports
        .map(([k]) => k)
        .join(", ")}). The manual registerRoutes() pattern was removed by T040; route+spec registration now flows exclusively through fastify-type-provider-zod.`,
    ).toEqual([]);
  });
});
