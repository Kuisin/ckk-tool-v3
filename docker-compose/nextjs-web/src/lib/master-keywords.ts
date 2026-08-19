/**
 * master-keywords.ts — 製品・素材のキーワード（match_names）の純ロジック。
 *
 * 取引先の照合名（lib/bp-search）と同じ考え方を製品・素材へ広げたもの。
 * 名称は 1 つしか持てないが、実際の呼び方は複数ある — 略称、読み、英字、
 * 寸法の別表記。ここに並べたものが
 *   (a) 人が検索したときのヒット対象、
 *   (b) 注文書から AI が製品を突合するときのキー
 * の両方になる。
 *
 * 正規化（searchKey）は取引先と共通 — 全角/半角・大文字小文字・記号の違いで
 * 外さないため。**保存する値そのものは加工しない**（全角で書かれた表記は
 * 全角のまま持つ。突合が完全一致で行われる場面があるため）。
 */

import { searchKey } from "./bp-search";

/** 1 件あたりの長さ上限（これを超える語は検索キーとして役に立たない）。 */
export const KEYWORD_MAX_LENGTH = 64;
/** 1 レコードに持てるキーワード数の上限。 */
export const KEYWORD_MAX_COUNT = 50;

/**
 * 保存前の整形: 前後の空白を落とし、空・長すぎ・重複を除く。
 * 重複判定は正規化後（「ＴＨＫ」と「THK」は同じ）だが、**残すのは先に来た
 * 表記そのもの**。
 */
export function normalizeKeywords(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = raw.trim();
    if (!value || value.length > KEYWORD_MAX_LENGTH) continue;
    const key = searchKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= KEYWORD_MAX_COUNT) break;
  }
  return out;
}

/**
 * 生成された候補のうち、まだ登録されていないものだけを返す。
 * AI は登録済みの語も返してくるので、画面に出す前にここで落とす。
 */
export function newKeywords(
  generated: readonly string[],
  existing: readonly string[],
): string[] {
  const known = new Set(existing.map((v) => searchKey(v)).filter(Boolean));
  return normalizeKeywords(generated).filter((v) => !known.has(searchKey(v)));
}

/** 検索対象になるマスタ行の断片。 */
export interface KeywordSearchable {
  code?: string | null;
  /** 名称（表示に使っているもの。ja / en どちらでもよい）。 */
  name?: string | null;
  nameEn?: string | null;
  /** 登録済みキーワード（match_names）。 */
  keywords?: readonly string[] | null;
  /** 材種名など、そのマスタ固有の追加検索対象。 */
  extra?: readonly (string | null | undefined)[];
}

/** 検索対象の全キー（正規化済み・重複除去済み）。 */
export function keywordSearchKeys(item: KeywordSearchable): string[] {
  const parts = [
    item.code,
    item.name,
    item.nameEn,
    ...(item.keywords ?? []),
    ...(item.extra ?? []),
  ];
  return [
    ...new Set(
      parts.map((p) => searchKey((p ?? "").trim())).filter((p) => p.length > 0),
    ),
  ];
}

/**
 * 入力語で当たるか（部分一致）。空の入力は「すべて当たる」—
 * 呼び出し側で絞り込みを外すのに使う。
 */
export function matchesKeywordQuery(
  item: KeywordSearchable,
  query: string,
): boolean {
  const q = searchKey(query.trim());
  if (!q) return true;
  return keywordSearchKeys(item).some((k) => k.includes(q));
}
