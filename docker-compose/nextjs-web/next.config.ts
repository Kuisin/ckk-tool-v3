import path from "node:path";
import { createMDX } from "fumadocs-mdx/next";
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
  // (docs content needs no entry — fumadocs-mdx compiles it at build time.)
  outputFileTracingIncludes: {
    "/api/pdf/**": ["src/pdf-templates/**/*"],
  },
  async redirects() {
    return [
      // 旧 /docs（?lang= クエリ方式）→ 新 /manual・/internal-docs（ロケール
      // セグメント方式）。スラッグは維持。system/* だけ社内ツリーへ。
      ...(["en", "zh"] as const).flatMap((lang) => [
        {
          source: "/docs/system/:path*",
          has: [{ type: "query", key: "lang", value: lang } as const],
          destination: `/internal-docs/${lang}/system/:path*`,
          permanent: true,
        },
        {
          source: "/docs/:path*",
          has: [{ type: "query", key: "lang", value: lang } as const],
          destination: `/manual/${lang}/:path*`,
          permanent: true,
        },
      ]),
      {
        source: "/docs/system/:path*",
        destination: "/internal-docs/ja/system/:path*",
        permanent: true,
      },
      {
        source: "/docs/:path*",
        destination: "/manual/ja/:path*",
        permanent: true,
      },
      { source: "/docs", destination: "/manual/ja", permanent: true },
      { source: "/manual", destination: "/manual/ja", permanent: true },
      {
        source: "/internal-docs",
        destination: "/internal-docs/ja",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      // 公開マニュアルの生 Markdown: /manual/<lang>/<slug>.md → llms-manual ルート。
      { source: "/manual/:path*.md", destination: "/llms-manual/:path*" },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
