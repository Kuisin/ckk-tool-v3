import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // NOTE: nextjs-web と違い standalone を使わない — WebSocket (/api/kiosk/ws)
  // のために独自サーバー (src/server.ts → dist/src/server.js) で起動するため。
  // ランタイムイメージは node_modules + .next + dist を持つ（Dockerfile 参照）。
  // pnpm workspace: 共有パッケージは TS ソースのまま取り込む（ビルドなし）。
  transpilePackages: ["@ckk/authz-core"],
  // デプロイ（Docker/Coolify）ビルドでは next build 内の型チェックを省く。
  // PR の CI が `pnpm build`（型チェック有効）で検証済み。なお `pnpm build` の
  // 後半 build:server（tsc → dist/src/server.js）は型チェックを兼ねるので、
  // サーバー側のコードはここをスキップしても常に tsc を通る。
  ...(process.env.NEXT_SKIP_TYPE_CHECK === "1"
    ? { typescript: { ignoreBuildErrors: true } }
    : {}),
};

export default nextConfig;
