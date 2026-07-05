// Vitest — unit tests (per _specs/techstack.md).
// Pure-logic tests only (pricing chain etc.) → node environment, no DOM.
// Run: pnpm test / single file: pnpm test -- src/path/file.test.ts

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
