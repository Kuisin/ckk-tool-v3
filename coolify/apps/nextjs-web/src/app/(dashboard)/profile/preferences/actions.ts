"use server";

/**
 * Server Actions — 表示設定（本人のみ）。
 * 言語・日付形式・時刻形式・タイムゾーン・文字の大きさ・文字を太くするを
 * app.users の各列へ保存する。
 *
 * 言語列（locale）はキオスクと共有なので、ここでの変更は共有タブレット側の
 * 表示にも効く。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recordAudit } from "@/lib/audit";
import { LOCALES } from "@/lib/i18n";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";
import { saveCurrentPreferences } from "@/lib/user-preferences";
import {
  DATE_FORMATS,
  type DisplayPreferences,
  isValidTimeZone,
  TEXT_SCALES,
  TIME_FORMATS,
} from "@/lib/user-preferences-core";

const preferencesSchema = z.object({
  locale: z.enum(LOCALES),
  dateFormat: z.enum(DATE_FORMATS),
  timeFormat: z.enum(TIME_FORMATS),
  // IANA 名は増えるので列挙せず、Intl が解決できるかで見る（DB 側も同様に
  // CHECK を置いていない — user-preferences-core.ts のコメント参照）。
  timeZone: z
    .string()
    .max(64)
    .refine(isValidTimeZone, "タイムゾーンを選択してください"),
  textScale: z.enum(TEXT_SCALES),
  boldText: z.boolean(),
});

export async function saveDisplayPreferences(
  input: DisplayPreferences,
): Promise<ActionResult> {
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }

  // 権限チェックは不要 — 自分の設定を自分で変えるだけで、対象行は
  // セッションの username から決まる（他人の行は触れない）。
  const saved = await saveCurrentPreferences(parsed.data);
  if (!saved) return actionError("ログインが必要です");

  await recordAudit({
    action: "UPDATE",
    tableName: "users",
    recordId: "self",
    before: saved.before,
    after: saved.after,
  });

  // 日時表示と UI 文言は全画面がこの設定を見るので、レイアウトごと作り直す。
  revalidatePath("/", "layout");
  return actionOk(undefined);
}
