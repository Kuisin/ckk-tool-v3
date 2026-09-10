/**
 * GET /api/v1/products — 製品マスタの一覧（keyset + 差分同期）。
 *
 * 権限は `master:READ`。`?includeInactive=1` で無効も含める。
 *
 * 素材は「材種 + 直径 + 全長」で指定する設計なので、特定の素材行ではなく
 * その 3 つを返す（`materialId` は廃止予定の旧列で、返さない）。
 */

import { requireApiPermission } from "@/lib/api-authz";
import { iso, localizedJson, num } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";
import { formatProductNumber } from "@/lib/doc-number";

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
      prisma.product.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          yearMonth: true,
          seq: true,
          legacyKey: true,
          name: true,
          materialTypeId: true,
          diameterMm: true,
          lengthMm: true,
          unit: true,
          spec: true,
          matchNames: true,
          isActive: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    query,
    tiebreak: "id",
    toCursor: (r) => ({
      kind: "id",
      id: String(r.id),
      t: r.updatedAt.toISOString(),
    }),
    toDto: (r) => ({
      id: r.id,
      number: formatProductNumber(r.yearMonth, r.seq),
      legacyKey: r.legacyKey,
      name: localizedJson(r.name),
      materialTypeId: r.materialTypeId,
      diameterMm: num(r.diameterMm),
      lengthMm: num(r.lengthMm),
      unit: r.unit,
      /** 仕様は自由構造（多言語ではない）。そのまま通す。 */
      spec: r.spec ?? null,
      matchNames: r.matchNames,
      isActive: r.isActive,
      notes: r.notes,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
