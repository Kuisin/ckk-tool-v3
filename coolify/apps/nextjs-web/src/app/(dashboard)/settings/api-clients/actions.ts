"use server";

/**
 * SY0I API クライアントの Server Action。
 *
 * ■ 承認が要るのは**アクセスを増やす 2 つだけ**
 *   `api_client.issue_token` … 鍵を刷る
 *   `api_client.activate`    … 何も通らない状態から通る状態にする
 * 作成（無効・トークン無し）・説明の変更・**無効化**・**トークンの失効**・
 * 許可 IP を狭める操作は素の `api_client` で足りる。アクセスを減らす操作を
 * 承認待ちにしない、という portal / kiosk と同じ約束。
 *
 * ■ ロールの割り当ては**ここに無い**
 * それは SY01 ユーザー管理の変更依頼（方式 B・`user_admin`）が持つ。
 * 身元を作る人と権限を与える人を分ける。
 *
 * ■ 生のトークンは 1 度だけ返る
 * `issueApiTokenAction` の戻り値にだけ現れる。監査行には `last4` しか
 * 入れない（`/api/intake/inbound` の「トークンは絶対に載せない」と同じ規約）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import {
  createApiClient,
  issueToken,
  revokeApiClient,
  revokeToken,
  setApiClientActive,
  updateApiClient,
} from "@/lib/api-clients-admin";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { parseCidrList } from "@/lib/cidr-core";
import { isDevFeatureEnabled } from "@/lib/dev-features";
import {
  checkOperationPermission,
  elevationAuditNote,
  useElevation,
} from "@/lib/privileged-access";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/settings/api-clients";

/**
 * 機能そのものが閉じている環境では、**承認を消費する前に**止める。
 * これが無いと、無効な環境で押されたボタンが申請者の持ち時間だけ削る。
 */
function featureOff(
  tr: Awaited<ReturnType<typeof getTranslations>>,
): string | null {
  return isDevFeatureEnabled("api") ? null : tr("apiClients.featureDisabled");
}

function revalidate(): void {
  // "layout" — 詳細ページも一覧も同じ木の下にあるので、まとめて捨てる。
  revalidatePath(BASE_PATH, "layout");
}

const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[\w .:@/-]+$/u, "名前に使えない文字が含まれています");

const createSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(2000).optional().nullable(),
  allowedCidrs: z.string().optional(),
  expiresAt: z.string().optional().nullable(),
});

function parseExpiry(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createApiClientAction(
  input: z.input<typeof createSchema>,
): Promise<ActionResult<{ id: string }>> {
  const tr = await getTranslations();
  const authz = await checkPermission("api_client", "CREATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;

  try {
    const { id } = await createApiClient({
      name: v.name,
      description: v.description ?? null,
      allowedCidrs: parseCidrList(v.allowedCidrs ?? ""),
      expiresAt: parseExpiry(v.expiresAt),
      createdBy: authz.userId,
    });
    await recordAudit({
      action: "CREATE",
      tableName: "api_clients",
      recordId: id,
      after: { name: v.name, isActive: false },
    });
    revalidate();
    return actionOk({ id });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

/** ★ 特権操作。承認された期間だけ通る。 */
export async function issueApiTokenAction(
  clientId: string,
  input: { label?: string | null; expiresAt?: string | null } = {},
): Promise<ActionResult<{ raw: string; last4: string }>> {
  const tr = await getTranslations();
  // 順序が大事: 素の権限 → 入力の検証 → 昇格。入力が不正なまま useElevation を
  // 呼ぶと、何もしていないのに申請者の持ち時間が減る（privileged-access.ts の
  // checkOperationPermission の注記）。
  const pre = await checkOperationPermission("api_client.issue_token");
  if (!pre.ok) return actionError(pre.error);

  const off = featureOff(tr);
  if (off) return actionError(off);
  // 機能が無効な環境で承認を消費しないよう featureOff() の後に呼ぶ必要があり、
  // その結果 Biome には「条件付き呼び出し」に見える。
  // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
  const elevation = await useElevation("api_client.issue_token");
  if (!elevation.ok) return actionError(elevation.error);

  try {
    const result = await issueToken(clientId, {
      label: input.label?.trim() || null,
      expiresAt: parseExpiry(input.expiresAt),
      createdBy: elevation.userId,
    });
    if (!result.ok) {
      return actionError(
        result.reason === "TOO_MANY"
          ? tr("apiClients.tooManyActiveTokens")
          : tr("apiClients.clientNotFound"),
      );
    }
    // ★ 生値は載せない。last4 だけ。
    await recordAudit({
      action: "CREATE",
      tableName: "api_client_tokens",
      recordId: result.tokenId,
      after: {
        clientId,
        last4: result.last4,
        label: input.label ?? null,
        ...elevationAuditNote(elevation, "api_client.issue_token"),
      },
    });
    revalidate();
    return actionOk({ raw: result.raw, last4: result.last4 });
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

/** ★ 特権操作。 */
export async function setApiClientActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const tr = await getTranslations();

  // 無効化は**承認を要らない**（アクセスが減る方向）。
  if (!isActive) {
    const authz = await checkPermission("api_client", "UPDATE");
    if (!authz.ok) return actionError(authz.error);
    try {
      await setApiClientActive(id, false);
      await recordAudit({
        action: "UPDATE",
        tableName: "api_clients",
        recordId: id,
        before: { isActive: true },
        after: { isActive: false },
      });
      revalidate();
      return actionOk();
    } catch (e) {
      return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
    }
  }

  const pre = await checkOperationPermission("api_client.activate");
  if (!pre.ok) return actionError(pre.error);
  const off = featureOff(tr);
  if (off) return actionError(off);
  // 機能が無効な環境で承認を消費しないよう featureOff() の後に呼ぶ必要があり、
  // その結果 Biome には「条件付き呼び出し」に見える。
  // biome-ignore lint/correctness/useHookAtTopLevel: React フックではないため
  const elevation = await useElevation("api_client.activate");
  if (!elevation.ok) return actionError(elevation.error);
  try {
    await setApiClientActive(id, true);
    await recordAudit({
      action: "UPDATE",
      tableName: "api_clients",
      recordId: id,
      before: { isActive: false },
      after: {
        isActive: true,
        ...elevationAuditNote(elevation, "api_client.activate"),
      },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

export async function revokeApiTokenAction(
  tokenId: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("api_client", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await revokeToken(tokenId, authz.userId);
    await recordAudit({
      action: "UPDATE",
      tableName: "api_client_tokens",
      recordId: tokenId,
      after: { revoked: true },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

export async function revokeApiClientAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("api_client", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    await revokeApiClient(id, authz.userId, reason.trim() || null);
    await recordAudit({
      action: "UPDATE",
      tableName: "api_clients",
      recordId: id,
      after: { revoked: true, reason: reason.trim() || null },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}

const updateSchema = z.object({
  description: z.string().trim().max(2000).optional().nullable(),
  allowedCidrs: z.string().optional(),
  expiresAt: z.string().optional().nullable(),
});

export async function updateApiClientAction(
  id: string,
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("api_client", "UPDATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }
  const v = parsed.data;
  try {
    const allowedCidrs = parseCidrList(v.allowedCidrs ?? "");
    await updateApiClient(id, {
      description: v.description ?? null,
      allowedCidrs,
      expiresAt: parseExpiry(v.expiresAt),
    });
    await recordAudit({
      action: "UPDATE",
      tableName: "api_clients",
      recordId: id,
      after: { allowedCidrs, expiresAt: v.expiresAt ?? null },
    });
    revalidate();
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.saveFailed"), tr));
  }
}
