/**
 * portal-links.ts — 書類 1 件へのトークン URL。server-only.
 *
 * ■ 2 つのポリシー（発行者が書類ごとに選ぶ）
 *
 *   LINK_ONLY … URL の所持だけで開く。第二要素なしの bearer 資格情報なので、
 *               転送されればその相手も開ける。「見せたい相手が登録済みとは
 *               限らない」場面（一度きりの送付先）のための逃げ道。
 *   VERIFY    … **リンクに束縛されたアドレス**への確認コードを要求する。
 *               訪問者が入力したアドレスへは決して送らない — この一点が
 *               「転送されたリンクは転送先では無価値」を作る。
 *
 * ■ トークン
 *
 * randomBytes(32).base64url（256bit）。DB は sha256 のみで、生値は URL に
 * しか存在しない。**Crockford は使わない** — あれは「人が台紙から目視で打つ」
 * ための 12 桁 60bit で、リンクは貼り付けるもの。用途が違うものを流用すると
 * 後で桁数を説明できなくなる。
 *
 * ■ 有効期限は必須
 *
 * 無期限のリンクは作れない（既定 30 日・上限 180 日）。失効は解決のたびに
 * 毎回見る（キャッシュしない）。
 */

import "server-only";

import { getTranslations } from "next-intl/server";
import { prisma } from "./db";
import { correlationRef } from "./login-attempts";
import { mintToken, sha256hex } from "./portal-auth";
import {
  isPortalLinkExpiryAllowed,
  PORTAL_LINK_DEFAULT_TTL_MS,
  type PortalLinkDenyReason,
  portalLinkDenyReason,
} from "./portal-auth-core";
import type { PortalDocumentType } from "./portal-documents-core";
import { maskEmail } from "./portal-mail-core";
import { normalizePortalEmail } from "./portal-otp";

export type PortalLinkPolicy = "LINK_ONLY" | "VERIFY";

export interface MintedPortalLink {
  id: string;
  /** URL に載せる生トークン。**この戻り値にしか存在しない**。 */
  token: string;
  url: string;
  expiresAt: Date;
}

export interface MintPortalLinkInput {
  resourceType: PortalDocumentType;
  /** 書類の表示番号（QOT-… / ORD-… / DRN-… / INV-…）。 */
  resourceId: string;
  policy: PortalLinkPolicy;
  /** VERIFY のときの宛先（どちらか必須）。 */
  portalAccountId?: string | null;
  boundEmail?: string | null;
  label?: string | null;
  maxUses?: number | null;
  expiresAt?: Date | null;
  createdBy: string;
}

export type MintResult =
  | { ok: true; link: MintedPortalLink }
  | { ok: false; error: string };

/** リンクを 1 本発行する。 */
export async function mintPortalLink(
  input: MintPortalLinkInput,
  baseUrl: string,
): Promise<MintResult> {
  const tr = await getTranslations();
  const now = new Date();
  const expiresAt =
    input.expiresAt ?? new Date(now.getTime() + PORTAL_LINK_DEFAULT_TTL_MS);

  if (!isPortalLinkExpiryAllowed(now, expiresAt)) {
    return {
      ok: false,
      error: tr("settings.portalLinks.theExpiryMustBeBetween"),
    };
  }
  // VERIFY は宛先が無いと成立しない（訪問者の入力へは送らないため）。
  if (
    input.policy === "VERIFY" &&
    !input.portalAccountId &&
    !input.boundEmail
  ) {
    return {
      ok: false,
      error: tr("settings.portalLinks.aVerifiedLinkRequiresAn"),
    };
  }
  if (input.maxUses != null && input.maxUses < 1) {
    return {
      ok: false,
      error: tr("settings.portalLinks.theUseCountMustBe"),
    };
  }

  const { raw, hash } = mintToken();
  const email = input.boundEmail
    ? normalizePortalEmail(input.boundEmail)
    : null;

  const row = await prisma.portalDocumentLink.create({
    data: {
      tokenHash: hash,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      policy: input.policy,
      portalAccountId: input.portalAccountId ?? null,
      boundEmail: email,
      boundEmailRef: email ? correlationRef(email) : null,
      label: input.label ?? null,
      maxUses: input.maxUses ?? null,
      expiresAt,
      createdBy: input.createdBy,
    },
    select: { id: true, expiresAt: true },
  });

  return {
    ok: true,
    link: {
      id: row.id,
      token: raw,
      url: `${baseUrl.replace(/\/$/, "")}/portal/d/${raw}`,
      expiresAt: row.expiresAt,
    },
  };
}

