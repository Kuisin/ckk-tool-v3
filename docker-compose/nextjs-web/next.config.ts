import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Emit a self-contained server bundle (.next/standalone) for a lean Docker image.
  output: "standalone",
  // pnpm workspace: 共有パッケージは TS ソースのまま取り込む（ビルドなし）。
  transpilePackages: ["@ckk/authz-core"],
  // monorepo ルートを明示 — standalone のトレース基点をリポジトリルートに固定。
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // PDF route handlers read HTML/CSS templates from src/pdf-templates at runtime;
  // file tracing can't see fs.readFile paths, so include them in the bundle.
  outputFileTracingIncludes: {
    "/api/pdf/**": ["src/pdf-templates/**/*"],
    // /docs reads the manual markdown from src/content/docs at runtime.
    "/docs/**": ["src/content/docs/**/*"],
    "/docs": ["src/content/docs/**/*"],
  },
};

export default nextConfig;
