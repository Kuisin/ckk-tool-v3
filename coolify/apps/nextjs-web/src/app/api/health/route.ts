/**
 * GET /api/health — コンテナの readiness（Coolify の healthcheck 先）。
 *
 * **このイメージが前提にしているマイグレーションが当たるまで 503 を返す。**
 * Coolify は healthy になるまで新しいコンテナを公開しないので、
 *   - マイグレーションが先 → 即 200（古い列しか使わないので元から安全）
 *   - デプロイが先 → migrator が当たるまで 503 → 当たった瞬間に 200
 * となり、**どちらの順序で来ても 500 を出さない**。待っているあいだは旧
 * コンテナが serving を続けるので無停止。
 *
 * 認証は掛けない（proxy.ts の matcher から除外済み）。**返すのは status と
 * 足りないマイグレーションの件数だけ**（監査 L6）— 以前はマイグレーション名と
 * DB エラー文まで返していて、未認証でスキーマの歴史と DB の状態が読めた。
 * 名前が要る調査はコンテナのログ（下の console.warn）で見る。
 */

import { NextResponse } from "next/server";
import { checkSchemaReadiness } from "@/lib/schema-readiness";

// DB を毎回見る（キャッシュされると healthcheck の意味が無くなる）。
export const dynamic = "force-dynamic";
// _prisma_migrations を引くので Node ランタイムが要る。
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const readiness = await checkSchemaReadiness();
  if (!readiness.ready) {
    console.warn(
      `[health] not ready: missing=${readiness.missing.join(",") || "-"} error=${readiness.error ?? "-"}`,
    );
  }
  return NextResponse.json(
    {
      status: readiness.ready ? "ok" : "migrating",
      ready: readiness.ready,
      missingCount: readiness.missing.length,
    },
    {
      status: readiness.ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
