/**
 * app-list.ts — キオスクランチャーのアプリ登録簿。
 *
 * nextjs-web の app-list.ts と同じエントリ形。ラベルは 3 言語（ja/en/zh）を
 * 出す必要があるので、文字列ではなく辞書キー（`labelKey`）で持ち、
 * サーバーページ側で `m.apps[labelKey]` に解決してからクライアントへ渡す。
 * requiredPermission は app.permissions のコード（READ を持てば表示）。
 */

import type { Icon } from "@tabler/icons-react";
import { IconQrcode, IconSettings2 } from "@tabler/icons-react";
import type { KioskMessages } from "./i18n";

export type KioskAppEntry = {
  key: string;
  /** i18n 辞書 `apps` 名前空間のキー。 */
  labelKey: keyof KioskMessages["apps"];
  href: string;
  icon: Icon;
  requiredPermission: string;
};

export const KIOSK_APPS: KioskAppEntry[] = [
  {
    key: "step-execution",
    labelKey: "stepExecution",
    href: "/steps",
    icon: IconSettings2,
    requiredPermission: "work_order",
  },
  {
    key: "wo-scan",
    labelKey: "woScan",
    href: "/wo-scan",
    icon: IconQrcode,
    requiredPermission: "work_order",
  },
];

/** ユーザーの permission_code 集合（authz.readableCodes）で表示フィルタ。 */
export function visibleApps(codes: Set<string>): KioskAppEntry[] {
  if (codes.has("*")) return KIOSK_APPS;
  return KIOSK_APPS.filter((app) => codes.has(app.requiredPermission));
}
