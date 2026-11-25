import "server-only";

/**
 * doc-param.ts — 詳細ページの URL パラメータ → 書類の鍵。server-only.
 *
 * 正規の URL は「法人コード + 番号」（`/sales/quotes/CKK~QOT-2026-00001`）。
 * 番号だけ・旧番号で来た URL（古いブックマーク、通知メールの古いリンク、手入力）は
 * DB を引いて、その書類の正規の URL へ転送する:
 *
 *   該当 1 件 … 正規の URL へ redirect
 *   複数の法人に同じ番号がある … 法人を選ぶ画面（/doc/choose）へ redirect
 *   該当なし … notFound()
 *
 * Server Action や API は転送できないので、こちらは使わず lib/doc-ref.ts
 * `resolveDocId` を直接使う。
 */

import { notFound, redirect } from "next/navigation";
import {
  type DocKey,
  type DocPrefix,
  docIdOf,
  type OrderLineKey,
  parseDocKey,
  parseOrderLineKey,
} from "@/lib/doc-number";
import { resolveDocId } from "@/lib/doc-ref";

function safeDecode(param: string): string {
  try {
    return decodeURIComponent(param);
  } catch {
    return param;
  }
}

/** 正規でない id を引いて、正規の URL へ転送する（戻らない）。 */
async function redirectToCanonical(
  type: string,
  id: string,
  basePath: string,
  suffix: string,
): Promise<never> {
  const r = await resolveDocId(type, id);
  if (r.status === "ok") {
    redirect(`${basePath}/${docIdOf({ docRef: r.docRef })}${suffix}`);
  }
  if (r.status === "ambiguous") {
    const q = new URLSearchParams({ type, number: id, base: basePath });
    if (suffix) q.set("suffix", suffix);
    redirect(`/doc/choose?${q.toString()}`);
  }
  notFound();
}

/**
 * 詳細ページの `[id]` → 鍵。正規でない id は転送（上記）。
 *
 * @param type     多態参照の type（= テーブル名。lib/doc-ref.ts の登録簿）
 * @param prefix   その書類の接頭辞（別の書類の番号を弾く）
 * @param basePath 一覧のパス（`/sales/quotes`）。転送先を組み立てる
 * @param suffix   id のあとに続くパス（`/edit` など）
 */
export async function docKeyFromParam(
  type: string,
  prefix: DocPrefix,
  param: string,
  basePath: string,
  suffix = "",
): Promise<DocKey> {
  const id = safeDecode(param);
  const key = parseDocKey(id, prefix);
  if (key) return key;
  return redirectToCanonical(type, id, basePath, suffix);
}

/** 注文明細の詳細ページの `[id]` → 鍵。正規でない id は転送。 */
export async function orderLineKeyFromParam(
  param: string,
  basePath: string,
  suffix = "",
): Promise<OrderLineKey> {
  const id = safeDecode(param);
  const key = parseOrderLineKey(id);
  if (key) return key;
  return redirectToCanonical("order_lines", id, basePath, suffix);
}
