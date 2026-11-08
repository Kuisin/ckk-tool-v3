/**
 * GET /api/v1/products — 製品マスタの一覧（keyset + 差分同期）。
 *
 * 権限は `master:READ`。`?includeInactive=1` で無効も含める。
 *
 * 素材は「材種 + 直径 + 全長」で指定する設計なので、特定の素材行ではなく
 * その 3 つを返す（`materialId` は廃止予定の旧列で、返さない）。
 *
 * ## 仕様（materialTypeId / diameterMm / lengthMm / spec）は設計図の版から
 *
 * 項目名は据え置き（外部契約）だが、値は**設計図の確定済みの版**から読む
 * （lib/design-spec.ts resolveItemSpecs — 汎用の最新版 → 最後に確定した版）。
 * 版が確定すると製品の `updated_at` も進めるので（lib/design-files.ts
 * confirmVersionInTx）、差分同期で仕様の変化を取りこぼさない。
 *
 * ## `id` は **`items.id`**（2026-09-20 の切り替え）
 *
 * 製品・素材は 1 つの品目マスタ `app.items` に統合された。この口は
 * **URL も項目名もそのまま**で、`id` の値だけが `products.id` から
 * `items.id` に変わっている（利用者判断の clean break — `_specs/api.md` §6.1）。
 * どちらも連番なので**古い id は必ず何かに当たる**（見つからないのではなく
 * 黙って別の製品を指す）。切り替え前に発行したカーソルも同じ理由で
 * 位置がずれるので、切り替えをまたぐときは全件同期からやり直すこと。
 *
 * 絞り込みは `itemType: "PRODUCT"` — この口は素材を混ぜない。
 */

import { requireApiPermission } from "@/lib/api-authz";
import { iso, localizedJson } from "@/lib/api-dto";
import { invalidCursorResponse, parseListQuery, runList } from "@/lib/api-list";
import { instanceOf } from "@/lib/api-problem";
import { prisma } from "@/lib/db";
import { resolveItemSpecs } from "@/lib/design-spec";
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
    baseWhere: {
      itemType: "PRODUCT",
      ...(includeInactive ? {} : { isActive: true }),
    },
    fetch: async ({ where, take, orderBy }) => {
      const rows = await prisma.item.findMany({
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
          unit: true,
          matchNames: true,
          isActive: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const specs = await resolveItemSpecs(rows.map((r) => r.id));
      return rows.map((r) => ({ ...r, designSpec: specs.get(r.id) ?? null }));
    },
    query,
    tiebreak: "id",
    toCursor: (r) => ({
      kind: "id",
      id: r.id,
      t: r.updatedAt.toISOString(),
    }),
    toDto: (r) => ({
      id: r.id,
      number: formatProductNumber(r.yearMonth, r.seq),
      legacyKey: r.legacyKey,
      name: localizedJson(r.name),
      // 項目名は従来のまま（外部契約）。中身は設計図の確定済みの版の仕様。
      materialTypeId: r.designSpec?.materialTypeId ?? null,
      diameterMm: r.designSpec?.diameterMm ?? null,
      lengthMm: r.designSpec?.lengthMm ?? null,
      unit: r.unit,
      /** 仕様は自由構造（多言語ではない）。そのまま通す。 */
      spec:
        r.designSpec && Object.keys(r.designSpec.spec).length > 0
          ? r.designSpec.spec
          : null,
      matchNames: r.matchNames,
      isActive: r.isActive,
      notes: r.notes,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
