/**
 * purchase-intake-core.ts — 購買側の抽出結果（po-extract の
 * `/extract/purchase-order` と `/extract/material-delivery`）の正規化。純ロジック。
 *
 * 販売側の `intake-core.ts` と同じ役割で、同じ約束を守る:
 *   - **読めなかったものは黙って埋めない。** 数量が取れない行は 1 にして
 *     備考に印を残す（0 のまま通すと、そのまま入荷 0 本や発注 0 本が確定する）。
 *   - 負の単価は null（未入力）にする — 人が見積書から入れ直す。
 *   - 日付は `YYYY-MM-DD` に寄せ、読めなければ null。
 *   - **名前もコードも無い行は捨てる。** 表の罫線や合計行を AI が 1 行と
 *     読んでしまうことがあり、それが明細として残ると人が毎回消すことになる。
 *
 * Prisma I/O と突合は `lib/purchase-intake.ts`。ここは形を整えるだけなので、
 * サーバー・クライアントのどちらからでも呼べる（試験もここに付く）。
 */

import type { BpMatchCandidate } from "./bp-match";
import type { Locale } from "./i18n";
import { normalizeDate } from "./intake-core";
import type { MaterialMatchCandidate } from "./material-match";
import { label } from "./messages";

/** 1 書類から取り込む明細の上限。これを超えるのは読み違い（罫線・合計行）。 */
export const MAX_PURCHASE_ITEMS = 200;

/** 抽出された明細 1 行（発注書・納品書で共通。使わない欄は null）。 */
export interface PurchaseExtractedItem {
  /** 印字されていた品名（そのまま）。 */
  materialText: string | null;
  /** 印字されていた品番・素材コード（そのまま）。 */
  materialCode: string | null;
  /** メーカー（冨士ダイス / AFC …）。 */
  maker: string | null;
  /** 材質・材種（K10UF …）。 */
  grade: string | null;
  diameterMm: number | null;
  lengthMm: number | null;
  /** 数量。読めなければ 1（備考に印が付く）。 */
  quantity: number;
  unit: string | null;
  /** 単価（発注書のみ）。負・欠損は null。 */
  unitPrice: number | null;
  /** 金額（発注書のみ）。 */
  amount: number | null;
  /** 納入予定日（発注書のみ）。 */
  expectedDate: string | null;
  /** 仕入先のロット番号（納品書のみ）。 */
  lotNumber: string | null;
  notes: string | null;
}

/** 仕入先の見積書 / 注文請書 / 発注書控え。素材発注書 (PU02) の下書きになる。 */
export interface NormalizedMaterialOrder {
  supplierName: string | null;
  supplierContact: string | null;
  /** 書類自身の番号（見積番号 …）。 */
  documentNumber: string | null;
  /** 引用されている発注番号。 */
  poNumber: string | null;
  orderDate: string | null;
  validUntil: string | null;
  /** ISO 通貨コード（読めなければ null → 呼び出し側の既定）。 */
  currency: string | null;
  items: PurchaseExtractedItem[];
  subtotal: number | null;
  taxAmount: number | null;
  totalAmount: number | null;
  notes: string | null;
}

/** 素材の納品書。素材入荷 (PU03) の行になる。 */
export interface NormalizedMaterialDelivery {
  supplierName: string | null;
  deliveryNumber: string | null;
  deliveryDate: string | null;
  poNumber: string | null;
  items: PurchaseExtractedItem[];
  notes: string | null;
}

