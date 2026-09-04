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
 * ■ 行き先を出すかどうかはここで決める
 * ヘッダーの行き先（書類・注文の進捗・フォーム）は**通常ログインのセッション**
 * を持つ人にだけ出す。リンク限定セッション（/portal/d/<token> 経由）が見て
 * よいのはその書類 1 件だけで、一覧も進捗も空になるため、空の画面へ誘う導線を
 * 置かない。ログイン画面（セッション無し）でも同じ理由で出さない。
 *
 * ■ NextIntlClientProvider はマウントしない
 * i18n の locale は app.users から引くので、社内セッションを持たない
 * ポータルでは意味が無い。root へ上げると /manual の静的レンダリングが
 * 壊れるという既知の制約もある。/login と同じく ja 固定。
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/PortalShell";
import { getPortalSession } from "@/lib/portal-auth";
import { requirePortalFeature } from "@/lib/portal-page";

export const metadata: Metadata = {
  // 社外向けだが検索には出さない（/f/<code> や /l/<code> と同じ扱い）。
  robots: { index: false, follow: false },
};

export default async function PortalLayout({
  children,
}: {
  children: ReactNode;
}) {
  requirePortalFeature();
  const session = await getPortalSession();
  return <PortalShell nav={!!session?.accountId}>{children}</PortalShell>;
}
