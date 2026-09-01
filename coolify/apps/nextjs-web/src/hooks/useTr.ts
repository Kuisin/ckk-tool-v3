"use client";

/**
 * useTr.ts — クライアント側から ja 鍵の対訳を引くフック。
 *
 * `const tr = useTr()` → `tr("保存に失敗しました")`。
 * 仕組みと「なぜ ja を鍵にするのか」は `lib/ui-text.ts` の冒頭を読むこと。
 *
 * ■ locale は next-intl ではなく PreferencesProvider から取る
 * 表示言語の**出どころ**は 1 本（DB の `app.users.locale`）で、next-intl の
 * `src/i18n/request.ts` も PreferencesProvider も同じ `getCurrentPreferences()`
 * を読む。どちらから取っても値は同じなので、**Provider の外で落ちないほう**を
 * 選んでいる:
 *
 *   next-intl の `useLocale()`      … Provider の外では**例外を投げる**
 *   `usePreferences()`              … Context に既定値があるので ja で返る
 *
 * これは実際に効く違いだった。`NextIntlClientProvider` は **`(dashboard)`
 * レイアウトにだけ**置いてある（公開ページ `/manual` の静的生成を壊さないため。
 * `CLAUDE.md` にも「ルートレイアウトへ移すな」とある）。その外側にも画面はあり —
 * ルートの `not-found.tsx`、`error.tsx`、取引先ポータル、フォームの公開ページ —
 * そこで `useLocale()` を呼ぶと `/_not-found` の静的生成がビルドごと落ちた。
 *
 * Provider の外では ja に倒れる。辞書に無ければ日本語のまま返すという
 * `lib/ui-text.ts` の約束と同じ倒れ方で、表示言語が既定に戻るだけで壊れない。
 */

import { useMemo } from "react";
import { usePreferences } from "@/components/layout/PreferencesProvider";
import { createTranslate, type Translate } from "@/lib/ui-text";

export function useTr(): Translate {
  const { locale } = usePreferences();
  return useMemo(() => createTranslate(locale), [locale]);
}
