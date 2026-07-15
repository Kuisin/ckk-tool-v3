/**
 * intake-core.ts — 受注請書抽出結果（po-extract /extract/order-request）の
 * 正規化純ロジック。Prisma I/O は lib/intake.ts。
 */

export interface ExtractedItem {
  productText: string | null;
  productCode: string | null;
  orderType: "PRODUCTION" | "TEST" | "SAMPLE" | "OTHER";
  quantity: number;
  unitPrice: number | null;
  deliveryDate: string | null; // yyyy-mm-dd
  notes: string | null;
}

export interface NormalizedExtraction {
  customerName: string | null;
  customerBranch: string | null;
  customerOrderRef: string | null;
  orderDate: string | null; // yyyy-mm-dd
  items: ExtractedItem[];
  notes: string | null;
}

const s = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** 種別文字列 → ORDER_TYPE（本番/テスト/サンプル・英語表記に耐性）。 */
export function normalizeOrderType(
  raw: unknown,
): "PRODUCTION" | "TEST" | "SAMPLE" | "OTHER" {
  const t = (typeof raw === "string" ? raw : "").toLowerCase();
  if (
    !t ||
    t.includes("本番") ||
    t.includes("production") ||
    t.includes("量産")
  )
    return "PRODUCTION";
  if (t.includes("テスト") || t.includes("test") || t.includes("試作"))
    return "TEST";
  if (t.includes("サンプル") || t.includes("sample")) return "SAMPLE";
  return "OTHER";
}

/** 日付文字列の正規化（yyyy-mm-dd / yyyy/mm/dd / 和暦なし前提）。不正は null。 */
export function normalizeDate(raw: unknown): string | null {
  const t = s(raw);
  if (!t) return null;
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t);
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * 抽出 JSON（OrderRequest 形。欠損・型ゆれに耐性）→ 正規化。
 * 数量が取れない行は数量 1 として取り込み、備考に印を付ける。
 */
export function normalizeExtraction(raw: unknown): NormalizedExtraction {
  const r = (raw ?? {}) as Record<string, unknown>;
  const itemsRaw = Array.isArray(r.items) ? r.items : [];
  const items: ExtractedItem[] = itemsRaw
    .map((it) => {
      const i = (it ?? {}) as Record<string, unknown>;
      const productText = s(i.product_name);
      const productCode = s(i.product_code);
      if (!productText && !productCode) return null;
      const qty = n(i.quantity);
      const noteParts = [s(i.notes), s(i.customization)].filter(
        (x): x is string => x != null,
      );
      if (qty == null) noteParts.push("数量が読み取れませんでした（要確認）");
      return {
        productText,
        productCode,
        orderType: normalizeOrderType(i.order_type),
        quantity: qty ?? 1,
        unitPrice: n(i.unit_price),
        deliveryDate: normalizeDate(i.delivery_date),
        notes: noteParts.length > 0 ? noteParts.join(" / ") : null,
      };
    })
    .filter((x): x is ExtractedItem => x != null);

  return {
    customerName: s(r.customer_name),
    customerBranch: s(r.customer_branch),
    customerOrderRef: s(r.customer_order_ref),
    orderDate: normalizeDate(r.order_date),
    items,
    notes: s(r.notes),
  };
}