export interface ResolvedPortalLink {
  id: string;
  resourceType: PortalDocumentType;
  resourceId: string;
  policy: PortalLinkPolicy;
  /** VERIFY のときの宛先（**マスクして表示する**。生値は画面に出さない）。 */
  boundEmail: string | null;
  portalAccountId: string | null;
}

export type ResolveResult =
  | { ok: true; link: ResolvedPortalLink }
  | { ok: false; reason: PortalLinkDenyReason | "NOT_FOUND" };

/**
 * トークンからリンクを引く。**使用回数は増やさない**（解決と消費を分ける）。
 * 失効・期限切れ・回数切れは理由を区別して返すが、**画面は区別しない**。
 */
export async function resolvePortalLink(token: string): Promise<ResolveResult> {
  if (!token || token.length < 20) return { ok: false, reason: "NOT_FOUND" };

  const row = await prisma.portalDocumentLink
    .findUnique({
      where: { tokenHash: sha256hex(token) },
      select: {
        id: true,
        resourceType: true,
        resourceId: true,
        policy: true,
        boundEmail: true,
        portalAccountId: true,
        expiresAt: true,
        revokedAt: true,
        maxUses: true,
        useCount: true,
        account: { select: { email: true, isActive: true } },
      },
    })
    .catch(() => null);

  if (!row) return { ok: false, reason: "NOT_FOUND" };

  const deny = portalLinkDenyReason(new Date(), row);
  if (deny) return { ok: false, reason: deny };

  // 紐付いたアカウントが無効化されていれば、リンクも通さない。
  if (row.portalAccountId && row.account && !row.account.isActive) {
    return { ok: false, reason: "REVOKED" };
  }

  return {
    ok: true,
    link: {
      id: row.id,
      resourceType: row.resourceType as PortalDocumentType,
      resourceId: row.resourceId,
      policy: row.policy as PortalLinkPolicy,
      boundEmail: row.boundEmail ?? row.account?.email ?? null,
      portalAccountId: row.portalAccountId,
    },
  };
}

/**
 * 使用を 1 回数える。**条件付き UPDATE で上限を超えさせない**
 * （check-then-use の隙間を作らない — useElevation と同じ手口）。
 */
export async function consumePortalLink(linkId: string): Promise<boolean> {
  const now = new Date();
  const updated = await prisma.$executeRaw`
    UPDATE app.portal_document_links
       SET use_count = use_count + 1, last_used_at = ${now}
     WHERE id = ${linkId}::uuid
       AND revoked_at IS NULL
       AND expires_at > ${now}
       AND (max_uses IS NULL OR use_count < max_uses)
  `;
  return updated === 1;
}

/** 失効させる。 */
export async function revokePortalLink(
  linkId: string,
  revokedBy: string,
): Promise<void> {
  await prisma.portalDocumentLink.updateMany({
    where: { id: linkId, revokedAt: null },
    data: { revokedAt: new Date(), revokedBy },
  });
}

export interface PortalLinkRow {
  id: string;
  resourceType: string;
  resourceId: string;
  policy: PortalLinkPolicy;
  label: string | null;
  maskedEmail: string | null;
  maxUses: number | null;
  useCount: number;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

/** 管理画面用の一覧（**トークンは持たない** — 生値はどこにも無い）。 */
export async function listPortalLinks(filter: {
  resourceType?: string;
  resourceId?: string;
  portalAccountId?: string;
}): Promise<PortalLinkRow[]> {
  const rows = await prisma.portalDocumentLink.findMany({
    where: {
      resourceType: filter.resourceType,
      resourceId: filter.resourceId,
      portalAccountId: filter.portalAccountId,
    },
    select: {
      id: true,
      resourceType: true,
      resourceId: true,
      policy: true,
      label: true,
      boundEmail: true,
      maxUses: true,
      useCount: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
      account: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map((r) => {
    const email = r.boundEmail ?? r.account?.email ?? null;
    return {
      id: r.id,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      policy: r.policy as PortalLinkPolicy,
      label: r.label,
      maskedEmail: email ? maskEmail(email) : null,
      maxUses: r.maxUses,
      useCount: r.useCount,
      expiresAt: r.expiresAt,
      revokedAt: r.revokedAt,
      lastUsedAt: r.lastUsedAt,
      createdAt: r.createdAt,
    };
  });
}