const s = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** 通貨コードらしい 3 文字だけ受ける（`¥` や `円` は捨てて既定に任せる）。 */
function normalizeCurrency(raw: unknown): string | null {
  const t = s(raw);
  if (!t) return null;
  const code = t.toUpperCase().replace(/[^A-Z]/g, "");
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * 明細 1 行の共通部分。
 *
 * **数量が 0 以下 or 読めない行は 1 にして備考に印を付ける。** 販売側
 * （intake-core）は「1 未満」を読み違いとするが、素材は kg / m で買うことが
 * あり 0.5 が正当な値になり得るので、こちらは 0 以下だけを弾く。
 * 印を付ける理由は同じ — 黙って通すと数量 0 の発注・入荷が確定する。
 */
function normalizeItem(
  raw: unknown,
  locale: Locale | undefined,
  kind: "order" | "delivery",
): PurchaseExtractedItem | null {
  const i = (raw ?? {}) as Record<string, unknown>;
  const materialText = s(i.material_name);
  const materialCode = s(i.material_code);
  // 品名もコードも無い行は明細ではない（罫線・小計行の読み違い）。
  if (!materialText && !materialCode) return null;

  const qtyRaw = n(i.quantity);
  const qty = qtyRaw != null && qtyRaw > 0 ? qtyRaw : null;
  const noteParts = [s(i.notes)].filter((x): x is string => x != null);
  if (qtyRaw == null) {
    noteParts.push(label("intakeCore.quantityNotReadableNote", locale ?? "ja"));
  } else if (qty == null) {
    noteParts.push(
      label("intakeCore.quantityInvalidNote", locale ?? "ja", "", {
        value: qtyRaw,
      }),
    );
  }

  const price = kind === "order" ? n(i.unit_price) : null;
  const amount = kind === "order" ? n(i.amount) : null;
  const diameter = n(i.diameter_mm);
  const length = n(i.length_mm);

  return {
    materialText,
    materialCode,
    maker: s(i.maker),
    grade: s(i.grade),
    // 寸法は正の値だけ意味がある（0 や負は読み違い）。
    diameterMm: diameter != null && diameter > 0 ? diameter : null,
    lengthMm: length != null && length > 0 ? length : null,
    quantity: qty ?? 1,
    unit: s(i.unit),
    unitPrice: price != null && price >= 0 ? price : null,
    amount: amount != null && amount >= 0 ? amount : null,
    expectedDate: kind === "order" ? normalizeDate(i.expected_date) : null,
    lotNumber: kind === "delivery" ? s(i.lot_number) : null,
    notes: noteParts.length > 0 ? noteParts.join(" / ") : null,
  };
}

function normalizeItems(
  raw: unknown,
  locale: Locale | undefined,
  kind: "order" | "delivery",
): PurchaseExtractedItem[] {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .slice(0, MAX_PURCHASE_ITEMS)
    .map((it) => normalizeItem(it, locale, kind))
    .filter((x): x is PurchaseExtractedItem => x != null);
}

/** 仕入先の見積書 / 注文請書 / 発注書控え → 正規化。 */
export function normalizeMaterialOrder(
  raw: unknown,
  locale?: Locale,
): NormalizedMaterialOrder {
  const r = (raw ?? {}) as Record<string, unknown>;
  const subtotal = n(r.subtotal);
  const taxAmount = n(r.tax_amount);
  const totalAmount = n(r.total_amount);
  return {
    supplierName: s(r.supplier_name),
    supplierContact: s(r.supplier_contact),
    documentNumber: s(r.document_number),
    poNumber: s(r.po_number),
    orderDate: normalizeDate(r.order_date),
    validUntil: normalizeDate(r.valid_until),
    currency: normalizeCurrency(r.currency),
    items: normalizeItems(r.items, locale, "order"),
    subtotal: subtotal != null && subtotal >= 0 ? subtotal : null,
    taxAmount: taxAmount != null && taxAmount >= 0 ? taxAmount : null,
    totalAmount: totalAmount != null && totalAmount >= 0 ? totalAmount : null,
    notes: s(r.notes),
  };
}

/** 素材の納品書 → 正規化。 */
export function normalizeMaterialDelivery(
  raw: unknown,
  locale?: Locale,
): NormalizedMaterialDelivery {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    supplierName: s(r.supplier_name),
    deliveryNumber: s(r.delivery_number),
    deliveryDate: normalizeDate(r.delivery_date),
    poNumber: s(r.po_number),
    items: normalizeItems(r.items, locale, "delivery"),
    notes: s(r.notes),
  };
}

// ── 突合済みの下書き（サーバーが作り、画面がそのまま受け取る形）─────────────
//
// 型をここ（純モジュール）に置くのは、**client component から import する**
// ため。lib/purchase-intake.ts は `server-only` なので、あちらから型だけを
// 借りるとバンドルの向きで壊れうる。

/** 突合済みの明細 1 行（抽出結果 + 引き当て）。 */
export interface PurchaseIntakeLine extends PurchaseExtractedItem {
  /** 突合できた素材の内部 id（文字列）。null = 未突合（人が選ぶ）。 */
  materialId: string | null;
  /** 突合できた素材の表示名。 */
  materialLabel: string | null;
  /** 素材マスタの単位（突合できたときだけ）。入荷の単位はこれで固定する。 */
  materialUnit: string | null;
  /** 1 件に絞れなかったときの候補（画面の「もしかして」）。 */
  candidates: MaterialMatchCandidate[];
}

/** 仕入先の突合結果（発注書・納品書で共通）。 */
export interface SupplierMatch {
  supplierBpId: string | null;
  supplierLabel: string | null;
  supplierCandidates: BpMatchCandidate[];
}

/** 素材発注書 (PU02) の下書き（抽出 + 突合）。 */
export interface MaterialOrderDraft
  extends Omit<NormalizedMaterialOrder, "items">,
    SupplierMatch {
  lines: PurchaseIntakeLine[];
}

/** 素材入荷 (PU03) の下書き（抽出 + 突合）。 */
export interface MaterialDeliveryDraft
  extends Omit<NormalizedMaterialDelivery, "items">,
    SupplierMatch {
  lines: PurchaseIntakeLine[];
}
