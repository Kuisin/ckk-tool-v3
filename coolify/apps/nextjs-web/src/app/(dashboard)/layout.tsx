import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import {
  AppAvailabilityGuard,
  AppFlagsProvider,
} from "@/components/layout/AppFlags";
import { DashboardShell } from "@/components/layout/AppShell";
import { DisplayPreferencesStyle } from "@/components/layout/DisplayPreferencesStyle";
import { NavigationGuardProvider } from "@/components/layout/NavigationGuard";
import { PreferencesProvider } from "@/components/layout/PreferencesProvider";
import { PwaRegister } from "@/components/layout/PwaRegister";
import { TableSettingsProvider } from "@/components/layout/TableSettingsProvider";
import { currentAppEnv, getDisabledAppKeys } from "@/lib/app-flags";
import { appList } from "@/lib/app-list";
import { getVisibleAppKeys, sessionUserId } from "@/lib/authz";
import { getCurrentProfile, isPasswordChangeRequired } from "@/lib/profile";
import {
  sanitizeHiddenColumns,
  TABLE_SETTING_PREFIX,
} from "@/lib/table-settings-core";
import { getCurrentPreferences } from "@/lib/user-preferences";
import { readViewSettings } from "@/lib/view-settings";

// feature_flags はリクエスト毎に読む（静的プリレンダだとビルド時の値で固まり、
// アプリ ON/OFF・DEV リボンが反映されない）。ダッシュボード配下は全て動的。
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // 初期パスワードのままなら、変更するまでダッシュボードには入れない。
  // /password-change は (auth) グループ ＝ このレイアウトの外なのでループしない。
  if (await isPasswordChangeRequired()) redirect("/password-change");
  // アプリの環境別 ON/OFF（feature_flags）。行が無ければ有効・失敗時は全表示。
  // main 無効 = 未リリース。DEV リボンは dev 環境のみ（main では未リリース
  // アプリ自体が非表示になるため、リボン情報は配布しない）。
  const isDevEnv = currentAppEnv() === "dev";
  const userId = await sessionUserId();
  // proxy.ts が唯一の門にならないようにする（監査 C1）。ミドルウェアの迂回
  // （Next の既知の advisory）や matcher の書き損じで proxy を抜けてきても、
  // ダッシュボード配下はセッションが無ければ描かない。requiredPermission が
  // null のアプリ（承認・予定 / フォーム / ファイル管理 …）は requireAppRead が
  // 「ログインのみ」で通すので、ここで止めないと未認証で描画される。
  if (!userId) redirect("/login");
  const [disabledKeys, unreleasedKeys, profile, visibleKeys, prefs, tableRows] =
    await Promise.all([
      getDisabledAppKeys(),
      isDevEnv ? getDisabledAppKeys("main") : Promise.resolve([]),
      getCurrentProfile(),
      getVisibleAppKeys(appList),
      // 表示設定（言語・日付・時刻・タイムゾーン）— 画面全体の日時整形と
      // UI 文言がこれを見る。SSR と同じ値をクライアントへ渡す。
      getCurrentPreferences(),
      // 一覧表の「表示する列」— 画面ごとに引くと表の数だけ往復するので、
      // ここで 1 回だけまとめて読んでクライアントへ配る。
      readViewSettings(userId, TABLE_SETTING_PREFIX),
    ]);
  const tableSettings = Object.fromEntries(
    Object.entries(tableRows).map(([key, value]) => [
      key,
      sanitizeHiddenColumns(value),
    ]),
  );
  // 権限外アプリ（READ なし）は表示から隠す — fail-closed（未ログイン/権限
  // 取得失敗時は gated アプリ全非表示）。実防壁は各 page の requireAppRead。
  const deniedKeys = appList
    .map((a) => a.key)
    .filter((key) => !visibleKeys.has(key));
  const headerUser = profile
    ? {
        displayName: profile.displayName,
        username: profile.username,
        initials: profile.initials,
        department: profile.department,
        title: profile.title,
        avatarUrl: profile.avatarUrl,
        avatarThumbUrl: profile.avatarThumbUrl,
      }
    : null;
  return (
    <AppFlagsProvider
      deniedKeys={deniedKeys}
      disabledKeys={disabledKeys}
      unreleasedKeys={unreleasedKeys}
    >
      <PwaRegister />
      {/*
        文字の大きさ・太さ（表示設定）。SSR で :root へ載せる — クライアントで
        当てると最初の描画だけ既定の大きさになり、画面が跳ねる。
      */}
      <DisplayPreferencesStyle prefs={prefs} />
      {/*
        文言（next-intl）と日時整形（PreferencesProvider）の 2 段。どちらも
        同じ app.users の設定を見る（src/i18n/request.ts / getCurrentPreferences）。
        NextIntlClientProvider はサーバーで描画されるとリクエストの locale /
        messages / timeZone をそのまま引き継ぐので、props は要らない。

        `app/providers.tsx` の**既定（ja・静的）プロバイダの内側にネストする**
        ので、ここが実効の値になる——利用者ごとの言語切り替えが効くのは
        ダッシュボード配下だけ。公開マニュアル・取引先ポータルは
        `getCurrentPreferences()`（DB 読み取り）を経由しないので、静的化は
        壊れない。
      */}
      <NextIntlClientProvider>
        <PreferencesProvider prefs={prefs}>
          <TableSettingsProvider initial={tableSettings}>
            <NavigationGuardProvider>
              <DashboardShell isDev={isDevEnv} user={headerUser}>
                <AppAvailabilityGuard>{children}</AppAvailabilityGuard>
              </DashboardShell>
            </NavigationGuardProvider>
          </TableSettingsProvider>
        </PreferencesProvider>
      </NextIntlClientProvider>
    </AppFlagsProvider>
  );
}
