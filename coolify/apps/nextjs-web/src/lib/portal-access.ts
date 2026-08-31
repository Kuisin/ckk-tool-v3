/**
 * portal-access.ts — ポータルの認可（DB 側）。server-only.
 *
 * 判定そのものは portal-access-core.ts（純関数・テスト対象）。ここは行を集めて
 * 渡すだけ。**BP の展開はここが唯一の担当**で、その規則が 1 つある:
 *
 *   支店に紐づく付与は **子（支店）へは広げるが、親へは遡らない**。
 *   支店の担当者に本社や兄弟支店の書類が見えてはいけない。
 *
 * business_partners は 2 階層（parent_id は 1 段だけ）なのでクエリ 1 本で済む。
 */

import "server-only";

import { cache } from "react";
import { prisma } from "./db";
import {
  type PortalAccess,
  type PortalGrantRow,
  type PortalScope,
  type PortalTarget,
  portalScopeBpIds,
  resolvePortalAccess,
} from "./portal-access-core";
import type { PortalSession } from "./portal-auth";

/**
 * 付与に書かれた BP を、実際に当てる集合へ広げる。
 * **下向きのみ**（親 → その支店）。
 */
export async function expandBpScope(
  bpIds: readonly string[],
  includeBranches: boolean,
): Promise<string[]> {
  if (bpIds.length === 0) return [];
  if (!includeBranches) return [...new Set(bpIds)];
  const branches = await prisma.businessPartner
    .findMany({
      where: { parentId: { in: [...bpIds] } },
      select: { id: true },
    })
    .catch(() => []);
  return [...new Set([...bpIds, ...branches.map((b) => b.id)])];
}

/**
 * そのアカウントの付与を、BP を展開した形で取り出す。
 * リクエスト内でキャッシュする（1 画面で何度も引くため）。
 */
export const portalGrantsFor = cache(
  async (accountId: string): Promise<PortalGrantRow[]> => {
    const rows = await prisma.portalGrant
      .findMany({
        where: { portalAccountId: accountId },
        select: {
          kind: true,
          bpId: true,
          includeBranches: true,
          includeAsEndUser: true,
          resourceType: true,
          resourceId: true,
          conditionFieldKey: true,
          conditionValues: true,
          expiresAt: true,
          revokedAt: true,
        },
      })
      .catch(() => []);

    return Promise.all(
      rows.map(async (r) => ({
        kind: r.kind,
        bpIds: r.bpId ? await expandBpScope([r.bpId], r.includeBranches) : [],
        includeAsEndUser: r.includeAsEndUser,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        condition: r.conditionFieldKey
          ? { fieldKey: r.conditionFieldKey, values: r.conditionValues }
          : null,
        expiresAt: r.expiresAt,
        revokedAt: r.revokedAt,
      })),
    );
  },
);

const DENIED: PortalAccess = {
  canView: false,
  reason: "NO_GRANT",
  responseScope: { all: false, conditions: [] },
};

/**
 * この対象を、このセッションで見てよいか。
 *
 * リンク限定セッション（linkId 付き）は**そのリンクの 1 件だけ**。付与は見ない
 * —「指定された 1 件だけ」を、セッションの側からも閉じておく。
 */
export async function portalAccessFor(
  session: PortalSession,
  target: PortalTarget,
): Promise<PortalAccess> {
  if (session.linkId) {
    const link = await prisma.portalDocumentLink
      .findUnique({
        where: { id: session.linkId },
        select: { resourceType: true, resourceId: true, revokedAt: true },
      })
      .catch(() => null);
    if (!link || link.revokedAt) return DENIED;
    const match =
      link.resourceType === target.type && link.resourceId === target.id;
    return match
      ? {
          canView: true,
          reason: null,
          responseScope: { all: true, conditions: [] },
        }
      : DENIED;
  }

  if (!session.accountId) return DENIED;

  const account = await prisma.portalAccount
    .findUnique({
      where: { id: session.accountId },
      select: { id: true, isActive: true },
    })
    .catch(() => null);
  if (!account) return DENIED;

  const grants = await portalGrantsFor(account.id);
  return resolvePortalAccess(
    new Date(),
    grants,
    { accountId: account.id, isActive: account.isActive },
    target,
  );
}

/** 一覧を絞るための集合。 */
export async function portalScopeFor(
  session: PortalSession,
): Promise<PortalScope> {
  const empty: PortalScope = {
    customerBpIds: [],
    endUserBpIds: [],
    documentIds: new Map(),
  };
  if (!session.accountId) return empty;

  const account = await prisma.portalAccount
    .findUnique({
      where: { id: session.accountId },
      select: { id: true, isActive: true },
    })
    .catch(() => null);
  if (!account) return empty;

  const grants = await portalGrantsFor(account.id);
  return portalScopeBpIds(new Date(), grants, {
    accountId: account.id,
    isActive: account.isActive,
  });
}
