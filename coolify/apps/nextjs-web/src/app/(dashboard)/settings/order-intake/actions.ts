"use server";

/**
 * Server Actions — 注文書取込（SY0C）.
 *
 * 取込フォルダの操作のうち、ファイル本体を運ばないもの（今すぐスキャン /
 * 失敗の再取込）。**投入は Server Action ではなく** `/api/intake/folder`
 * （ボディ 1MB 制限のため。app CLAUDE.md 参照）。権限は `system`。
 */

import { revalidatePath } from "next/cache";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import { prisma } from "@/lib/db";
import type { Locale } from "@/lib/i18n";
import {
  getIntakeFolderCompanyId,
  setIntakeFolderCompanyId,
} from "@/lib/intake-company";
import { retryFailedIntake } from "@/lib/intake-folder";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

const BASE_PATH = "/settings/order-intake";

/**
 * 取込フォルダを今すぐスキャンする（ポーラーを待たない）。
 *
 * 実処理は既存の `scanIntakeFolder` そのもの — 再入ガードがあるので、
 * ポーラーと重なっても二重取込にはならない。抽出まで走るため、待ちが多いと
 * 時間がかかる。画面は「開始した」ことだけ返して待たない。
 */
export async function scanIntakeFolderNow(): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  try {
    const { scanIntakeFolder } = await import("@/lib/intake");
    // 待たない: 抽出は 1 件 30〜60 秒。完了は一覧の更新で確認する。
    void scanIntakeFolder().catch((e) =>
      console.error("[intake] manual scan", e),
    );
    revalidatePath(BASE_PATH);
    return actionOk();
  } catch (e) {
    console.error("[order-intake] scan", e);
    return actionError(tr("settings.orderIntakeActions.scanStartFailed"));
  }
}

/**
 * 取込口の自社法人を保存する（null = 既定の法人に従う）。
 *
 * 取込で作る注文請書は作成時にこの法人を持ち、以後は変えられない。変更が
 * 効くのは**これから取り込む分**だけ（取込済みの請書は動かない）。
 */
export async function updateIntakeCompany(
  ownCompanyId: number | null,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = z.number().int().positive().nullable().safeParse(ownCompanyId);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  try {
    if (parsed.data != null) {
      const company = await prisma.ownCompany.findUnique({
        where: { id: parsed.data },
        select: { isActive: true },
      });
      if (!company?.isActive) {
        return actionError(tr("settings.orderIntake.intakeCompanyInvalid"));
      }
    }
    const before = await getIntakeFolderCompanyId();
    await setIntakeFolderCompanyId(parsed.data);
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "intake.folder_own_company_id",
      before: { ownCompanyId: before },
      after: { ownCompanyId: parsed.data },
    });
    revalidatePath(BASE_PATH);
    return actionOk();
  } catch (e) {
    console.error("[order-intake] company", e);
    return actionError(tr("common.saveFailed"));
  }
}

const fileNameInput = z.string().min(1).max(255);

/** failed/ のファイルを取込待ちへ戻す。 */
export async function retryFailedIntakeFile(
  fileName: string,
): Promise<ActionResult<{ name: string }>> {
  const tr = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = fileNameInput.safeParse(fileName);
  if (!parsed.success)
    return actionError(tr("settings.orderIntakeActions.invalidFileName"));
  try {
    const name = await retryFailedIntake(parsed.data, locale);
    await recordAudit({
      action: "UPDATE",
      tableName: "intake_folder",
      recordId: name,
      after: { action: "RETRY", from: `failed/${parsed.data}`, to: name },
    });
    revalidatePath(BASE_PATH);
    return actionOk({ name });
  } catch (e) {
    console.error("[order-intake] retry", e);
    return actionError(
      e instanceof Error
        ? e.message
        : tr("settings.orderIntakeActions.retryFailed"),
    );
  }
}
