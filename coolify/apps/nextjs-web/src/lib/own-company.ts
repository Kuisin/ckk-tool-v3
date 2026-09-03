/**
 * own-company.ts — 「自社」の判定。純ロジック。
 *
 * 顧客から届く注文書は**相手の視点で書かれている**: 宛先（御中）が自社、
 * 発行元・社判のある側が顧客。AI がこの向きを取り違えると、顧客欄に
 * **自社名**が入ってくる（実際に ORD-202608-00001 がそうなった）。
 *
 * 自社名は取引先マスタには無いので突合は必ず外れるが、そのままでは画面に
 * 「一致する取引先がありません」としか出ず、*向きを間違えた* ことが分からない。
 * ここで自社かどうかを判定し、専用の案内を出すために使う。
 *
 * 社名は `OWN_COMPANY_NAMES`（カンマ区切り）で上書きできる。
 */

/**
 * 既定の自社名（表記ゆれ込み）。環境変数が無いときはこれを使う。
 * 固有名詞（社名の表記ゆれ）— 訳の対象外（_specs/i18n-glossary.md §1）。
 */
const DEFAULT_OWN_NAMES = [
  "シー・ケイ・ケー株式会社", // i18n-ignore
  "シーケイケー株式会社", // i18n-ignore
  "CKK",
  "C.K.K.",
  "株式会社シー・ケイ・ケー", // i18n-ignore
];

/**
 * 社名の比較用正規化。
 * 全角→半角、大文字化、空白・記号除去、法人格（株式会社 / (株) / Co., Ltd. 等）除去。
 * 「シー・ケイ・ケー株式会社」「(株)シーケイケー」「CKK Co., Ltd.」を同じ鍵にする。
 */
export function normalizeCompanyName(raw: string): string {
  let s = raw.normalize("NFKC").toUpperCase();
  // 法人格の表記（前後どちらに付いても落とす）
  s = s.replace(/株式会社|有限会社|合同会社|\(株\)|\(有\)/g, "");
  // 「K.K.」は法人格の略でもあるが、頭字語の一部（C.K.K.）を食う方が害が
  // 大きいので落とさない。
  s = s.replace(/\bCO\.?,?\s*LTD\.?|\bLTD\.?|\bINC\.?/g, "");
  // 記号・空白（中黒・ハイフン・ドット・スペース）
  s = s.replace(/[\s・･.,\-‐-―ー]/g, "");
  return s.trim();
}

/** 環境変数 or 既定から自社名リストを取る。 */
function ownNames(): string[] {
  const env = process.env.OWN_COMPANY_NAMES;
  const list = env
    ? env
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : DEFAULT_OWN_NAMES;
  return list.length > 0 ? list : DEFAULT_OWN_NAMES;
}

/**
 * その社名が自社を指しているか（表記ゆれを吸収して判定）。
 * 空・null は false。
 */
export function isOwnCompany(name: string | null | undefined): boolean {
  if (!name || !name.trim()) return false;
  const key = normalizeCompanyName(name);
  if (!key) return false;
  return ownNames().some((own) => normalizeCompanyName(own) === key);
}
