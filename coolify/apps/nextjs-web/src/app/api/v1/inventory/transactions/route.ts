/**
 * GET /api/v1/inventory/transactions — 在庫取引の一覧（不変の台帳）。
 *
 * 権限は `inventory:READ`。
 *
 * ★ **この口だけ順序キーが `created_at`。** 在庫取引は増減の唯一の記録で
 * 追記しかされない（更新も削除もされない）ので、`updated_at` を持たないのが
 * 正しい。追記専用なら `(created_at, id)` の keyset で過不足なく追える。
 * したがって `?updatedSince=` も **created_at に対して**効く。
 *
 * 行スコープは掛けられない — 在庫行への参照が
 * `(inventory_type, inventory_id)` の多態で FK が無く、拠点まで辿れない。
 * `inventory:READ` を与えるかどうかで閉じる（画面も同じ）。
 */

import { requireApiPermission } from "@/lib/api-authz";
import { iso, num } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";
import { docRefCompany, docRefNumber } from "@/lib/doc-ref-core";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiPermission(request, "inventory", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));

  return runList({
    baseWhere: {},
    orderField: "createdAt",
    fetch: ({ where, take, orderBy }) =>
      prisma.inventoryTransaction.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          inventoryType: true,
          inventoryId: true,
          transactionType: true,
          quantity: true,
          referenceType: true,
          referenceId: true,
          notes: true,
          createdAt: true,
        },
      }),
    query,
    tiebreak: "id",
    toCursor: (r) => ({ kind: "id", id: r.id, t: r.createdAt.toISOString() }),
    toDto: (r) => ({
      id: r.id,
      inventoryType: r.inventoryType,
      inventoryId: r.inventoryId,
      transactionType: r.transactionType,
      quantity: num(r.quantity),
      referenceType: r.referenceType,
      // 書類を指す参照は法人コード付きで保存している — API は番号で返す
      // （契約を変えない）。
      referenceId:
        r.referenceId &&
        (r.referenceType === "delivery_order" ||
          r.referenceType === "stock_take")
          ? docRefNumber(r.referenceId)
          : r.referenceId,
      // 番号は法人ごとの連番なので、書類を指す参照には法人コードを添える
      // （書類でない参照 — uuid・ロット番号 — では null）。
      referenceCompanyCode:
        r.referenceId &&
        (r.referenceType === "delivery_order" ||
          r.referenceType === "stock_take")
          ? docRefCompany(r.referenceId)
          : null,
      notes: r.notes,
      createdAt: iso(r.createdAt),
    }),
  });
}
