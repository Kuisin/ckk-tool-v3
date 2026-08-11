/**
 * app-list.ts — キオスクランチャーのアプリ登録簿。
 *
 * nextjs-web の app-list.ts と同じエントリ形。現時点は「ランチャーシェルのみ」
 * リリースなのでアプリは空 — 業務アプリ（工程実行など）は後続 PR でここに
 * 追加する。requiredPermission は app.permissions のコード（READ で表示）。
 */

import type { Icon } from "@tabler/icons-react";

export type KioskAppEntry = {
  key: string;
  label: string;
  href: string;
  icon: Icon;
  requiredPermission: string;
};

export const KIOSK_APPS: KioskAppEntry[] = [
  // 例（後続 PR）:
  // {
  //   key: "step-execution",
  //   label: "工程実行",
  //   href: "/steps",
  //   icon: IconSettings2,
  //   requiredPermission: "work_order",
  // },
];

/** ユーザーの permission_code 集合（authz.readableCodes）で表示フィルタ。 */
export function visibleApps(codes: Set<string>): KioskAppEntry[] {
  if (codes.has("*")) return KIOSK_APPS;
  return KIOSK_APPS.filter((app) => codes.has(app.requiredPermission));
}
