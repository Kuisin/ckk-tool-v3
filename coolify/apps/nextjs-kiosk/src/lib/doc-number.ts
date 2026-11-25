/**
 * doc-number.ts — 書類番号と書類の id（client-safe, pure）。
 *
 * 番号設計 PR-C: 書類番号は **DB が払い出す**（BEFORE INSERT トリガー
 * app.assign_document_number）。形は `PREFIX-FFFF-NNNNN`（例 QOT-2026-00001）で、
 * 連番は「自社法人 × 会計年度」ごと。法人は番号の文字列に入らないので、
 * **同じ番号が 2 つの法人に存在し得る**。
 *
 * そこで行は番号ではなく **参照** `"<法人コード>/<書類番号>"`（列 doc_ref・
 * 表ごとに UNIQUE）で引く。アプリの中で書類を指す値は 3 つの姿を持つ:
 *
 *   番号    `QOT-2026-00001`       … 人に見せるもの。PDF・メール・CSV・API の number
 *   参照    `CKK/QOT-2026-00001`   … DB の doc_ref と多態参照（{@link DocKey}）
 *   id      `CKK~QOT-2026-00001`   … URL・Server Action の引数・画面の DTO
 *                                    （{@link docIdOf}。`/` は URL で使えない）
 *
 * **画面の DTO が持つ「番号」のフィールド（quoteNumber など）は id の姿**で持つ
 * — リンクと Server Action がそのまま法人まで運べるように。表示するときは
 * `<DocNumber>`（components/ui）か {@link docNo} を通して番号だけにする。
 *
 * 旧番号（`PREFIX-YYYYMM-NNNNN`。列 legacy_number）と、法人の付かない番号は
 * {@link parseDocKey} では読めない（null）。どの書類か決めるには DB を引く必要が
 * あるので、入口（詳細ページ・API・検索）が lib/doc-ref.ts `resolveDocId` を通す。
 *
 * ⚠️ nextjs-kiosk との twin file。
 */

import {
  DOC_REF_SEP,
  docRef,
  docRefNumber,
  docUrlId,
  parseDocId,
} from "./doc-ref-core";

/** 書類の行を指す鍵 = 参照（doc_ref）。行そのもの（docRef を持つ）も鍵として渡せる。 */
export interface DocKey {
  docRef: string;
}

const DOC_PREFIXES = [
  "EST",
  "QOT",
  "PRC",
  "ORD", // 注文請書（注文明細は枝番 -NN が付く）
  "DOR",
  "DRN",
  "INV",
  "WOR", // 指示書（書類番号 — ロット番号は別の通し連番 int）
  "PO", // 素材発注書
  "PRQ", // 購買依頼
  "DSG", // 設計依頼書
  "MOV", // 入出庫伝票（PD07）
  "STK", // 棚卸（PD08）
  "ACC", // 会計文書
  "OUT", // 外注依頼（PU04）
] as const;

export type DocPrefix = (typeof DOC_PREFIXES)[number];

/**
 * 番号を DB が払い出す表 → 接頭辞。SQL 側の双子は app.doc_number_prefix
 * （migration 20261126230000_document_numbering）— 足すときは両方に足す。
 */
export const DOC_TABLE_PREFIX = {
  estimates: "EST",
  price_list_entries: "PRC",
  quotes: "QOT",
  order_acceptances: "ORD",
  delivery_orders: "DOR",
  delivery_notes: "DRN",
  invoices: "INV",
  material_purchase_orders: "PO",
  purchase_requests: "PRQ",
  design_requests: "DSG",
  work_orders: "WOR",
  inventory_movements: "MOV",
  stock_takes: "STK",
  accounting_documents: "ACC",
  outsource_orders: "OUT",
} as const satisfies Record<string, DocPrefix>;

export type DocTable = keyof typeof DOC_TABLE_PREFIX;

/** 新しい形の番号 `PREFIX-FFFF-NNNNN`。 */
const NEW_NUMBER = /^([A-Z]{2,4})-(\d{4})-(\d{5})$/;
/** 旧い形の番号 `PREFIX-YYYYMM-NNNNN`（桁は 1〜6 を許す）。 */
const LEGACY_NUMBER = /^([A-Z]{2,4})-(\d{6})-(\d{1,6})$/;
const NEW_LINE_NUMBER = /^(ORD-\d{4}-\d{5})-(\d{2})$/;
const LEGACY_LINE_NUMBER = /^(ORD-\d{6}-\d{1,6})-(\d{1,2})$/;

