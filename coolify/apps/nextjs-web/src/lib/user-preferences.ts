import "server-only";

/**
 * user-preferences.ts — ログイン中ユーザーの表示設定の読み書き（server-only）。
 *
 * 値は app.users の locale / date_format / time_format / time_zone /
 * text_scale / bold_text。
 * 言語列（locale）はキオスクと共有なので、ここでの変更はタブレット側の
 * 表示にも効く。純ロジック（型・既定値・正規化）は user-preferences-core.ts。
 *
 * サーバーコンポーネントでの使い方:
 *   const fmt = await getServerFormatters();      // 日時整形
 *   const t   = await getTranslations("shell");   // UI 文言（next-intl）
 * 前者は `cache()` 済みなので 1 リクエスト内で何度呼んでも DB は 1 回。
 * next-intl 側も同じ設定を見る（src/i18n/request.ts がここを読む）。
 */

import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "./db";
import { createFormatters, type Formatters } from "./format";
import type { Locale } from "./i18n";
import {
  DEFAULT_PREFERENCES,
  type DisplayPreferences,
  normalizePreferences,
} from "./user-preferences-core";

/**
 * ログイン中ユーザーの表示設定。未ログイン・行なし・DB 障害時は既定
 * （日本語 / JST）へ倒す — 表示設定が読めないだけで画面を落とさない。
 */
export const getCurrentPreferences = cache(
  async (): Promise<DisplayPreferences> => {
    const session = await auth();
    const username = (session?.user as { username?: string } | undefined)
      ?.username;
    if (!username) return DEFAULT_PREFERENCES;
    try {
      const row = await prisma.user.findUnique({
        where: { username },
        select: {
          locale: true,
          dateFormat: true,
          timeFormat: true,
          timeZone: true,
          textScale: true,
          boldText: true,
        },
      });
      return row ? normalizePreferences(row) : DEFAULT_PREFERENCES;
    } catch {
      return DEFAULT_PREFERENCES;
    }
  },
);

/** サーバーコンポーネント用の整形関数一式（ユーザー設定に従う）。 */
export async function getServerFormatters(): Promise<Formatters> {
  return createFormatters(await getCurrentPreferences());
}

/**
 * サーバーコンポーネント用の言語だけが欲しいとき。
 * 文言は next-intl の `getTranslations()` を使うこと（この値は
 * src/i18n/request.ts 経由で next-intl 側にも渡っている）。
 */
export async function getServerLocale(): Promise<Locale> {
  return (await getCurrentPreferences()).locale;
}

/**
 * 表示設定を保存する。呼び出し元（Server Action）が本人確認済みである前提で、
 * ここは「自分の行」だけを更新する（username はセッション由来）。
 */
export async function saveCurrentPreferences(
  prefs: DisplayPreferences,
): Promise<{ before: DisplayPreferences; after: DisplayPreferences } | null> {
  const session = await auth();
  const username = (session?.user as { username?: string } | undefined)
    ?.username;
  if (!username) return null;

  const current = await prisma.user.findUnique({
    where: { username },
    select: {
      locale: true,
      dateFormat: true,
      timeFormat: true,
      timeZone: true,
      textScale: true,
      boldText: true,
    },
  });
  if (!current) return null;

  await prisma.user.update({
    where: { username },
    data: {
      locale: prefs.locale,
      dateFormat: prefs.dateFormat,
      timeFormat: prefs.timeFormat,
      timeZone: prefs.timeZone,
      textScale: prefs.textScale,
      boldText: prefs.boldText,
    },
  });
  return { before: normalizePreferences(current), after: prefs };
}
