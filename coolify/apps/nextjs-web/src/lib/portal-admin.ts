/**
 * portal-admin.ts — SY0H の読み取り。server-only.
 *
 * ■ アドレスは既定でマスクする
 * 社外の個人データなので、一覧・詳細とも `k***@e***.co.jp` で出す。生値を
 * 見るのは別操作（監査行を書く）。login_attempts / SY0D の詳細ドロワーと同じ扱い。
 */

import "server-only";

import { prisma } from "./db";
import { type LocalizedTextInput, localized } from "./format";
import { maskEmail } from "./portal-mail-core";

export interface PortalAccountRow {
  id: string;
  displayName: string;
  /** **マスク済み**。生値はここには入らない。 */
  maskedEmail: string;
  bpId: string;
  bpName: string;
  isActive: boolean;
  disabledAt: string | null;
  lastLoginAt: string | null;
  grantCount: number;
  backupCodesUnused: number;
  createdAt: string;
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export async function listPortalAccounts(): Promise<PortalAccountRow[]> {
  const rows = await prisma.portalAccount.findMany({
    select: {
      id: true,
      displayName: true,
      email: true,
      bpId: true,
      isActive: true,
      disabledAt: true,
      lastLoginAt: true,
      createdAt: true,
      bp: { select: { name: true } },
      grants: {
        where: { revokedAt: null },
        select: { id: true },
      },
      backupCodes: { where: { usedAt: null }, select: { id: true } },
    },
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
    take: 300,
  });

  return rows.map((r) => ({
    id: r.id,
    displayName: r.displayName,
    maskedEmail: maskEmail(r.email),
    bpId: r.bpId,
    bpName: localized(r.bp.name as LocalizedTextInput),
    isActive: r.isActive,
    disabledAt: iso(r.disabledAt),
    lastLoginAt: iso(r.lastLoginAt),
    grantCount: r.grants.length,
    backupCodesUnused: r.backupCodes.length,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface PortalGrantRowView {
  id: string;
  kind: string;
  bpName: string | null;
  includeBranches: boolean;
  includeAsEndUser: boolean;
  resourceType: string | null;
  resourceId: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export interface PortalAccessLogRow {
  id: string;
  resourceType: string;
  resourceId: string;
  action: string;
  ipAddress: string | null;
  createdAt: string;
}

export interface PortalAccountDetail extends PortalAccountRow {
  grants: PortalGrantRowView[];
  recentAccess: PortalAccessLogRow[];
}

export async function getPortalAccount(
  id: string,
): Promise<PortalAccountDetail | null> {
  const rows = await listPortalAccounts();
  const base = rows.find((r) => r.id === id);
  if (!base) return null;

  const [grants, access] = await Promise.all([
    prisma.portalGrant.findMany({
      where: { portalAccountId: id },
      select: {
        id: true,
        kind: true,
        includeBranches: true,
        includeAsEndUser: true,
        resourceType: true,
        resourceId: true,
        expiresAt: true,
        revokedAt: true,
        bp: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.portalAccessLog.findMany({
      where: { portalAccountId: id },
      select: {
        id: true,
        resourceType: true,
        resourceId: true,
        action: true,
        ipAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    ...base,
    grants: grants.map((g) => ({
      id: g.id,
      kind: g.kind,
      bpName: g.bp ? localized(g.bp.name as LocalizedTextInput) : null,
      includeBranches: g.includeBranches,
      includeAsEndUser: g.includeAsEndUser,
      resourceType: g.resourceType,
      resourceId: g.resourceId,
      expiresAt: iso(g.expiresAt),
      revokedAt: iso(g.revokedAt),
    })),
    recentAccess: access.map((a) => ({
      id: a.id,
      resourceType: a.resourceType,
      resourceId: a.resourceId,
      action: a.action,
      ipAddress: a.ipAddress,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

/** 取引先の選択肢（顧客ロールを持つ BP）。 */
export async function listPortalBpOptions(): Promise<
  { value: string; label: string }[]
> {
  const rows = await prisma.businessPartner.findMany({
    where: {
      isActive: true,
      roleAssignments: { some: { role: "CUSTOMER", isActive: true } },
    },
    select: { id: true, name: true, bpCode: true },
    orderBy: { bpCode: "asc" },
    take: 500,
  });
  return rows.map((r) => ({
    value: r.id,
    label: `${r.bpCode ?? "—"} ${localized(r.name as LocalizedTextInput)}`,
  }));
}
