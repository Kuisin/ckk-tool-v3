/**
 * kiosk-settings.ts — キオスク設定の**読み取り専用**アダプタ。server-only.
 *
 * 管理は nextjs-web の SY0A（/settings/kiosk）が行い、app.system_settings の
 * `kiosk.apps` に保存する（nextjs-web/src/lib/kiosk-settings.ts と対応）。
 * ここではランチャーの表示 on/off を読むだけ。未設定・不正時は「全て有効」。
 */

import { prisma } from "./db";

const APPS_KEY = "kiosk.apps";

/**
 * ランチャーのアプリ表示フラグ（appKey → 有効か）。
 * 明示的に false のものだけ無効。未登録キーは有効扱い。
 */
export async function getKioskAppFlags(): Promise<Record<string, boolean>> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: APPS_KEY },
    select: { value: true },
  });
  const value = row?.value;
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const flags: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean") flags[k] = v;
  }
  return flags;
}

/** そのアプリがランチャーに表示可能か（既定 = 有効）。 */
export function isKioskAppEnabled(
  flags: Record<string, boolean>,
  key: string,
): boolean {
  return flags[key] !== false;
}
