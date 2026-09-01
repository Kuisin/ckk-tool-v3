import "server-only";

/**
 * ui-text-server.ts — サーバー側（Server Component / Server Action / Route
 * Handler）から ja 鍵の対訳を引く。
 *
 * `const tr = await getTr()` → `tr("保存に失敗しました")`。
 * クライアント側は `hooks/useTr.ts`。仕組みは `lib/ui-text.ts` の冒頭。
 *
 * `server-only` を付けてあるのは、クライアントから間違って読まれたときに
 * **ビルドで落とす**ため（next-intl の `getLocale` はリクエストスコープに
 * 依存し、クライアントでは動かない）。
 */

import { getLocale } from "next-intl/server";
import type { Locale } from "./i18n";
import { createTranslate, type Translate } from "./ui-text";

export async function getTr(): Promise<Translate> {
  return createTranslate((await getLocale()) as Locale);
}
