/**
 * GET /api/master/inspection-templates/export[?ids=1,2]
 *   → 検査表テンプレートを JSON ファイルとして書き出す。
 *
 * Server Action ではなく Route Handler なのは、**ファイルとして落とす**ため
 * （Content-Disposition を付けたい / ブラウザに保存させたい）。
 * 権限・DB は lib/inspection-template-port.ts。
 */

import { NextResponse } from "next/server";
import { exportTemplates } from "@/lib/inspection-template-port";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const raw = new URL(request.url).searchParams.get("ids");
  const ids = (raw ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  const result = await exportTemplates(ids);
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return new NextResponse(JSON.stringify(result.data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="inspection-templates-${stamp}.json"`,
      "cache-control": "no-store",
    },
  });
}
