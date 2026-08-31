/**
 * portal-page.tsx — 取引先ポータルのページゲート。server-only.
 *
 * 各 page.tsx の先頭 2 行で使う（authz-page.tsx と同じ機械的パターン）:
 *   const gate = await requirePortalView();
 *   if (!gate.ok) return gate.view;
 *
 * ■ ここが見るもの（順番に意味がある）
 *   1. 機能フラグ（src/config/dev-features.json）— OFF なら notFound()。
 *      main には**この面が存在しない**という扱いにする。
 *   2. ポータルセッション — 無ければ /portal/login へ。
 *   3. 対象を渡された場合は portal_grants で 1 件ごとの可否を判定。
 *
 * ■ 拒否は 404 で返す
 *   「権限がありません」は、その書類が**存在する**ことを教えてしまう。
 *   社外向けの面では、見えないものは存在しないものと区別できないほうがよい。
 *
 * ■ レイアウトにも同じゲートを置いてある
 *   ルートハンドラ（/portal/api/*）はレイアウトを通らないので、そちらは
 *   個別に isDevFeatureEnabled を見る。scripts/check-page-gates.sh が
 *   貼り忘れを検出する。
 */

import "server-only";

import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { isDevFeatureEnabled } from "@/lib/dev-features";
import { portalAccessFor } from "@/lib/portal-access";
import type { PortalTarget } from "@/lib/portal-access-core";
import { getPortalSession, type PortalSession } from "@/lib/portal-auth";

export type PortalGate =
  | { ok: true; session: PortalSession }
  | { ok: false; view: ReactNode };

/**
 * ポータルのページを開いてよいか。
 *
 * target を渡すと、その 1 件を見てよいかまで判定する（一覧ページでは省略し、
 * 一覧の SQL 側で portalScopeBpIds を使って絞る）。
 */
export async function requirePortalView(
  target?: PortalTarget,
): Promise<PortalGate> {
  if (!isDevFeatureEnabled("portal")) notFound();

  const session = await getPortalSession();
  if (!session) redirect("/portal/login");

  if (target) {
    const access = await portalAccessFor(session, target);
    // 見えないものは「無い」と同じ扱いにする（存在を漏らさない）。
    if (!access.canView) notFound();
  }

  return { ok: true, session };
}

/**
 * 機能フラグだけを見るゲート（ログイン画面のように、セッションが無くて
 * 当然の面で使う）。
 */
export function requirePortalFeature(): void {
  if (!isDevFeatureEnabled("portal")) notFound();
}
