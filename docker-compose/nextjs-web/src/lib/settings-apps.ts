/**
 * settings-apps.ts — registry of apps that expose configurable settings.
 *
 * Drives the「アプリ設定」section of the system hub (`/settings`) and the app
 * settings index (`/settings/apps`). Each entry points at that app's dedicated
 * settings page. Client-safe (pure data) so both server pages and client
 * components can render the list. Add an entry here when a new app gains a
 * settings screen.
 */

export interface SettingsApp {
  /** Stable key (mirrors app-list key where an app maps 1:1). */
  key: string;
  /** Display label. */
  label: string;
  /** One-line description of what is configurable. */
  description: string;
  /** Settings page route. */
  href: string;
  /** Tabler icon name (resolved via lib/icons.ts ICON_MAP). */
  icon: string;
  /** Related app operation code, for cross-reference. */
  operationCode?: string;
}

export const SETTINGS_APPS: SettingsApp[] = [
  {
    key: "trial-pricing-engine",
    label: "試算計算",
    description:
      "見積試算の計算ロジック — 計算基準（自由設定）・カスタム入力項目・材料参照価格ポリシー・既定係数・カスタム計算（JS）。",
    href: "/settings/trial-pricing-engine",
    icon: "IconMathFunction",
    operationCode: "SY02",
  },
  {
    key: "product-types",
    label: "製品種別",
    description:
      "製品種別（テンプレート）— 新規製品作成時に展開する入力項目を種別ごとに定義（文字列/数値/真偽/選択/日付の型で入力を検証）。",
    href: "/settings/product-types",
    icon: "IconCategory",
    operationCode: "SY04",
  },
];

export function findSettingsApp(key: string): SettingsApp | undefined {
  return SETTINGS_APPS.find((a) => a.key === key);
}
