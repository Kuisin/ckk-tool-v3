"use server";

/**
 * SY0H 取引先ポータル管理のサーバーアクション。
 *
 * ■ 何に承認を要求するか
 *
 * 「社外の人がアクセスできるようになる」操作だけを useElevation で通す:
 *   有効化 / バックアップコードの発行 / 本人確認なしリンクの発行
 *
 * ゲートしないもの: 作成（作っただけでは何も見えない — is_active は既定 false）、
 * 表示名の編集、**無効化**、共有範囲の削除、リンクの失効、VERIFY リンクの発行。
 * アクセスを減らす操作を承認待ちにしない、というキオスクのカード一時停止と
 * 同じ判断（承認を待つあいだ社外アクセスが生きたままになるのは本末転倒）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission, sessionUserId } from "@/lib/authz";
import { prisma } from "@/lib/db";
import { isDevFeatureEnabled } from "@/lib/dev-features";
import { correlationRef } from "@/lib/login-attempts";
import { appBaseUrl } from "@/lib/mailer";
import { PORTAL_DOCUMENT_TYPES } from "@/lib/portal-documents-core";
import {
  mintPortalLink,
  type PortalLinkPolicy,
  revokePortalLink,
} from "@/lib/portal-links";
import { maskEmail } from "@/lib/portal-mail-core";
import { issuePortalBackupCodes, normalizePortalEmail } from "@/lib/portal-otp";
import { elevationAuditNote, useElevation } from "@/lib/privileged-access";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/settings/portal";

/**
 * 一覧とアカウント詳細（/settings/portal/[id]）の両方を作り直す。
 *
 * `revalidatePath(BASE_PATH)` だけだと**その 1 ページしか**無効化されないので、
 * 詳細を開いたまま共有範囲を失効させても画面は古いまま残る。第 2 引数の
 * "layout" でこの下の木ごと落とす。
 */
function revalidatePortal(): void {
  revalidatePath(BASE_PATH, "layout");
}

/**
 * 機能そのものが有効か（src/config/dev-features.json）。
 *
 * AppAvailabilityGuard は**クライアント表示の速路**なので、サーバー側でも見る。
 * これが無いと、main で管理者が直接アクションを叩いて「使えないポータルの
 * アカウント」を作れてしまう。
 */
function featureOff(
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  return isDevFeatureEnabled("portal")
    ? null
    : tr("settings.portalActions.featureDisabled");
}

function createSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    bpId: z.string().uuid(tr("settings.portalActions.selectABusinessPartner")),
    email: z.string().trim().email(tr("common.invalidEmailFormat")),
    displayName: z
      .string()
      .trim()
      .min(1, tr("settings.portalActions.enterDisplayName"))
      .max(120),
    bpContactId: z.string().uuid().nullable().optional(),
  });
}

export async function createPortalAccount(
  input: z.infer<ReturnType<typeof createSchema>>,
): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  const off = featureOff(tr);
  if (off) return actionError(off);
  const authz = await checkPermission("portal_admin", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = createSchema(tr).safeParse(input);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  const v = parsed.data;
  const email = normalizePortalEmail(v.email);

  try {
    const row = await prisma.portalAccount.create({
      data: {
        bpId: v.bpId,
        email,
        emailRef: correlationRef(email) ?? "",
        displayName: v.displayName,
        bpContactId: v.bpContactId ?? null,
        // 既定は**無効**。作っただけでは何も見えない。
        isActive: false,
        createdBy: await sessionUserId(),
      },
      select: { id: true },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "portal_accounts",
      recordId: row.id,
      // **アドレスの生値は監査に残さない**（マスクだけ）。
      after: {
        displayName: v.displayName,
        bpId: v.bpId,
        email: maskEmail(email),
        isActive: false,
      },
    });
    revalidatePortal();
    return actionOk({ id: row.id });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.portalActions.createFailed"), tr),
    );
  }
}

