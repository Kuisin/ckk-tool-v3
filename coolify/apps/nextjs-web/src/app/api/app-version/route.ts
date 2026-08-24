import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * GET /api/app-version — 現在動いているビルドの識別子を返す。
 *
 * デプロイ（Coolify の再ビルド）を跨いで開きっぱなしのタブは、古い JS の
 * Server Action id を POST して 404 になる（画面上は「押しても何も起きない /
 * 読み込みが終わらない」ように見える）。クライアントの VersionSkewBanner が
 * この値を定期取得し、変わったら「再読み込みしてください」を出すための口。
 *
 * BUILD_ID は next build が生成する（standalone イメージでは .next/BUILD_ID）。
 * dev サーバーには無いので "development" を返す（= スキューは起きない）。
 */

export const dynamic = "force-dynamic";

let cached: string | null = null;

async function buildId(): Promise<string> {
  if (cached) return cached;
  try {
    cached = (
      await readFile(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8")
    ).trim();
  } catch {
    cached = "development";
  }
  return cached;
}

export async function GET() {
  return Response.json(
    { buildId: await buildId() },
    { headers: { "cache-control": "no-store" } },
  );
}
