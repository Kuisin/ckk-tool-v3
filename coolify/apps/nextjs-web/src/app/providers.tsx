"use client";

/**
 * providers.tsx — Client-side provider stack.
 *
 * MantineProvider (theme) + ModalsProvider (confirm dialogs, design.md §10.4)
 * + Notifications (toasts, design.md §16.1). Kept in a 'use client' file so the
 * theme object (contains component extensions) never crosses the RSC boundary.
 *
 * PullToRefresh はここに置く — ダッシュボードだけでなくマニュアル・ログインも
 * 含めた全ページで、ホーム画面 PWA の「引き下げて更新」を効かせるため。
 */

import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import "dayjs/locale/ja";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { PullToRefresh } from "@/components/layout/PullToRefresh";
import ja from "../../messages/ja.json";
import { theme } from "./theme";

/**
 * ここに **既定（ja・静的）の next-intl プロバイダ**を置く理由。
 *
 * `useTranslations()`（本物の next-intl フック）は `NextIntlClientProvider`
 * の外で呼ぶと**例外を投げる**。以前の `useTr()` は `usePreferences()` に
 * 独自に逃がしていたので気づかなかったが、本物の next-intl へ切り替えた今、
 * この土台が無いと `/_not-found` や取引先ポータルのようにダッシュボードの
 * 外にある画面がビルドごと落ちる（実際に落ちた）。
 *
 * `(dashboard)` レイアウトの `<NextIntlClientProvider>`（引数無し = リクエスト
 * の locale/messages をそのまま引き継ぐ）は、この既定の**内側にネストする**
 * ので、ダッシュボード配下ではそちらが勝つ——利用者ごとの言語切り替えは
 * 今までどおり効く。ここは DB を読まない**静的な ja 固定**なので、
 * `/manual` 等の公開ページの静的化を壊さない（何を混ぜても崩れる懸念が
 * あったのは `getCurrentPreferences()` のようなリクエスト依存の解決だけ）。
 *
 * `timeZone="Asia/Tokyo"` も明示する — 省略すると next-intl が
 * `ENVIRONMENT_FALLBACK` を警告する（ビルド環境と閲覧環境で相対時刻の描画が
 * ずれうるため）。ここは個人設定を読まない既定の土台なので、PDF・メールと
 * 同じ JST 固定（`documentFormatters`）に揃える。
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ja" messages={ja} timeZone="Asia/Tokyo">
      <MantineProvider defaultColorScheme="light" theme={theme}>
        <DatesProvider settings={{ locale: "ja", firstDayOfWeek: 0 }}>
          <ModalsProvider>
            <Notifications position="top-right" />
            <PullToRefresh />
            {children}
          </ModalsProvider>
        </DatesProvider>
      </MantineProvider>
    </NextIntlClientProvider>
  );
}
