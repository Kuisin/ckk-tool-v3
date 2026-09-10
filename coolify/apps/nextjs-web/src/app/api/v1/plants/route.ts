/**
 * GET /api/v1/plants — マスタの一覧（keyset + 差分同期）。
 *
 * 権限は `master:READ`（マスタは 1 コードでまとまっている — 資源ごとに
 * 新しいコードを作らない）。マスタは拠点に紐づかないので行スコープは掛けない。
 *
 * `?includeInactive=1` を付けない限り `is_active = true` だけを返す。
 * 無効化されたマスタは「消えた」ではなく「使わない」なので、差分同期では
 * **無効化そのものが 1 件の更新として届く**（updated_at が動くため）。
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
      prisma.plant.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          code: true,
          name: true,
          nameKana: true,
          countryCode: true,
          regionId: true,
          postalCode: true,
          address: true,
          phone: true,
          email: true,
          contactPerson: true,
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
      code: r.code,
      name: localizedJson(r.name),
      nameKana: r.nameKana,
      countryCode: r.countryCode,
      regionId: r.regionId,
      postalCode: r.postalCode,
      address: localizedJson(r.address),
      phone: r.phone,
      email: r.email,
      contactPerson: r.contactPerson,
      isActive: r.isActive,
      notes: r.notes,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
