/**
 * POST /api/intake/queue — 取込済み（IMPORT）の注文請書をまとめて抽出待ちへ積む。
 *
 * 優先取込の 2 段目。画面は選んだファイルを先に全部 `/api/intake/upload?defer`
 * で送り（＝一覧に全行が並ぶ）、そのあと採番された番号をここへ渡して抽出を
 * 開始する。抽出は lib/intake の待ち行列が同時実行数を守りながら流すので、
 * ここは**積むだけで即返る**（数十 ms）。
 *
 * 本文: { numbers: string[] }（ORD-YYYYMM-NNNNN。最大 200 件）。
 * 応答: { ok: true, queued, skipped, pending }
 *   queued  = 積んだ件数 / skipped = 対象外だった番号（未存在・IMPORT でない・
 *   原本なし・スコープ外）/ pending = 現在の抽出待ち件数。
 * 入力不正は { ok: false, error }（400）。
 */

import { rowInScope } from "@ckk/authz-core";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { parseDocKey } from "@/lib/doc-number";
import { enqueueExtraction } from "@/lib/intake";

export const dynamic = "force-dynamic";

/** 1 回で積める上限（画面の 1 バッチ分。無制限にしない）。 */
const MAX_NUMBERS = 200;

function badRequest(error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export async function POST(request: Request): Promise<Response> {
  // 取込の続き（採番済み行の抽出開始）なので upload と同じ権限で見る。
  const authz = await checkPermission("order_acceptance", "CREATE");
  if (!authz.ok) {
    const status = authz.error.startsWith("ログイン") ? 401 : 403;
    return NextResponse.json({ ok: false, error: authz.error }, { status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("JSON で送信してください");
  }
  const raw = (body as { numbers?: unknown } | null)?.numbers;
  if (!Array.isArray(raw) || raw.length === 0) {
    return badRequest("numbers を指定してください");
  }
  if (raw.length > MAX_NUMBERS) {
    return badRequest(`一度に指定できるのは ${MAX_NUMBERS} 件までです`);
  }

  const skipped: string[] = [];
  const keys = new Map<string, { yearMonth: string; seq: number }>();
  for (const value of raw) {
    const number = typeof value === "string" ? value.trim() : "";
    const key = number ? parseDocKey(number, "ORD") : null;
    if (!key) {
      if (number) skipped.push(number);
      continue;
    }
    keys.set(number, key);
  }
  if (keys.size === 0) return badRequest("注文請書番号が不正です");

  const rows = await prisma.orderAcceptance.findMany({
    where: { OR: [...keys.values()] },
    select: {
      yearMonth: true,
      seq: true,
      status: true,
      sourceFileId: true,
      createdBy: true,
    },
  });
  const byKey = new Map(rows.map((r) => [`${r.yearMonth}-${r.seq}`, r]));

  let queued = 0;
  let pending = 0;
  for (const [number, key] of keys) {
    const row = byKey.get(`${key.yearMonth}-${key.seq}`);
    // 抽出できるのは「原本つきの取込中」だけ — 手入力や抽出済みは触らない。
    if (!row || row.status !== "IMPORT" || !row.sourceFileId) {
      skipped.push(number);
      continue;
    }
    // OWN スコープの利用者は自分が取り込んだ行だけ（ALL は素通し）。
    if (!rowInScope(authz.access, { createdBy: row.createdBy }, authz.userId)) {
      skipped.push(number);
      continue;
    }
    pending = enqueueExtraction(key);
    queued += 1;
  }

  if (queued > 0) revalidatePath("/sales/order-acceptances");
  return NextResponse.json({ ok: true, queued, skipped, pending });
}