/** 新しい形の書類番号か（`QOT-2026-00001`）。 */
export function isNewDocNumber(value: string, prefix?: DocPrefix): boolean {
  const m = NEW_NUMBER.exec(value);
  return m != null && (!prefix || m[1] === prefix);
}

/** 旧い形の書類番号か（`QOT-202607-00001`）。 */
export function isLegacyDocNumber(value: string, prefix?: DocPrefix): boolean {
  const m = LEGACY_NUMBER.exec(value);
  return m != null && (!prefix || m[1] === prefix);
}

/** 番号 → 会計年度と連番（表示・並べ替え用。行を引くのには使わない）。 */
export function docNumberParts(
  value: string,
): { prefix: string; fiscalYear: number; seq: number } | null {
  const m = NEW_NUMBER.exec(docRefNumber(value));
  if (!m) return null;
  return { prefix: m[1], fiscalYear: Number(m[2]), seq: Number(m[3]) };
}

/** (接頭辞, 会計年度, 連番) → `QOT-2026-00001`。DB の app.format_doc_number と同じ。 */
export function buildDocNumber(
  prefix: DocPrefix,
  fiscalYear: number,
  seq: number,
): string {
  return `${prefix}-${fiscalYear}-${String(seq).padStart(5, "0")}`;
}

/**
 * 鍵（または行）→ 書類番号 `QOT-2026-00001`。**人に見せる姿** — PDF・メール・
 * 通知の本文・CSV・API の number に使う。
 * 第 1 引数の接頭辞は読み手のための注記（どの書類かをコード上で示す）。
 */
export function formatDocNumber(_prefix: DocPrefix, key: DocKey): string {
  return docRefNumber(key.docRef);
}

/** 鍵（または行）→ 書類番号。 */
export const docNumberOf = (key: DocKey): string => docRefNumber(key.docRef);

export const formatEstimateNumber = docNumberOf;
export const formatQuoteNumber = docNumberOf;
export const formatPriceListNumber = docNumberOf;
export const formatMovementNumber = docNumberOf;
export const formatStockTakeNumber = docNumberOf;
export const formatAccountingDocNumber = docNumberOf;

/**
 * 鍵（または行）→ id `CKK~QOT-2026-00001`。**書類を指す姿** — 画面の DTO・
 * リンクのパス・Server Action の引数に使う。{@link parseDocKey} で鍵へ戻る。
 */
export function docIdOf(key: DocKey): string {
  const { companyCode, number } = parseDocId(key.docRef);
  return companyCode ? docUrlId(companyCode, number) : number;
}

/** null を通す {@link docIdOf}（任意の参照の DTO 用）。 */
export function docIdOrNull(
  key: { docRef: string } | null | undefined,
): string | null {
  return key ? docIdOf(key) : null;
}

/**
 * id（または参照・番号）→ 表示する番号。法人コードを落とすだけ。
 * 画面で DTO の id をそのまま文字として出すときに通す。
 */
export function docNo(value: string): string;
export function docNo(value: string | null | undefined): string | null;
export function docNo(value: string | null | undefined): string | null {
  return value == null ? null : stripCompany(value);
}

/**
 * 法人コードを落とす — ただし残りが書類番号らしいときだけ。ロット表記などに
 * `/` や `~` が入っていても切らない。
 */
function stripCompany(value: string): string {
  const { companyCode, number } = parseDocId(value);
  return companyCode && /^[A-Z]{2,4}-\d/.test(number) ? number : value;
}

/**
 * id（`CKK~QOT-2026-00001`）/ 参照（`CKK/QOT-2026-00001`）→ 鍵。
 *
 * 法人コードが付いていて、番号が新しい形のときだけ鍵になる。番号だけ・旧番号は
 * null — DB を引かないと書類が決まらない（lib/doc-ref.ts resolveDocId）。
 */
export function parseDocKey(id: string, prefix?: DocPrefix): DocKey | null {
  const { companyCode, number } = parseDocId(decodeIfEncoded(id));
  if (!companyCode || !isNewDocNumber(number, prefix)) return null;
  return { docRef: docRef(companyCode, number) };
}

