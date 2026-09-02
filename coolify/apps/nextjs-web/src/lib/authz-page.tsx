/**
 * authz-page.tsx — ページ READ ゲート。server-only.
 *
 * 各 page.tsx の先頭 2 行で使う:
 *   const denied = await requireAppRead("quotes");
 *   if (denied) return denied;
 *
 * appList（lib/app-list.ts）の requiredPermission を唯一の対応表として、
 * READ（または ADMIN / system:ADMIN）が無ければ AccessDenied を描画して
 * 返す。null 権限アプリ（docs / files 等）はログインのみで許可。
 *
 * サブページ（new / [id] / [id]/edit）も親アプリの key を渡す。
 * appList に無いページ（/profile 等）はこのゲート対象外（セッションのみ）。
 *
 * レイアウトでなくページ毎に呼ぶ理由: セクションはコードが混在し
 * （production = work_order/approve/inventory）、App Router のレイアウトは
 * ソフトナビゲーションで再実行されないため。grep 可能な機械的パターンに
 * して CI ガード（scripts/check-page-gates.sh）で貼り忘れを検出する。
 */

import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AccessDenied } from "@/components/ui/AccessDenied";
import { appList, categoryLabel } from "@/lib/app-list";
import { checkPermission } from "@/lib/authz";
import { type LocalizedTextInput, localized } from "@/lib/format";
import { useElevation } from "@/lib/privileged-access";
import { findOperation } from "@/lib/privileged-operations";

/**
 * アプリの READ ゲート。許可なら null、拒否なら描画済みの AccessDenied を返す。
 */
export async function requireAppRead(
  appKey: string,
): Promise<ReactNode | null> {
  const app = appList.find((a) => a.key === appKey);
  if (!app) {
    throw new Error(`requireAppRead: unknown app key "${appKey}"`);
  }
  if (app.requiredPermission === null) {
    // 権限不要アプリ — ログインのみ（未ログインは proxy が /login へ）
    return null;
  }
  const authz = await checkPermission(app.requiredPermission, "READ");
  if (authz.ok) return null;
  return (
    <AccessDenied
      breadcrumbs={[app.category, app.label]}
      message={authz.error}
      title={app.label}
    />
  );
}

/**
 * 特権操作のページゲート。requireAppRead の直後に置く:
 *   const denied = await requireElevation("personal_data.activity_search");
 *   if (denied) return denied;
 *
 * **ここは意図的に「使う」側（useElevation）を呼ぶ。** 画面を開くこと自体が
 * その特権操作だからで（横断検索・履歴の閲覧）、開いた時点で持ち時間が動き
 * はじめるのが正しい。ボタンの活性を描くだけの場面は peekElevation を使うこと
 * — あちらは決して時計を動かさない。
 */
export async function requireElevation(
  operationKey: string,
): Promise<ReactNode | null> {
  const op = findOperation(operationKey);
  if (!op)
    throw new Error(`requireElevation: unknown operation ${operationKey}`);
  const gate = await useElevation(operationKey);
  if (gate.ok) return null;
  const locale = await getLocale();
  const label = localized(op.label as unknown as LocalizedTextInput, locale);
  return (
    <AccessDenied
      breadcrumbs={[categoryLabel("システム", locale), label]}
      message={gate.error}
      title={label}
    />
  );
}
