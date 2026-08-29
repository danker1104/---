import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    globals: true,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    environment: "jsdom",
    include: [
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
      "app/**/*.test.tsx",
      "components/**/*.test.tsx",
    ],
    exclude: ["node_modules", "tests/e2e/**", "tests/integration/**"],
  },
});
