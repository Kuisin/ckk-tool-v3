/**
 * global.d.ts — next-intl の型付け。
 *
 * ja.json を正として `useTranslations("shell")` / `t("logout")` のキーを
 * コンパイル時に検査させる（キーのタイプミス・未定義キーがビルドで落ちる）。
 * 翻訳漏れは en/zh の JSON を見れば分かるので、型は ja だけを見る。
 */

import type messages from "../messages/ja.json";
import type { LOCALES } from "@/lib/i18n";

declare module "next-intl" {
  interface AppConfig {
    Messages: typeof messages;
    Locale: (typeof LOCALES)[number];
  }
}
