import type { NextConfig } from "next";

/**
 * セキュリティ応答ヘッダ（監査 M2）。nextjs-web と同じ考え方（あちらの
 * next.config.ts のコメント参照）。違いは 2 点:
 *   - frame-src は絞らない — 管理ディスプレイ（/display）は任意 URL・Metabase の
 *     署名済み埋め込みを iframe で映す
 *   - connect-src に ws: / wss: — 端末プレゼンスの WebSocket（/api/kiosk/ws）
 * CSP は Report-Only（QR スキャナ・3D ビューアの挙動を壊さないため）。
 * カメラは QR 読み取りに要るので Permissions-Policy で止めない。
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  {
    key: "Permissions-Policy",
    value: "microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' ws: wss:",
      "frame-src *",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "worker-src 'self' blob:",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
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
