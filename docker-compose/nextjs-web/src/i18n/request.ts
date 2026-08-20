/**
 * i18n/request.ts — next-intl のリクエスト設定（**URL ルーティングなし**）。
 *
 * この製品の言語は URL（/en/... など）ではなく **ログイン中ユーザーの設定**
 * （app.users.locale）で決まる。next-intl の "without i18n routing" 構成に
 * あたるので、ここで DB の表示設定を読んで locale / messages / timeZone を
 * 返す。next.config.ts の createNextIntlPlugin がこのファイルを指している。
 *
 * timeZone も渡すのは、next-intl の日時フォーマッタを使う箇所が出てきても
 * lib/format.ts と同じタイムゾーンで揃うようにするため（日付の並びだけは
 * Intl のオプションで表現できないので lib/format.ts が持つ）。
 *
 * 文言は messages/<locale>.json。まだ移していない画面は日本語の直書きのまま
 * 動く（表示が日本語になるだけで壊れない）。
 */

import { getRequestConfig } from "next-intl/server";
import { getCurrentPreferences } from "@/lib/user-preferences";

export default getRequestConfig(async () => {
  const prefs = await getCurrentPreferences();
  return {
    locale: prefs.locale,
    timeZone: prefs.timeZone,
    messages: (await import(`../../messages/${prefs.locale}.json`)).default,
  };
});
