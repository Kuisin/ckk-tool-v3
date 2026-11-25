/**
 * doc-ref-core.ts — 書類の多態参照 `"<法人コード>/<書類番号>"`。純粋関数。
 *
 * 番号設計 PR-C で書類番号は「自社法人 × 会計年度」ごとの連番になり、法人は
 * 番号の文字列に入らない（例 QOT-2026-00001）。つまり**同じ番号が 2 つの法人に
 * 存在し得る**。承認依頼・メモ・添付・ポータルの共有・在庫の元書類・監査キーは
 * 書類を FK ではなく文字列で指している（多態参照）ので、番号だけでは指す先が
 * 1 つに決まらなくなる。そこで参照には法人コードを付ける（利用者の決定。
 * uuid にしないのは、人が読める・psql で追える参照のままにするため）:
 *
 *     CKK/QOT-2026-00001
 *
 * 法人コードは作成後に変えられない（DB トリガー own_companies_code_immutable）
 * ので、参照が後から食い違うことはない。
 *
 * **多態参照の文字列は必ずここの {@link docRef} で組み立てる**（ガード試験
 * doc-ref-guard.test.ts）。番号だけを保存するコードを書かないこと。
 *
 * 形は 2 つある:
 *   保存形  `CKK/QOT-2026-00001` … DB の列に入る（{@link docRef}）
 *   URL 形  `CKK~QOT-2026-00001` … パスの 1 区切りに入る（{@link docUrlId}）。
 *           `/` はパスの区切りなので使えず、`%2F` は経路上のプロキシが
 *           勝手に戻すことがある。`~` は URL で予約されていない文字。
 */

/** 保存形の区切り。 */
export const DOC_REF_SEP = "/";
/** URL 形の区切り。 */
export const DOC_URL_SEP = "~";

/** 法人コードに使えない文字（区切りと紛れる）。MS0I の入力検証が使う。 */
export const OWN_COMPANY_CODE_FORBIDDEN = /[/~\s]/;

export interface DocRefParts {
  companyCode: string;
  number: string;
}

/**
 * 書類番号の形か（`PREFIX-YYYYMM-NNNNN`。注文明細は `-NN` が付く。PR-C の
 * `PREFIX-FFFF-NNNNN` も通す）。同じ type でも uuid で指す参照がある（在庫の
 * order_lines は明細の uuid）ので、参照へ直すかどうかは形で見分ける。
 * SQL 側の双子は app.is_doc_number。
 */
export function isDocNumber(value: string): boolean {
  return /^[A-Z]{2,4}-\d{4,6}-\d{1,6}(-\d{1,2})?$/.test(value);
}

/** 法人コード + 書類番号 → 保存形の参照。 */
export function docRef(companyCode: string, number: string): string {
  if (!companyCode || OWN_COMPANY_CODE_FORBIDDEN.test(companyCode)) {
    throw new Error(`docRef: invalid company code "${companyCode}"`);
  }
  if (!number || number.includes(DOC_REF_SEP)) {
    throw new Error(`docRef: invalid document number "${number}"`);
  }
  return `${companyCode}${DOC_REF_SEP}${number}`;
}

function split(value: string, sep: string): DocRefParts | null {
  // 番号は区切りを含まないので、**最後の**区切りで割る。
  const i = value.lastIndexOf(sep);
  if (i <= 0 || i === value.length - 1) return null;
  return { companyCode: value.slice(0, i), number: value.slice(i + 1) };
}

/** 保存形の参照 → 部品。保存形でなければ null（番号だけの文字列も null）。 */
export function parseDocRef(value: string): DocRefParts | null {
  return split(value, DOC_REF_SEP);
}

/** 保存形の参照か。 */
export function isDocRef(value: string): boolean {
  return parseDocRef(value) != null;
}

/** 法人コード + 書類番号 → URL 形の id。 */
export function docUrlId(companyCode: string, number: string): string {
  return `${companyCode}${DOC_URL_SEP}${number}`;
}

/**
 * 画面・URL・Server Action が受け取る「書類の id」を読む。保存形・URL 形・
 * 番号だけ の 3 つを受ける。番号だけのときは companyCode が null。
 */
export function parseDocId(value: string): {
  companyCode: string | null;
  number: string;
} {
  const v = value.trim();
  return (
    split(v, DOC_REF_SEP) ??
    split(v, DOC_URL_SEP) ?? { companyCode: null, number: v }
  );
}

/** 参照（どの形でも）→ 書類番号。番号だけならそのまま返す。 */
export function docRefNumber(value: string): string {
  return parseDocId(value).number;
}

/** 参照（どの形でも）→ 法人コード。番号だけなら null。 */
export function docRefCompany(value: string): string | null {
  return parseDocId(value).companyCode;
}
