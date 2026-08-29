import "server-only";

/**
 * notification-email-settings.ts — 通知メール設定の読み書き（SY0F）。
 *
 * 汎用の設定表（`app.system_settings`）へ `notification_email.*` として置く
 * ので、項目を足しても DB の変更は要らない（lib/app-config.ts の規約）。
 * 値の意味・既定・検証は `notification-email-core.ts` が持つ。
 */

import { readConfigNamespace, writeConfigValues } from "./app-config";
import {
  DEFAULT_NOTIFICATION_EMAIL_SETTINGS,
  type NotificationEmailSettings,
  notificationEmailSettingsSchema,
} from "./notification-email-core";

const KEY_MAP: Record<keyof NotificationEmailSettings, string> = {
  digestEnabled: "notification_email.digest_enabled",
  intervalMinutes: "notification_email.interval_minutes",
  graceMinutes: "notification_email.grace_minutes",
  immediateTypes: "notification_email.immediate_types",
  maxItemsPerMail: "notification_email.max_items_per_mail",
};

/**
 * 現在の設定。未設定のキーは既定で埋める。
 *
 * **壊れた値で通知を止めない** — 1 つでも検証に落ちたら既定に倒す。ここは
 * 通知の配信経路そのものなので、設定の不備で例外を投げると通知が全部
 * 止まる（設定画面から直せるまでの間ずっと）。
 */
export async function getNotificationEmailSettings(): Promise<NotificationEmailSettings> {
  const stored = await readConfigNamespace("notification_email");
  const raw = {
    digestEnabled: stored.get(KEY_MAP.digestEnabled),
    intervalMinutes: stored.get(KEY_MAP.intervalMinutes),
    graceMinutes: stored.get(KEY_MAP.graceMinutes),
    immediateTypes: stored.get(KEY_MAP.immediateTypes),
    maxItemsPerMail: stored.get(KEY_MAP.maxItemsPerMail),
  };
  const merged = { ...DEFAULT_NOTIFICATION_EMAIL_SETTINGS };
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  const parsed = notificationEmailSettingsSchema.safeParse(merged);
  if (!parsed.success) {
    console.error(
      "[notification-email] 設定が不正なので既定で動かします:",
      parsed.error.issues,
    );
    return DEFAULT_NOTIFICATION_EMAIL_SETTINGS;
  }
  return parsed.data;
}

export async function saveNotificationEmailSettings(
  settings: NotificationEmailSettings,
): Promise<void> {
  await writeConfigValues({
    [KEY_MAP.digestEnabled]: settings.digestEnabled,
    [KEY_MAP.intervalMinutes]: settings.intervalMinutes,
    [KEY_MAP.graceMinutes]: settings.graceMinutes,
    [KEY_MAP.immediateTypes]: settings.immediateTypes,
    [KEY_MAP.maxItemsPerMail]: settings.maxItemsPerMail,
  });
}
