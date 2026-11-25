/**
 * doc-param.ts — ポータルの URL が運んできた書類の id → 候補の鍵。server-only.
 *
 * ポータルのリンクは id（`CKK~ORD-2026-00001`）で書類を指す — 取引先が自社の
 * 2 つの法人と取引していると、同じ番号 `ORD-2026-00001` の書類が 2 件あり得る。
 * 一方で、取引先が手元の紙やメールから**番号だけ**（旧番号も）を打ち込んで
 * 開くこともあるので、その場合は番号から候補を引く。
 *
 * ■ ここは候補を返すだけで、**見せてよいかは判定しない**
 * 候補は必ず呼び出し側が `getPortalDocument` / `getPortalOrderLine`
 * （= portalAccessFor）へ通し、見える書類だけを残す。見えない書類は
 * 「無い」と区別しない（存在を漏らさない）— 候補が 2 件あって片方しか
 * 見えないなら、その 1 件だけが在るものとして振る舞う。
 *
 * 社内側の lib/doc-param.ts（法人の選択画面 /doc/choose へ送る）は使わない —
 * あれは社員向けで、法人コードを画面に出す。
 */

import "server-only";

import {
  type DocKey,
  type DocPrefix,
  type OrderLineKey,
  parseDocKey,
  parseOrderLineKey,
} from "@/lib/doc-number";
import { docRefsByNumber } from "@/lib/doc-ref";
import { docRefNumber } from "@/lib/doc-ref-core";

function decoded(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

export interface PortalDocCandidates<K> {
  keys: K[];
  /** id（法人コード付きの新しい番号）で渡された = URL はそのままでよい。 */
  canonical: boolean;
}

/** 書類（見積書・注文請書・納品書・請求書）の候補。`type` はテーブル名。 */
export async function portalDocCandidates(
  type: string,
  prefix: DocPrefix,
  raw: string,
): Promise<PortalDocCandidates<DocKey>> {
  const id = decoded(raw);
  const key = parseDocKey(id, prefix);
  if (key) return { canonical: true, keys: [key] };
  const refs = await docRefsByNumber(type, docRefNumber(id)).catch(() => null);
  return {
    canonical: false,
    keys: (refs ?? []).map((docRef) => ({ docRef })),
  };
}

/** 注文明細の候補。 */
export async function portalOrderLineCandidates(
  raw: string,
): Promise<PortalDocCandidates<OrderLineKey>> {
  const id = decoded(raw);
  const key = parseOrderLineKey(id);
  if (key) return { canonical: true, keys: [key] };
  const refs = await docRefsByNumber("order_lines", docRefNumber(id)).catch(
    () => null,
  );
  return {
    canonical: false,
    keys: (refs ?? []).map((lineRef) => ({ lineRef })),
  };
}
