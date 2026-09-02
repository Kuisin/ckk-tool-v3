"use server";

/**
 * Server Actions — キオスク設定（SY0A）.
 *
 * app.system_settings の `kiosk.apps`（キオスクランチャーの表示 on/off）を
 * 保存する。読み出しは lib/kiosk-settings.ts。権限は `kiosk`（管理者）。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import {
  getKioskAppFlags,
  KIOSK_APP_CATALOG,
  setKioskAppFlags,
} from "@/lib/kiosk-settings";
import {
  type ActionResult,
  actionError,
  actionOk,
  prismaErrorMessage,
} from "@/lib/server-action";

const BASE_PATH = "/settings/kiosk";

const flagsInput = z.record(z.string(), z.boolean());

/** キオスクランチャーのアプリ表示フラグを保存する。 */
export async function updateKioskAppFlags(
  flags: Record<string, boolean>,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("kiosk", "UPDATE");
  if (!authz.ok) return actionError(authz.error);
  const parsed = flagsInput.safeParse(flags);
  if (!parsed.success) return actionError(tr("common.invalidInput"));
  try {
    const before = await getKioskAppFlags();
    await setKioskAppFlags(parsed.data);
    const after = await getKioskAppFlags();
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "kiosk.apps",
      before,
      after,
    });
    revalidatePath(BASE_PATH);
    return actionOk();
  } catch (e) {
    return actionError(prismaErrorMessage(e, tr("common.couldNotSave"), tr));
  }
}

/** カタログ + 現在のフラグ（クライアントの初期表示用）。 */
export async function loadKioskAppFlags() {
  // 読み取りだけでも kiosk:READ。ランチャーの構成は公開情報ではない。
  if (!(await checkPermission("kiosk", "READ")).ok) {
    return { catalog: KIOSK_APP_CATALOG, flags: {} as Record<string, boolean> };
  }
  return { catalog: KIOSK_APP_CATALOG, flags: await getKioskAppFlags() };
}
