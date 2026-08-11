import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // NOTE: nextjs-web と違い standalone を使わない — WebSocket (/api/kiosk/ws)
  // のために独自サーバー (src/server.ts → dist/src/server.js) で起動するため。
  // ランタイムイメージは node_modules + .next + dist を持つ（Dockerfile 参照）。
};

export default nextConfig;
