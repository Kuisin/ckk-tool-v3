"use server";

/**
 * Server Actions — ホーム画面設定（本人のみ）。
 * お気に入り・表示モード・カスタムグループを app.user_home_settings へ upsert。
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { validAppKeys } from "@/lib/home-settings";
import {
  type HomeSettings,
  MAX_GROUP_NAME_LENGTH,
  MAX_HOME_GROUPS,
  sanitizeHomeSettings,
} from "@/lib/home-settings-core";
import { type ActionResult, actionError, actionOk } from "@/lib/server-action";

const homeSettingsSchema = z.object({
  mode: z.enum(["default", "custom"]),
  starred: z.array(z.string().max(100)).max(200),
  groups: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .min(1, "グループ名を入力してください")
          .max(
            MAX_GROUP_NAME_LENGTH,
            `グループ名は${MAX_GROUP_NAME_LENGTH}文字以内で入力してください`,
          ),
        apps: z.array(z.string().max(100)).max(200),
      }),
    )
    .max(MAX_HOME_GROUPS, `グループは${MAX_HOME_GROUPS}件までです`),
});

export async function saveHomeSettingsAction(
  input: HomeSettings,
): Promise<ActionResult> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return actionError("ログインが必要です");

  const parsed = homeSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "入力が不正です");
  }
  // 実在アプリ key への絞り込み・重複除去（未知 key は黙って落とす）
  const settings = sanitizeHomeSettings(parsed.data, validAppKeys());

  await prisma.userHomeSetting.upsert({
    where: { userId },
    create: {
      userId,
      mode: settings.mode,
      starred: settings.starred,
      groups: settings.groups,
    },
    update: {
      mode: settings.mode,
      starred: settings.starred,
      groups: settings.groups,
    },
  });

  revalidatePath("/");
  revalidatePath("/profile/home");
  return actionOk();
}
