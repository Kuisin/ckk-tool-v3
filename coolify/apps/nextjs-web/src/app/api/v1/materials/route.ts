/**
 * GET /api/v1/materials — 素材マスタの一覧（keyset + 差分同期）。
 *
 * 権限は `master:READ`。`?includeInactive=1` で無効も含める。
 * 素材コード（`code`）が業務上の識別子で、仕入先の書類にも印字される。
 *
 * ## `id` は **`items.id`**（2026-09-20 の切り替え）
 *
 * 製品・素材は 1 つの品目マスタ `app.items` になった。URL も項目名もそのままで、
 * `id` の値だけが `materials.id` から `items.id` へ変わっている（`_specs/api.md`
 * §6.1）。連番同士なので**古い id は黙って別の素材を指す** — 切り替え前の
 * カーソルも同じ理由でずれるので、全件同期からやり直すこと。
 * 照合し直すときは `code`（素材コード）が唯一安定した鍵。
 *
 * 絞り込みは `itemType: "MATERIAL"` — この口は製品を混ぜない。
 */

import { requireApiPermission } from "@/lib/api-authz";
import { iso, localizedJson, num } from "@/lib/api-dto";
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
    baseWhere: {
      itemType: "MATERIAL",
      ...(includeInactive ? {} : { isActive: true }),
    },
    fetch: ({ where, take, orderBy }) =>
      prisma.item.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          code: true,
          materialTypeId: true,
          surfaceFinishCode: true,
          diameterCode: true,
          lengthVariantCode: true,
          kindCode: true,
          diameterMm: true,
          lengthMm: true,
          manufacturerModel: true,
          nominalDiameterMm: true,
          name: true,
          unit: true,
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
      id: r.id,
      t: r.updatedAt.toISOString(),
    }),
    toDto: (r) => ({
      id: r.id,
      code: r.code,
      materialTypeId: r.materialTypeId,
      surfaceFinishCode: r.surfaceFinishCode,
      diameterCode: r.diameterCode,
      lengthVariantCode: r.lengthVariantCode,
      kindCode: r.kindCode,
      diameterMm: num(r.diameterMm),
      lengthMm: num(r.lengthMm),
      manufacturerModel: r.manufacturerModel,
      nominalDiameterMm: num(r.nominalDiameterMm),
      name: localizedJson(r.name),
      unit: r.unit,
      matchNames: r.matchNames,
      isActive: r.isActive,
      notes: r.notes,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
