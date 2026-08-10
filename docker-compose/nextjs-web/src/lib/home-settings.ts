import "server-only";

/**
 * home-settings.ts — ホーム画面カスタマイズの読み出し（server-only）。
 *
 * app.user_home_settings（1 行 = 1 ユーザー）を読み、appList の実在キーで
 * 正規化して返す。行が無ければ既定（カテゴリ別・お気に入りなし）。
 * 書き込みは Server Action（app/(dashboard)/profile/home/actions.ts）。
 */

import { appList } from "./app-list";
import { prisma } from "./db";
import {
  DEFAULT_HOME_SETTINGS,
  type HomeSettings,
  sanitizeHomeSettings,
} from "./home-settings-core";

export function validAppKeys(): Set<string> {
  return new Set(appList.map((a) => a.key));
}

export async function readHomeSettings(
  userId: string | null | undefined,
): Promise<HomeSettings> {
  if (!userId) return DEFAULT_HOME_SETTINGS;
  const row = await prisma.userHomeSetting.findUnique({
    where: { userId },
    select: { mode: true, starred: true, groups: true },
  });
  if (!row) return DEFAULT_HOME_SETTINGS;
  return sanitizeHomeSettings(row, validAppKeys());
}
