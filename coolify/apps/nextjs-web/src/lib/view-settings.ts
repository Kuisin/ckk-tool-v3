import "server-only";

/**
 * view-settings.ts — 画面ごとの個人設定の読み書き（server-only）。
 *
 * app.user_view_settings（1 行 = 1 ユーザー × 1 キー）の薄い入口。
 * system_settings に対する lib/app-config.ts と同じ役割で、こちらは個人の分。
 * **値の意味は呼び出し側が持つ** — ここは JSON をそのまま出し入れするだけで、
 * 検証は各画面の純関数（例: lib/tasks-tabs.ts sanitizeHiddenTabs）が行う。
 */

import { prisma } from "./db";

export async function readViewSetting(
  userId: string | null | undefined,
  key: string,
): Promise<unknown> {
  if (!userId) return null;
  try {
    const row = await prisma.userViewSetting.findUnique({
      where: { userId_key: { userId, key } },
      select: { value: true },
    });
    return row?.value ?? null;
  } catch {
    // 見た目の好みが読めないだけで画面を落とさない（既定表示に落ちる）。
    return null;
  }
}

export async function writeViewSetting(
  userId: string,
  key: string,
  value: object,
): Promise<void> {
  await prisma.userViewSetting.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value },
    update: { value },
  });
}
