/**
 * intake-core.ts — 注文請書抽出結果（po-extract /extract/order-request）の
 * 正規化純ロジック。Prisma I/O は lib/intake.ts。
 *
 * `normalizeExtraction` は監視フォルダのポーラー（instrumentation.ts）からも
 * 呼ばれ、リクエスト外では next-intl の `getTranslations()` が使えない
 * （lib/intake.ts の `L()` と同じ理由）。そのため `lib/messages.ts` の
 * locale 明示 API を "ja" 固定で使う。
 */

import { label } from "./messages";

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

/**
 * 取込フォルダのファイル名に焼き込む注文請書番号。
 *
 * 採番して行を作った時点で `ORD-YYYYMM-NNNNN-<元のファイル名>` に改名する。
 * こうしておくと、失敗の再取込・孤児 .processing の回収でファイルがもう一度
 * スキャン対象に戻ったとき、**どの行の続きなのか**が名前だけで分かる
 * （分からないと採番からやり直して二重登録になる）。
 */
const INTAKE_NUMBER_RE = /^(ORD-(\d{6})-(\d{5}))-(.+)$/;

export interface IntakeFileNumber {
  /** ORD-YYYYMM-NNNNN */
  number: string;
  yearMonth: string;
  seq: number;
  /** 番号を除いた元のファイル名。 */
  rest: string;
}

/** `ORD-YYYYMM-NNNNN-<元名>` を分解する。番号が無ければ null。 */
export function parseIntakeFileNumber(name: string): IntakeFileNumber | null {
  const m = INTAKE_NUMBER_RE.exec(name);
  if (!m) return null;
  return {
    number: m[1],
    yearMonth: m[2],
    seq: Number(m[3]),
    rest: m[4],
  };
}

/**
 * `ORD-YYYYMM-NNNNN-<元名>` を組み立てる。
 * すでに番号付きの名前を渡しても二重に付かない（付け替える）。
 */
export function intakeFileName(number: string, original: string): string {
  return `${number}-${parseIntakeFileNumber(original)?.rest ?? original}`;
}

const s = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * 種別文字列 → ORDER_TYPE（本番/テスト/サンプル・英語表記に耐性）。
 * 判定語は**顧客の注文書に実際に印字されている日本語**（+ 英語表記）との
 * 突合であって UI 文言ではない — 訳すと本物の注文書を読み違える
 * （company-aliases.ts の法人格表記と同じ扱い。i18n-ignore）。
 */
export function normalizeOrderType(
  raw: unknown,
): "PRODUCTION" | "TEST" | "SAMPLE" | "OTHER" {
  const t = (typeof raw === "string" ? raw : "").toLowerCase();
  if (
    !t ||
    t.includes("本番") || // i18n-ignore
    t.includes("production") ||
    t.includes("量産") // i18n-ignore
  )
    return "PRODUCTION";
  // i18n-ignore
  if (t.includes("テスト") || t.includes("test") || t.includes("試作")) {
    return "TEST";
  }
  if (t.includes("サンプル") || t.includes("sample")) return "SAMPLE"; // i18n-ignore
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
      if (qty == null)
        noteParts.push(label("intakeCore.quantityNotReadableNote", "ja"));
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
