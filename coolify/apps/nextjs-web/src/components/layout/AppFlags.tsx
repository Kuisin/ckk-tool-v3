"use client";

/**
 * AppFlags.tsx — アプリ ON/OFF フラグ + 権限可視性のクライアント配布。
 *
 * (dashboard) layout（サーバー）が feature_flags から現環境の無効アプリ key と、
 * user_permissions から権限的に見えないアプリ key（denied）を読み、Provider で
 * 配る。ランチャー・ホーム・操作コード検索は useHiddenApps()（無効 ∪ 権限外）
 * で絞り込み、AppAvailabilityGuard は URL 直アクセスを差し替える。
 *
 * フラグは fail-open（DB 障害時は全表示）だが、権限可視性は fail-closed
 * （権限が読めなければ gated アプリは非表示）— サーバー側 layout が担保。
 * 実データの防壁はあくまで各 page の requireAppRead / アクションの
 * checkPermission であり、この配布は表示専用。
 */

import { IconLock } from "@tabler/icons-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { appList } from "@/lib/app-list";

interface AppFlagsValue {
  disabled: ReadonlySet<string>;
  /** main（本番）で無効 = 未リリースのアプリ（dev では DEV リボン表示）。 */
  unreleased: ReadonlySet<string>;
  /** READ 権限が無く表示しないアプリ key。 */
  denied: ReadonlySet<string>;
}

const AppFlagsContext = createContext<AppFlagsValue>({
  disabled: new Set(),
  unreleased: new Set(),
  denied: new Set(),
});

export function AppFlagsProvider({
  disabledKeys,
  unreleasedKeys = [],
  deniedKeys = [],
  children,
}: {
  disabledKeys: string[];
  unreleasedKeys?: string[];
  deniedKeys?: string[];
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      disabled: new Set(disabledKeys),
      unreleased: new Set(unreleasedKeys),
      denied: new Set(deniedKeys),
    }),
    [disabledKeys, unreleasedKeys, deniedKeys],
  );
  return (
    <AppFlagsContext.Provider value={value}>
      {children}
    </AppFlagsContext.Provider>
  );
}

/** 現環境で無効化されたアプリ key の Set。 */
export function useDisabledApps(): ReadonlySet<string> {
  return useContext(AppFlagsContext).disabled;
}

/** 未リリース（main で無効）のアプリ key の Set — DEV リボン用。 */
export function useUnreleasedApps(): ReadonlySet<string> {
  return useContext(AppFlagsContext).unreleased;
}

/** READ 権限が無いアプリ key の Set。 */
export function useDeniedApps(): ReadonlySet<string> {
  return useContext(AppFlagsContext).denied;
}

/** 表示から隠すアプリ key（無効 ∪ 権限外）— ランチャー/ホーム/検索用。 */
export function useHiddenApps(): ReadonlySet<string> {
  const { disabled, denied } = useContext(AppFlagsContext);
  return useMemo(() => new Set([...disabled, ...denied]), [disabled, denied]);
}

/** pathname がどのアプリ（appList entry）に属するか。属さなければ null。 */
export function appKeyForPath(pathname: string): string | null {
  let best: { key: string; len: number } | null = null;
  for (const app of appList) {
    if (pathname === app.href || pathname.startsWith(`${app.href}/`)) {
      if (!best || app.href.length > best.len) {
        best = { key: app.key, len: app.href.length };
      }
    }
  }
  return best?.key ?? null;
}

/**
 * 無効/権限外アプリの URL 直アクセスガード。該当なら本文を差し替える。
 * （メニューから消えるだけでなく、ブックマーク等の直リンクも塞ぐ。
 * 権限外はクライアント表示の速路 — サーバー側の実防壁は requireAppRead。）
 */
export function AppAvailabilityGuard({ children }: { children: ReactNode }) {
  const tr = useTranslations();
  const disabled = useDisabledApps();
  const denied = useDeniedApps();
  const pathname = usePathname();
  const appKey = appKeyForPath(pathname);
  if (appKey && disabled.has(appKey)) {
    return (
      <EmptyState
        icon={<IconLock size={24} />}
        message={tr("layout.appFlags.thisFeatureIsNotAvailableRight")}
      />
    );
  }
  if (appKey && denied.has(appKey)) {
    return (
      <EmptyState
        icon={<IconLock size={24} />}
        message={tr("layout.appFlags.youDoNotHavePermissionTo")}
      />
    );
  }
  return <>{children}</>;
}
