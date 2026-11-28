/**
 * own-company-core.ts — 書類の発行元（自社法人）の決め方。純粋関数・試験あり。
 *
 * CKK と TSP のように同じグループの別法人が書類を出す。利用者の決定は
 * 「**拠点が 1 つの法人に属し、書類の法人は拠点から決まる**」で、書類ごとに
 * 法人を選ばせない。拠点の分からない書類は既定の法人（own_companies.is_default）。
 *
 * ここが**唯一の定義元**。PDF ルート（見積書・納品書・請求書）と請求書の作成
 * （invoices.own_company_id のスナップショット）は必ずこれを通る。
 */

import { escapeHtml, type LocalizedTextInput, localized } from "./format";

/** 発行元ブロックに要る自社法人の列（DB の own_companies 1 行）。 */
export interface OwnCompanyRecord {
  id: number;
  code: string;
  name: LocalizedTextInput | null;
  postalCode: string | null;
  address: LocalizedTextInput | null;
  phone: string | null;
  fax: string | null;
  invoiceRegistrationNo: string | null;
  sealFileId: string | null;
  logoFileId: string | null;
  isDefault: boolean;
}

/**
 * 書類の法人 id を、候補（優先順: 書類ヘッダの拠点 → 明細の拠点）の法人 id から
 * 決める。**最初に見つかった法人が勝つ**。どれも無ければ既定の法人。
 *
 * 候補の null / undefined は「拠点が無い」か「拠点が法人に属していない」で、
 * どちらも既定の法人に落ちる。
 */
export function resolveOwnCompanyId(
  candidates: readonly (number | null | undefined)[],
  defaultId: number | null,
): number | null {
  for (const c of candidates) {
    if (c != null) return c;
  }
  return defaultId;
}

/**
 * 拠点の法人 id から発行元の法人を引く。拠点の法人が見つからない（null・
 * 消えた・無効化しても行は残るので通常は起きない）ときは既定の法人。
 * 既定も無ければ null（呼び出し側は {@link LEGACY_ISSUER} で刷る）。
 */
export function resolveIssuer(
  plantCompanyId: number | null | undefined,
  companies: readonly OwnCompanyRecord[],
  defaultCompany?: OwnCompanyRecord | null,
): OwnCompanyRecord | null {
  const fallback = defaultCompany ?? companies.find((c) => c.isDefault) ?? null;
  if (plantCompanyId == null) return fallback;
  return companies.find((c) => c.id === plantCompanyId) ?? fallback;
}

/** PDF テンプレートの `issuer` ブロック（quote / delivery-note / invoice.html）。 */
export interface IssuerBlock {
  name: string;
  address: string;
  tel: string;
  invoice_reg: string;
}

/**
 * 自社法人マスタが空のとき（マイグレーション前の DB など）に刷る値。
 * 自社法人マスタ導入前に各 PDF ルートへ直書きされていた定数そのもの。
 */
export const LEGACY_ISSUER: IssuerBlock = {
  name: "シー・ケィ・ケー株式会社", // i18n-ignore
  address: "〒475-0823 愛知県半田市港町2丁目27番2", // i18n-ignore
  tel: "TEL: 0569-21-6187　FAX: 0569-23-6427",
  invoice_reg: "T1234567890123",
};

/**
 * 法人 1 行 → PDF の発行元ブロック。既定の法人（旧定数と同じ値）からは
 * {@link LEGACY_ISSUER} と**同じ文字列**ができる — 既存書類の見た目を変えない
 * ための約束で、試験で固定してある。
 *
 * 名称・住所は受取先の言語で引く（無ければ ja へ落ちる）。電話の
 * 「TEL: / FAX:」と全角空白の区切りは旧定数の書式のまま。
 */
export function issuerBlock(
  company: OwnCompanyRecord | null,
  lang: string,
): IssuerBlock {
  if (!company) return LEGACY_ISSUER;
  const name = company.name ? localized(company.name, lang) : "";
  const address = company.address ? localized(company.address, lang) : "";
  const postal = company.postalCode?.trim();
  const addressLine = [
    postal ? `〒${postal}` : "",
    address === "—" ? "" : address,
  ]
    .filter(Boolean)
    .join(" ");
  const tel = [
    company.phone?.trim() ? `TEL: ${company.phone.trim()}` : "",
    company.fax?.trim() ? `FAX: ${company.fax.trim()}` : "",
  ]
    .filter(Boolean)
    .join("　");
  return {
    name: name === "—" ? company.code : name,
    address: addressLine,
    tel,
    invoice_reg: company.invoiceRegistrationNo?.trim() ?? "",
  };
}

/**
 * PDF 見出しのロゴをどこから取るか。
 *   own     … 法人が自分のロゴ（logo_file_id）を持ち、画像が読めた
 *   bundled … 同梱の logo.svg（CKK のマーク）— **既定の法人だけ**
 *             （法人マスタが空のときも、旧来どおりこれ）
 *   none    … 刷らない — 他の法人の書類に CKK のマークを刷らないため
 *
 * 画像が読めなかった（SeaweedFS が落ちている・オブジェクトが消えた）ときは
 * `hasOwnLogo = false` で呼ぶ — 帳票は止めず、ロゴの無い（既定の法人なら同梱の）
 * 見出しで刷る。社印（lib/own-companies.ts ownCompanyStampImg）と同じ考え方。
 */
export type BrandLogoSource = "own" | "bundled" | "none";

export function brandLogoSource(
  company: Pick<OwnCompanyRecord, "isDefault"> | null,
  hasOwnLogo: boolean,
): BrandLogoSource {
  if (hasOwnLogo) return "own";
  return company == null || company.isDefault ? "bundled" : "none";
}

/** 同梱のロゴ（テンプレートと一緒に Gotenberg へ送る src/pdf-templates/logo.svg）。 */
export const BUNDLED_LOGO_FILE = "logo.svg";

/**
 * 見出しのロゴの `<img>`（テンプレートの `{{{brand_logo}}}` に渡す生の HTML）。
 * `file` は Gotenberg へ一緒に送るファイル名。alt は**その書類の法人名**
 * （以前は CKK の社名を直書きしていた）。null なら何も刷らない。
 */
export function brandLogoHtml(file: string | null, alt: string): string {
  if (!file) return "";
  return `<img class="brand-logo" src="${escapeHtml(file)}" alt="${escapeHtml(alt)}" />`;
}

/**
 * 項目を法人ごとに束ねる（請求書は**法人をまたいで 1 通にしない** — 発行元が
 * 1 通に 1 社しか刷れないため）。並びは既定の法人が先、残りは id 順で、
 * 同じ入力からは常に同じ順になる（採番の順序が揺れないように）。
 */
export function groupByOwnCompany<T>(
  items: readonly T[],
  companyOf: (item: T) => number | null,
  defaultId: number | null,
): { companyId: number | null; items: T[] }[] {
  const groups = new Map<number | null, T[]>();
  for (const it of items) {
    const id = companyOf(it) ?? defaultId;
    const list = groups.get(id);
    if (list) list.push(it);
    else groups.set(id, [it]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === defaultId) return -1;
      if (b === defaultId) return 1;
      if (a == null) return 1;
      if (b == null) return -1;
      return a - b;
    })
    .map(([companyId, list]) => ({ companyId, items: list }));
}

/** 適格請求書発行事業者登録番号の形（T + 13 桁）。空は許す（未登録の法人）。 */
export function isValidInvoiceRegistrationNo(value: string): boolean {
  const v = value.trim();
  return v === "" || /^T\d{13}$/.test(v);
}