/** 有効化 — **承認が要る**（社外の人に継続ログインを与える操作）。 */
export async function activatePortalAccount(
  id: string,
): Promise<ActionResult<null>> {
  const tr = await getTranslations();
  const off = featureOff(tr);
  if (off) return actionError(off);
  // useElevation は React のフックではない（サーバー側の昇格チェック。peek と
  // 対にするため use* という名前になっている — lib/privileged-access.ts 参照）。
  // 機能が無効な環境で承認を消費しないよう featureOff() の後に呼ぶ必要があり、
  // その結果 Biome には「条件付き呼び出し」に見える。
  // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
  const gate = await useElevation("portal_admin.activate_account");
  if (!gate.ok) return actionError(gate.error);
  try {
    const row = await prisma.portalAccount.update({
      where: { id },
      data: { isActive: true, disabledAt: null, disabledReason: null },
      select: { displayName: true },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "portal_accounts",
      recordId: id,
      before: { isActive: false },
      after: {
        isActive: true,
        displayName: row.displayName,
        ...elevationAuditNote(gate, "portal_admin.activate_account"),
      },
    });
    revalidatePortal();
    return actionOk(null);
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.portalActions.activateFailed"), tr),
    );
  }
}

/**
 * 無効化 — **承認は要らない**。アクセスを減らす操作を承認待ちにすると、
 * 待っているあいだ社外アクセスが生きたままになる。
 * 生きているセッションもここで失効させる。
 */
