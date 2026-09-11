/**
 * GET /api/v1/deletions?sinceEventId= — 消えた行の通知。
 *
 * ■ なぜ別の口が要るのか
 *
 * 行の物理削除は `updated_at` を動かさないし、痕跡も残さない。だから
 * `?updatedSince=` の差分同期からは**構造的に見えない**。連携先の側では
 * 「いつまでも残り続ける行」になる。
 *
 * ■ 出どころは `audit_logs`
 *
 * `id` が単調増加の BigInt なので、そのままカーソルになる（時刻ではないので
 * 精度の問題も起きない）。**`?sinceEventId=` で前回の `lastEventId` を渡す。**
 *
 * ■ 正直に言っておくべき限界（`_specs/api.md` §5.3）
 *
 * アプリ内で物理削除されるのは**下書きの出荷書だけ**（`deleteDeliveryOrder`）で、
 * それは監査行を書くのでここに出る。ほかの「消えた」は状態で表す
 * （`order_lines.cancelled_at` / マスタの `is_active`）ので、そちらは
 * 通常の差分同期に更新として届く。
 *
 * **psql から直に消した行は、ここにも出ない。** 監査行が書かれないため。
 * 復旧やデータ修正でそれをやったときは、連携先に全件同期をしてもらうしかない。
 *
 * 権限は要求した資源のものを見ない — **`READ` を 1 つでも持っていれば
 * 引ける**わけではなく、削除された書類の種別ごとに権限を確かめる。
 * 単純化のため、ここでは「その表を読める権限」を持つ種別だけに絞って返す。
 */

import { apiEffectivePermissions, requireApiAuth } from "@/lib/api-authz";
import { invalidCursorResponse } from "@/lib/api-list";
import { parseLimit } from "@/lib/api-pagination-core";
import { instanceOf } from "@/lib/api-problem";
import { jsonOk } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 監査の表名 → それを読むのに要る権限コード。
 * **ここに無い表は返さない**（権限を確かめられないものを漏らさない）。
 */
const TABLE_PERMISSION: Record<string, string> = {
  order_acceptances: "order_acceptance",
  order_lines: "order_acceptance",
  work_orders: "work_order",
  quotes: "quote",
  delivery_orders: "delivery_order",
  delivery_notes: "delivery_note",
  invoices: "invoice",
  billing_closings: "billing_closing",
  business_partners: "master",
  products: "master",
  materials: "master",
  material_types: "master",
  plants: "master",
  storage_locations: "master",
};

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiAuth(request);
  if (!gate.ok) return gate.response;

  const p = new URL(request.url).searchParams;
  const raw = p.get("sinceEventId");
  // tsconfig の target が ES2020 未満なので BigInt リテラル（0n）は書けない。
  let since = BigInt(0);
  if (raw) {
    try {
      since = BigInt(raw);
      if (since < BigInt(0)) throw new Error("negative");
    } catch {
      return invalidCursorResponse(instanceOf(request));
    }
  }
  const limit = parseLimit(p.get("limit"));

  // 呼び出し元が読める種別だけに絞る（権限を持たない削除は存在ごと見せない）。
  const perms = await apiEffectivePermissions(gate.ctx.userId);
  const readable = new Set(perms.codes);
  const tables = Object.entries(TABLE_PERMISSION)
    .filter(([, code]) => perms.superuser || readable.has(code))
    .map(([table]) => table);

  if (tables.length === 0) {
    return jsonOk({ data: [], lastEventId: String(since), hasMore: false });
  }

  const rows = await prisma.auditLog.findMany({
    where: { action: "DELETE", id: { gt: since }, tableName: { in: tables } },
    orderBy: { id: "asc" },
    take: limit + 1,
    select: {
      id: true,
      tableName: true,
      recordId: true,
      recordKey: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const lastEventId = data.at(-1)?.id ?? since;

  return jsonOk({
    data: data.map((r) => ({
      eventId: String(r.id),
      resource: r.tableName,
      /** 表示番号（`DOR-202609-00003` など）。採番リセットで再利用されうる。 */
      number: r.recordId,
      /** 表の主キー。番号の再利用と区別したいときはこちらを見る。 */
      key: r.recordKey,
      deletedAt: r.createdAt.toISOString(),
    })),
    lastEventId: String(lastEventId),
    hasMore,
  });
}
