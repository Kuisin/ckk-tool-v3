import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import {
  AppAvailabilityGuard,
  AppFlagsProvider,
} from "@/components/layout/AppFlags";
import { DashboardShell } from "@/components/layout/AppShell";
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
        文言（next-intl）と日時整形（PreferencesProvider）の 2 段。どちらも
        同じ app.users の設定を見る（src/i18n/request.ts / getCurrentPreferences）。
        NextIntlClientProvider はサーバーで描画されるとリクエストの locale /
        messages / timeZone をそのまま引き継ぐので、props は要らない。
        ダッシュボード配下だけに掛ける — 公開マニュアルは翻訳対象外で、
        ここで包むと静的化を落としてしまうため。
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
