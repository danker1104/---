import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    globals: true,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["node_modules", "tests/e2e/**"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
