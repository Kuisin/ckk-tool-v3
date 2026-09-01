"use client";

/**
 * useTr.ts — クライアント側から ja 鍵の対訳を引くフック。
 *
 * `const tr = useTr()` → `tr("保存に失敗しました")`。
 * 仕組みと「なぜ ja を鍵にするのか」は `lib/ui-text.ts` の冒頭を読むこと。
 *
 * locale は next-intl（`useLocale`）から取る — 表示言語の出どころを 1 本に
 * するため（`src/i18n/request.ts` が DB の表示設定から決めている）。
 */

import { useLocale } from "next-intl";
import { useMemo } from "react";
import type { Locale } from "@/lib/i18n";
import { createTranslate, type Translate } from "@/lib/ui-text";

export function useTr(): Translate {
  const locale = useLocale() as Locale;
  return useMemo(() => createTranslate(locale), [locale]);
}