export async function deactivatePortalAccount(
  id: string,
  reason: string,
): Promise<ActionResult<null>> {
  const tr = await getTranslations();
  const off = featureOff(tr);
  if (off) return actionError(off);
  const authz = await checkPermission("portal_admin", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const actorId = await sessionUserId();
  try {
    await prisma.$transaction([
      prisma.portalAccount.update({
        where: { id },
        data: {
          isActive: false,
          disabledAt: new Date(),
          disabledReason: reason.trim() || null,
          disabledById: actorId,
        },
      }),
      // 稼働中のセッションも即座に切る（次のリクエストで判定し直すため）。
      prisma.portalSession.updateMany({
        where: { portalAccountId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await recordAudit({
      action: "UPDATE",
      tableName: "portal_accounts",
      recordId: id,
      before: { isActive: true },
      after: { isActive: false, reason: reason.trim() || null },
    });
    revalidatePortal();
    return actionOk(null);
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.portalActions.deactivateFailed"), tr),
    );
  }
}

function grantSchema(tr: Awaited<ReturnType<typeof getTranslations>>) {
  return z.object({
    portalAccountId: z.string().uuid(),
    bpId: z.string().uuid(tr("settings.portalActions.selectABusinessPartner")),
    includeBranches: z.boolean(),
    includeAsEndUser: z.boolean(),
  });
}

/** BP スコープの共有を足す。作成そのものは承認不要（有効化が門になっている）。 */
export async function addPortalBpScope(
  input: z.infer<ReturnType<typeof grantSchema>>,
): Promise<ActionResult<null>> {
  const tr = await getTranslations();
  const off = featureOff(tr);
  if (off) return actionError(off);
  const authz = await checkPermission("portal_admin", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = grantSchema(tr).safeParse(input);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  const v = parsed.data;
  try {
    await prisma.portalGrant.create({
      data: {
        portalAccountId: v.portalAccountId,
        kind: "BP_SCOPE",
        bpId: v.bpId,
        includeBranches: v.includeBranches,
        includeAsEndUser: v.includeAsEndUser,
        createdBy: await sessionUserId(),
      },
    });
    await recordAudit({
      action: "CREATE",
      tableName: "portal_grants",
      recordId: v.portalAccountId,
      after: v,
    });
    revalidatePortal();
    return actionOk(null);
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.portalActions.addGrantFailed"), tr),
    );
  }
}

/** 共有範囲を失効させる（承認不要 — アクセスを減らす操作）。 */
export async function revokePortalGrant(
  grantId: string,
): Promise<ActionResult<null>> {
  const tr = await getTranslations();
  const off = featureOff(tr);
  if (off) return actionError(off);
  const authz = await checkPermission("portal_admin", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await prisma.portalGrant.updateMany({
      where: { id: grantId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: await sessionUserId() },
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "portal_grants",
      recordId: grantId,
      after: { revoked: true },
    });
    revalidatePortal();
    return actionOk(null);
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.portalActions.revokeFailed"), tr),
    );
  }
}

/**
 * バックアップコードを発行 — **承認が要る**。
 * 平文は戻り値にしか存在しない（画面で 1 回だけ表示する）。
 */
export async function issueBackupCodes(
  accountId: string,
): Promise<ActionResult<{ codes: string[] }>> {
  const tr = await getTranslations();
  const off = featureOff(tr);
  if (off) return actionError(off);
  // useElevation は React のフックではない（サーバー側の昇格チェック。peek と
  // 対にするため use* という名前になっている — lib/privileged-access.ts 参照）。
  // 機能が無効な環境で承認を消費しないよう featureOff() の後に呼ぶ必要があり、
  // その結果 Biome には「条件付き呼び出し」に見える。
  // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
  const gate = await useElevation("portal_admin.issue_backup_codes");
  if (!gate.ok) return actionError(gate.error);
  try {
    const codes = await issuePortalBackupCodes({
      accountId,
      issuedBy: gate.userId,
    });
    await recordAudit({
      action: "CREATE",
      tableName: "portal_backup_codes",
      recordId: accountId,
      // **コードそのものは絶対に監査に入れない**（枚数だけ）。
      after: {
        count: codes.length,
        ...elevationAuditNote(gate, "portal_admin.issue_backup_codes"),
      },
    });
    revalidatePortal();
    return actionOk({ codes });
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.portalActions.issueFailed"), tr),
    );
  }
}

/**
 * 書類リンクの発行は**ポリシーごとに別の入口**にしてある。
 *
 * 理由は 2 つ:
 *  1. 要求する承認が違う。LINK_ONLY は URL の所持だけで開ける bearer 資格情報
 *     なので特権操作（SY0G の承認）を消費する。VERIFY は受信箱の所持が
 *     第二要素になっているので素の権限で足りる。
 *  2. 1 つの関数の中で条件分岐して useElevation を呼ぶと、「どちらの経路でも
 *     承認が要る」ように読めてしまう。入口を分けると差が API に出る。
 *
 * どちらも「自分が読める書類」しか配れない（下の DOC_PERMISSION）。
 */

const linkSchema = z.object({
  resourceType: z.enum(PORTAL_DOCUMENT_TYPES),
  resourceId: z.string().trim().min(3).max(64),
  portalAccountId: z.string().uuid().nullable().optional(),
  boundEmail: z.string().trim().email().nullable().optional(),
  label: z.string().trim().max(200).nullable().optional(),
  maxUses: z.number().int().min(1).nullable().optional(),
  days: z.number().int().min(1).max(180),
});

export type PortalLinkInput = z.infer<typeof linkSchema>;

/**
 * 本人確認あり（VERIFY）のリンク。
 * 確認コードは**リンクに束縛されたアドレスへのみ**送られるので、転送されても
 * 転送先では開けない。素の portal_admin:CREATE で足りる。
 */
export async function createVerifyLink(
  input: PortalLinkInput,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const tr = await getTranslations();
  const off = featureOff(tr);
  if (off) return actionError(off);
  const authz = await checkPermission("portal_admin", "CREATE");
  if (!authz.ok) return actionError(authz.error);
  return mintLink(input, "VERIFY", {});
}

/**
 * 本人確認なし（LINK_ONLY）のリンク — **特権操作**。
 * URL を持っていれば誰でも開けるので、承認を消費する。
 */
export async function createLinkOnlyUrl(
  input: PortalLinkInput,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const tr = await getTranslations();
  const off = featureOff(tr);
  if (off) return actionError(off);
  // useElevation は React のフックではない（サーバー側の昇格チェック。peek と
  // 対にするため use* という名前になっている — lib/privileged-access.ts 参照）。
  // 機能が無効な環境で承認を消費しないよう featureOff() の後に呼ぶ必要があり、
  // その結果 Biome には「条件付き呼び出し」に見える。
  // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
  const gate = await useElevation("portal_admin.mint_link_only");
  if (!gate.ok) return actionError(gate.error);
  return mintLink(
    input,
    "LINK_ONLY",
    elevationAuditNote(gate, "portal_admin.mint_link_only"),
  );
}

/** 発行の本体（ゲートは呼び出し側が済ませている）。 */
async function mintLink(
  input: PortalLinkInput,
  policy: PortalLinkPolicy,
  note: Record<string, unknown>,
): Promise<ActionResult<{ url: string; expiresAt: string }>> {
  const tr = await getTranslations();
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success)
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  const v = parsed.data;

  // その書類自体の READ を持っていること（見えるものしか配れない）。
  const docAuthz = await checkPermission(
    DOC_PERMISSION[v.resourceType],
    "READ",
  );
  if (!docAuthz.ok) return actionError(docAuthz.error);

  const actorId = await sessionUserId();
  if (!actorId) {
    return actionError(tr("settings.portalActions.actorNotIdentified"));
  }

  const result = await mintPortalLink(
    {
      resourceType: v.resourceType,
      resourceId: v.resourceId,
      policy,
      portalAccountId: v.portalAccountId ?? null,
      boundEmail: v.boundEmail ?? null,
      label: v.label ?? null,
      maxUses: v.maxUses ?? null,
      expiresAt: new Date(Date.now() + v.days * 24 * 60 * 60 * 1000),
      createdBy: actorId,
    },
    appBaseUrl(),
  );
  if (!result.ok) return actionError(result.error);

  await recordAudit({
    action: "CREATE",
    tableName: "portal_document_links",
    recordId: result.link.id,
    // **トークンも URL も監査に入れない**（それ自体が資格情報）。
    after: {
      resourceType: v.resourceType,
      resourceId: v.resourceId,
      policy,
      maxUses: v.maxUses ?? null,
      expiresAt: result.link.expiresAt.toISOString(),
      boundEmail: v.boundEmail ? maskEmail(v.boundEmail) : null,
      ...note,
    },
  });
  revalidatePortal();
  return actionOk({
    url: result.link.url,
    expiresAt: result.link.expiresAt.toISOString(),
  });
}

/** リンクを失効させる（承認不要）。 */
export async function revokeLink(linkId: string): Promise<ActionResult<null>> {
  const tr = await getTranslations();
  const off = featureOff(tr);
  if (off) return actionError(off);
  const authz = await checkPermission("portal_admin", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const actorId = await sessionUserId();
  if (!actorId) {
    return actionError(tr("settings.portalActions.actorNotIdentified"));
  }
  try {
    await revokePortalLink(linkId, actorId);
    await recordAudit({
      action: "UPDATE",
      tableName: "portal_document_links",
      recordId: linkId,
      after: { revoked: true },
    });
    revalidatePortal();
    return actionOk(null);
  } catch (e) {
    return actionError(
      prismaErrorMessage(e, tr("settings.portalActions.revokeFailed"), tr),
    );
  }
}

/** 書類の種別 → その書類の権限コード（見えるものしか配らせないため）。 */
const DOC_PERMISSION: Record<(typeof PORTAL_DOCUMENT_TYPES)[number], string> = {
  quotes: "quote",
  order_acceptances: "order_acceptance",
  delivery_notes: "delivery_note",
  invoices: "invoice",
};
