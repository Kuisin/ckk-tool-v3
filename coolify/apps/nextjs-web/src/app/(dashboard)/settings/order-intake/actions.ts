"use server";

/**
 * Server Actions — 注文書取込（SY0C）.
 *
 * 取込フォルダの操作のうち、ファイル本体を運ばないもの（今すぐスキャン /
 * 失敗の再取込）。**投入は Server Action ではなく** `/api/intake/folder`
 * （ボディ 1MB 制限のため。app CLAUDE.md 参照）。権限は `system`。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
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
    return actionError("スキャンの開始に失敗しました");
  }
}

const fileNameInput = z.string().min(1).max(255);

/** failed/ のファイルを取込待ちへ戻す。 */
export async function retryFailedIntakeFile(
  fileName: string,
): Promise<ActionResult<{ name: string }>> {
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = fileNameInput.safeParse(fileName);
  if (!parsed.success) return actionError("ファイル名が不正です");
  try {
    const name = await retryFailedIntake(parsed.data);
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
    return actionError(e instanceof Error ? e.message : "再取込に失敗しました");
  }
}
