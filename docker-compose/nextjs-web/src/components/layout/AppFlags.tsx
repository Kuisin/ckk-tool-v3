"use client";

/**
 * AppFlags.tsx — アプリ ON/OFF フラグのクライアント配布。
 *
 * (dashboard) layout（サーバー）が feature_flags から現環境の無効アプリ key を
 * 読み、Provider で配る。ランチャー・ホーム・操作コード検索は useDisabledApps()
 * で絞り込み、AppAvailabilityGuard は無効アプリの URL 直アクセスを差し替える。
 */

import { IconLock } from "@tabler/icons-react";
import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { appList } from "@/lib/app-list";

interface AppFlagsValue {
  disabled: ReadonlySet<string>;
  /** main（本番）で無効 = 未リリースのアプリ（dev では DEV リボン表示）。 */
  unreleased: ReadonlySet<string>;
}

const AppFlagsContext = createContext<AppFlagsValue>({
  disabled: new Set(),
  unreleased: new Set(),
});

export function AppFlagsProvider({
  disabledKeys,
  unreleasedKeys = [],
  children,
}: {
  disabledKeys: string[];
  unreleasedKeys?: string[];
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      disabled: new Set(disabledKeys),
      unreleased: new Set(unreleasedKeys),
    }),
    [disabledKeys, unreleasedKeys],
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
 * 無効アプリの URL 直アクセスガード。該当アプリが無効なら本文を差し替える。
 * （メニューから消えるだけでなく、ブックマーク等の直リンクも塞ぐ。）
 */
export function AppAvailabilityGuard({ children }: { children: ReactNode }) {
  const disabled = useDisabledApps();
  const pathname = usePathname();
  const appKey = appKeyForPath(pathname);
  if (appKey && disabled.has(appKey)) {
    return (
      <EmptyState
        icon={<IconLock size={24} />}
        message="この機能は現在利用できません"
      />
    );
  }
  return <>{children}</>;
}
