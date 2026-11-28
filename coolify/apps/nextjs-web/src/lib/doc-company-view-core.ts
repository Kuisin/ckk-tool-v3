/**
 * doc-company-view-core.ts — 書類の「発行会社」バッジを出すかどうか。純粋関数（client-safe）。
 *
 * 書類番号は「自社法人 × 会計年度」ごとの連番なので、CKK と TSP の両方に
 * `QOT-2026-00001` があり得る。番号だけでは**どちらの法人の書類か**が読めない。
 * そこで一覧の番号の隣と詳細の見出しに、法人コードのバッジ（`TSP`）を出す。
 *
 * **出すのは、法人が自明でない人にだけ**（1 社だけの人の画面は何も変わらない）:
 *
 *   - 2 社以上の法人のために書類を作れる人（所属拠点が 2 社にまたがる —
 *     作成画面に「発行会社」の欄が出る人。lib/doc-company-core.ts
 *     issuingCompanyChoice の selectable と同じ判定）には、**全部の書類に**出す。
 *   - それ以外の人には、**自分の法人（= 書類を作ると付く法人）と違う書類にだけ**
 *     出す。全社スコープの管理者が他社の書類を開いたとき、それが自社の書類に
 *     見えてしまうのを防ぐため。1 社だけの人が自社の書類を見ている限り、
 *     バッジは 1 つも出ない。
 *
 * 判定の材料（viewer）はダッシュボードのレイアウトで 1 回だけ作り
 * （lib/doc-company.ts viewerCompanyContext）、画面へ配る
 * （components/layout/DocCompanyProvider.tsx）。
 */

import { docRefCompany } from "@/lib/doc-ref-core";

/** 見ている人の法人の状況。 */
export interface DocCompanyViewer {
  /** 2 社以上の法人のために書類を作れるか。 */
  multiCompany: boolean;
  /** 自分の法人（書類を作ると付く法人）のコード。既定の法人も無ければ null。 */
  homeCode: string | null;
  /** 法人コード → 表示名（バッジのツールチップ用）。 */
  names: Record<string, string>;
}

/** その書類（法人コード）にバッジを出すか。 */
export function showsDocCompany(
  viewer: DocCompanyViewer | null | undefined,
  code: string | null | undefined,
): boolean {
  if (!viewer || !code) return false;
  return viewer.multiCompany || code !== viewer.homeCode;
}

/**
 * 書類の id（`CKK~QOT-2026-00001`）・参照（`CKK/…`）→ 法人コード。
 * 番号だけ（法人の付かない旧データ）は null。
 */
export function docCompanyCode(
  idOrRef: string | null | undefined,
): string | null {
  return idOrRef ? docRefCompany(idOrRef) : null;
}

/**
 * 一覧の検索語が法人コードに当たるか。大文字小文字は問わない。1 文字では
 * 当てない — 「C」で全行が当たると、ほかの列を探す検索の邪魔になる。
 */
export function matchesDocCompany(
  code: string | null | undefined,
  search: string | null | undefined,
): boolean {
  const q = search?.trim().toUpperCase();
  if (!code || !q || q.length < 2) return false;
  return code.toUpperCase().startsWith(q);
}
