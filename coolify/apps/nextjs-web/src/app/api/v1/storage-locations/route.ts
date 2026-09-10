/**
 * GET /api/v1/storage-locations — 保管場所の一覧（keyset + 差分同期）。
 *
 * 権限は **`master:READ`**（`inventory` ではない — 画面 MS0E がマスタ側に
 * あるため。`lib/app-list.ts` の requiredPermission と揃えている）。
 * 拠点に属するが、マスタなので行スコープは掛けない（どの拠点の棚が在るかは
 * 業務上ひらけた情報）。
 */

import { requireApiPermission } from "@/lib/api-authz";
import { iso, localizedJson } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiPermission(request, "master", "READ");
  if (!gate.ok) return gate.response;

  const query = parseListQuery(request);
  if (query.badCursor) return invalidCursorResponse(instanceOf(request));

  const p = new URL(request.url).searchParams;
  const includeInactive =
    p.get("includeInactive") === "1" || p.get("includeInactive") === "true";

  return runList({
    baseWhere: includeInactive ? {} : { isActive: true },
    fetch: ({ where, take, orderBy }) =>
      prisma.storageLocation.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          plantId: true,
          code: true,
          name: true,
          sortOrder: true,
          isActive: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          shelves: {
            orderBy: { code: "asc" },
            select: { id: true, code: true, name: true, isActive: true },
          },
        },
      }),
    query,
    tiebreak: "id",
    toCursor: (r) => ({
      kind: "id",
      id: r.id,
      t: r.updatedAt.toISOString(),
    }),
    toDto: (r) => ({
      id: r.id,
      plantId: r.plantId,
      code: r.code,
      name: localizedJson(r.name),
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      notes: r.notes,
      // 棚は時刻列を持たないので、保管場所の子として出す（単独の差分同期は無い）。
      shelves: r.shelves.map((s) => ({
        id: s.id,
        code: s.code,
        name: localizedJson(s.name),
        isActive: s.isActive,
      })),
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
