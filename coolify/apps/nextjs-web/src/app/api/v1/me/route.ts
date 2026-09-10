/**
 * GET /api/v1/me — 呼び出し元自身の身元と実効権限。
 *
 * この口があるおかげで、連携先は 403 を自分で診断できる（「そもそもその
 * コードを貰っていない」のか「スコープ外なのか」）。問い合わせを 1 往復
 * 減らすためだけの口だが、機械向けの面ではそれが効く。
 *
 * `allowedCidrs` を返すのは**呼び出し元自身の設定**だから。CIDR 不一致は
 * 設計上 401 で理由を教えないので、ここで自分の設定を確認できないと
 * 「なぜか通らない」が永久に解けない。
 */

import { apiEffectivePermissions, requireApiAuth } from "@/lib/api-authz";
import { jsonOk } from "@/lib/api-response";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const gate = await requireApiAuth(request);
  if (!gate.ok) return gate.response;

  const { ctx } = gate;
  const [client, permissions] = await Promise.all([
    prisma.apiClient.findUnique({
      where: { id: ctx.clientId },
      select: {
        id: true,
        name: true,
        description: true,
        expiresAt: true,
        allowedCidrs: true,
      },
    }),
    apiEffectivePermissions(ctx.userId),
  ]);

  const token = await prisma.apiClientToken.findUnique({
    where: { id: ctx.tokenId },
    select: { id: true, last4: true, label: true, expiresAt: true },
  });

  return jsonOk({
    client: {
      id: client?.id ?? ctx.clientId,
      name: client?.name ?? ctx.clientName,
      description: client?.description ?? null,
      expiresAt: client?.expiresAt?.toISOString() ?? null,
      allowedCidrs: client?.allowedCidrs ?? [],
    },
    token: {
      id: token?.id ?? ctx.tokenId,
      last4: token?.last4 ?? null,
      label: token?.label ?? null,
      expiresAt: token?.expiresAt?.toISOString() ?? null,
    },
    user: {
      id: ctx.userId,
      username: ctx.username,
      displayName: ctx.displayName,
    },
    superuser: permissions.superuser,
    permissionCodes: permissions.codes,
  });
}
