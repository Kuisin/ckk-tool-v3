// Vitest — unit tests (per _specs/techstack.md).
// Pure-logic tests only (pricing chain etc.) → node environment, no DOM.
// Run: pnpm test / single file: pnpm test -- src/path/file.test.ts

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` は Next のバンドラ用の印で実体が無い。server-only な
      // モジュール（lib/intake-folder 等）を素の node で読めるよう空に差し替える。
      "server-only": path.resolve(__dirname, "test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
