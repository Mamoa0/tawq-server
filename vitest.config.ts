import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/helpers/setup.ts"],
    coverage: {
      provider: "v8",
      exclude: [
        "node_modules/",
        "tests/",
        "src/scripts/",
        "dist/",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
    },
    testTimeout: 60000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
