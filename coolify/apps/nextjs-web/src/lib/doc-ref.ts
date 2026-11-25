/**
 * doc-ref.ts — 書類の id（番号だけ / 法人コード付き）→ 保存形の参照。Server-only.
 *
 * 多態参照（承認依頼・メモ・添付・ポータル・在庫の元書類・監査キー）は書類を
 * `"<法人コード>/<書類番号>"` で指す（lib/doc-ref-core.ts）。画面や Server Action
 * はまだ番号だけで書類を指すので、**保存・検索の直前にここで法人を引いて
 * 参照へ直す**。こうしておくと、番号が法人ごとの連番になったあと（番号設計
 * PR-C）も、呼び出し側が法人コード付きの id を渡すだけで同じ経路が通る。
 *
 * 番号だけを渡された場合:
 *   - 該当が 1 件 … その書類の法人で参照を作る
 *   - 該当なし   … null（読み出しは「0 件」、書き込みは対象なしとして扱う）
 *   - 複数       … {@link AmbiguousDocNumberError}（黙ってどれかを選ばない）
 *
 * ⚠️ **nextjs-kiosk との twin file**（`pnpm twin:sync` / twin-files.test.ts）。
 * lib/inventory.ts（twin）が入出庫伝票の元書類を参照へ直すのに使う。依存は
 * `./db` の prisma と、同じく twin の doc-number / doc-ref-core だけ。
 */

import { prisma } from "./db";
import { parseDocKey, parseOrderLineKey } from "./doc-number";
import { docRef, isDocNumber, parseDocId } from "./doc-ref-core";

/** tx でも素の prisma でも受ける（必要なのは生 SQL の口だけ）。 */
interface RawDb {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
}

type Shape =
  /** (year_month, seq) から番号を導く表。 */
  | { by: "key"; table: string }
  /** 番号を列に持つ表。 */
  | { by: "column"; table: string; column: string }
  /** 注文明細 — 注文請書の番号 + 枝番。法人は注文請書が持つ。 */
  | { by: "orderLine" };

/**
 * 番号を持つ書類の登録簿。**鍵は多態参照の type（= テーブル名）**。
 * SQL 側の双子は app.doc_ref_table（migration 20261126210000_doc_company_refs）
 * — 足すときは両方に足す。
 * ここに無い type（uuid や連番 id で指すもの・ロット番号で指す指示書）は
 * 参照へ直さない — 法人をまたいで重ならない id だから。
 *
 * 表名は固定の文字列だけ（利用者の入力は SQL に入らない — 値は必ず $1, $2）。
 */
const DOC_REF_TYPES: Record<string, Shape> = {
  estimates: { by: "key", table: "estimates" },
  price_list_entries: { by: "key", table: "price_list_entries" },
  quotes: { by: "key", table: "quotes" },
  order_acceptances: { by: "key", table: "order_acceptances" },
  order_lines: { by: "orderLine" },
  delivery_orders: { by: "key", table: "delivery_orders" },
  delivery_notes: { by: "key", table: "delivery_notes" },
  invoices: { by: "key", table: "invoices" },
  inventory_movements: { by: "key", table: "inventory_movements" },
  stock_takes: { by: "key", table: "stock_takes" },
  accounting_documents: { by: "key", table: "accounting_documents" },
  // 請求書の入金承認 — 指す先は請求書（INV-…）。
  invoice_payments: { by: "key", table: "invoices" },
  material_purchase_orders: {
    by: "column",
    table: "material_purchase_orders",
    column: "po_number",
  },
  purchase_requests: {
    by: "column",
    table: "purchase_requests",
    column: "request_number",
  },
  design_requests: {
    by: "column",
    table: "design_requests",
    column: "request_number",
  },
  form_responses: {
    by: "column",
    table: "form_responses",
    column: "response_number",
  },
  internal_pages: {
    by: "column",
    table: "internal_pages",
    column: "page_number",
  },
};

/** その type は法人コード付きの参照で指すか。 */
export function isDocRefType(type: string): boolean {
  return Object.hasOwn(DOC_REF_TYPES, type);
}

/** 登録されている type の一覧（ガード試験・移行の突き合わせ用）。 */
export function docRefTypes(): string[] {
  return Object.keys(DOC_REF_TYPES);
}

