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
 * 認証は掛けない（proxy.ts の matcher から除外済み）。返すのは適用状況だけで
 * 業務データは含めない。
 */

import { NextResponse } from "next/server";
import { checkSchemaReadiness } from "@/lib/schema-readiness";

// DB を毎回見る（キャッシュされると healthcheck の意味が無くなる）。
export const dynamic = "force-dynamic";
// _prisma_migrations を引くので Node ランタイムが要る。
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const readiness = await checkSchemaReadiness();
  return NextResponse.json(
    {
      status: readiness.ready ? "ok" : "migrating",
      ...readiness,
    },
    {
      status: readiness.ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