/** `CKK%7EQOT-…` のように符号化されたまま渡ってきた id を戻す（壊れた入力はそのまま）。 */
function decodeIfEncoded(id: string): string {
  if (!id.includes("%")) return id;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/**
 * 製品コード PRD-YYYYMM-NNNN / 再研磨品目 RGD-… は**従来どおり月次の通し番号**
 * （法人をまたぐマスタなので、書類の採番には載せない）。
 * レガシー取込の品目はコード未採番（yearMonth/seq が null）→ null を返す。
 */
export function formatProductNumber(
  yearMonth: string | null,
  seq: number | null,
): string | null {
  if (!yearMonth || seq == null) return null;
  return `PRD-${yearMonth}-${String(seq).padStart(4, "0")}`;
}

// ─── 注文明細番号（ORD-FFFF-NNNNN-NN） ──────────────────────────────────────

/** 注文明細を指す鍵 = 参照（line_ref）。行そのもの（lineRef を持つ）も渡せる。 */
export interface OrderLineKey {
  lineRef: string;
}

/** 鍵 → 注文明細番号 `ORD-2026-00001-01`（人に見せる姿）。 */
export function formatOrderLineNumber(key: OrderLineKey): string {
  return docRefNumber(key.lineRef);
}

/**
 * DB 行 → 注文明細番号。枝番は確定時に採番されるため、未確定の行は番号を
 * 持たない（line_ref が NULL）→ null。
 */
export function orderLineNumberOf(row: {
  lineRef: string | null;
}): string | null {
  return row.lineRef == null ? null : docRefNumber(row.lineRef);
}

/** DB 行 → 注文明細の id `CKK~ORD-2026-00001-01`。未確定の行は null。 */
export function orderLineIdOf(row: { lineRef: string | null }): string | null {
  return row.lineRef == null ? null : docIdOf({ docRef: row.lineRef });
}

/** 注文明細の鍵 → Prisma の where（line_ref は UNIQUE）。 */
export function orderLineWhereKey(key: OrderLineKey) {
  return { lineRef: key.lineRef };
}

/** 注文明細の参照 → 注文請書の鍵（`CKK/ORD-2026-00001-01` → `CKK/ORD-2026-00001`）。 */
export function acceptanceKeyOfLine(key: OrderLineKey): DocKey {
  return { docRef: key.lineRef.replace(/-\d{2}$/, "") };
}

/** id / 参照 → 注文明細の鍵。法人コードなし・旧番号・形の不一致は null。 */
export function parseOrderLineKey(id: string): OrderLineKey | null {
  const { companyCode, number } = parseDocId(decodeIfEncoded(id));
  if (!companyCode || !NEW_LINE_NUMBER.test(number)) return null;
  return { lineRef: `${companyCode}${DOC_REF_SEP}${number}` };
}

/** 新しい形の注文明細番号か。 */
export function isNewOrderLineNumber(value: string): boolean {
  return NEW_LINE_NUMBER.test(value);
}

/** 旧い形の注文明細番号か（`ORD-202607-00001-01`）。 */
export function isLegacyOrderLineNumber(value: string): boolean {
  return LEGACY_LINE_NUMBER.test(value);
}

// ── 表示: 接頭辞と番号を分ける ───────────────────────────────────────────────

/**
 * 接頭辞は「大文字 2〜4 文字 + ハイフン」だけを認める（QOT- / ORD- / DRN- …）。
 */
const DISPLAY_PREFIX = /^([A-Z]{2,4}-)(.+)$/;

export interface SplitDocNumber {
  /** `ORD-` の部分。無ければ空文字。 */
  prefix: string;
  /** 残り（実際に見分けたいところ）。 */
  rest: string;
}

/**
 * 書類番号を「接頭辞」と「番号」に分ける（表示を分けるためだけのもの）。
 *
 * 一覧に `ORD-2026-00042` が縦に並ぶと、**どの行も左端の 4 文字が同じ**なので、
 * 目が最初に当たる場所に情報が無い。実際に見分けたいのは後ろの番号のほう。
 * 接頭辞を薄くして番号を主役にするために、ここで切る。
 *
 * 法人コード付きの id（`CKK~ORD-…`）を渡されたら、法人コードは落としてから切る。
 *
 * 分けられないものはそのまま返す（`rest` に全部）。ロット番号のような
 * **接頭辞を持たない番号**もこの経路に来るので、無理に切らないこと —
 * 切ると数字の頭が薄くなって読み違える。
 */
export function splitDocNumber(value: string): SplitDocNumber {
  const number = stripCompany(value);
  const m = DISPLAY_PREFIX.exec(number);
  return m ? { prefix: m[1], rest: m[2] } : { prefix: "", rest: number };
}
