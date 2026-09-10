/**
 * GET /api/v1/business-partners — マスタの一覧（keyset + 差分同期）。
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
      prisma.businessPartner.findMany({
        // biome-ignore lint/suspicious/noExplicitAny: 断片は pagination が組む
        where: where as any,
        take,
        // biome-ignore lint/suspicious/noExplicitAny: 同上
        orderBy: orderBy as any,
        select: {
          id: true,
          bpCode: true,
          name: true,
          nameKana: true,
          shortName: true,
          parentId: true,
          countryCode: true,
          postalCode: true,
          address: true,
          phone: true,
          fax: true,
          email: true,
          website: true,
          taxNumber: true,
          documentLocale: true,
          isActive: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          roleAssignments: {
            where: { isActive: true },
            select: { role: true },
          },
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
      bpCode: r.bpCode,
      name: localizedJson(r.name),
      nameKana: r.nameKana,
      shortName: r.shortName,
      parentId: r.parentId,
      /** CUSTOMER / VENDOR / END_USER。1 法人が複数持ちうる。 */
      roles: r.roleAssignments.map((a) => a.role).sort(),
      countryCode: r.countryCode,
      postalCode: r.postalCode,
      address: localizedJson(r.address),
      phone: r.phone,
      fax: r.fax,
      email: r.email,
      website: r.website,
      taxNumber: r.taxNumber,
      documentLocale: r.documentLocale,
      isActive: r.isActive,
      notes: r.notes,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    }),
  });
}
