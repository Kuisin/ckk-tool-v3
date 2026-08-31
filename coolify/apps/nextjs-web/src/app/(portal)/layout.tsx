/**
 * (portal)/layout.tsx — 取引先ポータル（社外向け）のシェル。
 *
 * (dashboard) とは**別のレイアウト**にしてある。アプリランチャー・操作コード・
 * 通知・プロフィールメニューは社内の道具で、社外の人には出さない。
 *
 * ■ 機能フラグをここでも見る
 * requirePortalView() でも見ているが、レイアウトは全ページの唯一の親なので
 * 二重に置く。main では**この面が存在しない**（404）という扱い。
 *
 * ■ NextIntlClientProvider はマウントしない
 * i18n の locale は app.users から引くので、社内セッションを持たない
 * ポータルでは意味が無い。root へ上げると /manual の静的レンダリングが
 * 壊れるという既知の制約もある。/login と同じく ja 固定。
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { requirePortalFeature } from "@/lib/portal-page";

export const metadata: Metadata = {
  // 社外向けだが検索には出さない（/f/<code> や /l/<code> と同じ扱い）。
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: ReactNode }) {
  requirePortalFeature();
  return <PortalShell>{children}</PortalShell>;
}