/** 番号だけでは書類が 1 つに決まらない（同じ番号が複数の法人にある）。 */
export class AmbiguousDocNumberError extends Error {
  constructor(
    readonly type: string,
    readonly number: string,
    readonly companyCodes: string[],
  ) {
    super(
      `document number ${number} (${type}) exists in several companies: ${companyCodes.join(", ")}`,
    );
    this.name = "AmbiguousDocNumberError";
  }
}

const COMPANY_JOIN =
  'JOIN "app"."own_companies" c ON c."id" = d."own_company_id"';

/**
 * その番号の書類を持つ法人のコード（番号だけで引く）。
 * 登録されていない type は null、番号の形が合わなければ空。
 */
export async function docCompanyCodes(
  type: string,
  number: string,
  db: RawDb = prisma,
): Promise<string[] | null> {
  const shape = DOC_REF_TYPES[type];
  if (!shape) return null;
  let rows: { code: string }[];
  if (shape.by === "key") {
    const key = parseDocKey(number);
    if (!key) return [];
    rows = await db.$queryRawUnsafe<{ code: string }[]>(
      `SELECT c."code" FROM "app"."${shape.table}" d ${COMPANY_JOIN}
        WHERE d."year_month" = $1 AND d."seq" = $2 ORDER BY c."id"`,
      key.yearMonth,
      key.seq,
    );
  } else if (shape.by === "column") {
    rows = await db.$queryRawUnsafe<{ code: string }[]>(
      `SELECT c."code" FROM "app"."${shape.table}" d ${COMPANY_JOIN}
        WHERE d."${shape.column}" = $1 ORDER BY c."id"`,
      number,
    );
  } else {
    const key = parseOrderLineKey(number);
    if (!key) return [];
    rows = await db.$queryRawUnsafe<{ code: string }[]>(
      `SELECT c."code" FROM "app"."order_lines" l
         JOIN "app"."order_acceptances" d ON d."id" = l."acceptance_id"
         ${COMPANY_JOIN}
        WHERE d."year_month" = $1 AND d."seq" = $2 AND l."branch" = $3
        ORDER BY c."id"`,
      key.yearMonth,
      key.seq,
      key.branch,
    );
  }
  return rows.map((r) => r.code);
}

/**
 * 書類の id → 保存形の参照。
 *
 * - 登録されていない type … id をそのまま返す（uuid / ロット番号など）
 * - 書類番号の形でない id … そのまま返す（同じ type を uuid で指す参照がある —
 *   在庫の order_lines は明細の uuid）
 * - 法人コード付き（保存形・URL 形）… 保存形に揃えて返す
 * - 番号だけ … 法人を引く。該当なしは null、複数は例外
 */
export async function toDocRef(
  type: string,
  id: string,
  db: RawDb = prisma,
): Promise<string | null> {
  if (!isDocRefType(type)) return id;
  const { companyCode, number } = parseDocId(id);
  if (!isDocNumber(number)) return id;
  if (companyCode) return docRef(companyCode, number);
  const codes = (await docCompanyCodes(type, number, db)) ?? [];
  if (codes.length === 0) return null;
  if (codes.length > 1) throw new AmbiguousDocNumberError(type, number, codes);
  return docRef(codes[0], number);
}

/** 複数の id をまとめて参照へ直す（入力の id → 参照。該当なしは入らない）。 */
export async function toDocRefs(
  type: string,
  ids: readonly string[],
  db: RawDb = prisma,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const id of new Set(ids)) {
    const ref = await toDocRef(type, id, db);
    if (ref != null) out.set(id, ref);
  }
  return out;
}

/**
 * DB から読んだ参照 → 画面・Server Action が使う id（書類番号）。
 * 登録されていない type はそのまま。
 */
export function docDisplayId(type: string, stored: string): string {
  return isDocRefType(type) ? parseDocId(stored).number : stored;
}

/**
 * 書き込み用。対象の書類が無ければ例外 — 番号だけの文字列を保存しない
 * （保存されると、あとで別の法人の同じ番号の書類に付いて見える）。
 */
export async function requireDocRef(
  type: string,
  id: string,
  db: RawDb = prisma,
): Promise<string> {
  const ref = await toDocRef(type, id, db);
  if (ref == null) {
    throw new Error(`document not found for reference: ${type} ${id}`);
  }
  return ref;
}
