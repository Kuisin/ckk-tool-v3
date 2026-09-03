"use server";

/**
 * Server Actions — 通知メール設定（SY0F）。
 *
 * 保存は `notification_email.*` の upsert。秘密は扱わないので、監査ログには
 * 設定内容をそのまま before/after で残す。
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { recordAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/authz";
import {
  type NotificationEmailSettings,
  notificationEmailSettingsSchema,
} from "@/lib/notification-email-core";
import {
  getNotificationEmailSettings,
  saveNotificationEmailSettings,
} from "@/lib/notification-email-settings";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

const BASE_PATH = "/settings/notification-email";

export async function updateNotificationEmailSettings(
  payload: NotificationEmailSettings,
): Promise<ActionResult> {
  const tr = await getTranslations();
  const authz = await checkPermission("system", "UPDATE");
  if (!authz.ok) return actionError(authz.error);

  const parsed = notificationEmailSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? tr("common.invalidInput"),
    );
  }

  try {
    const before = await getNotificationEmailSettings();
    await saveNotificationEmailSettings(parsed.data);
    await recordAudit({
      action: "UPDATE",
      tableName: "system_settings",
      recordId: "notification_email",
      before,
      after: parsed.data,
    });
    revalidatePath(BASE_PATH);
    return actionOk();
  } catch (e) {
    console.error(tr("settings.notificationEmailActions.saveFailedLog"), e);
    return actionError(tr("settings.aiProviderActions.saveFailed"));
  }
}
