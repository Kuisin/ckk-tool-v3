/**
 * data.ts — 請求書 (BL01) ページのサーバーサイド取得・マッピング。
 *
 * app.invoices は (year_month, seq) の複合キー — 表示番号 INV-YYYYMM-NNNNN は
 * 導出（保存しない）で、URL id を兼ねる。明細（invoice_items）は由来として
 * 出荷書 / 納品書の複合キーを持ち、画面では導出番号のリンクとして表示する。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import { ownWhere, rowInScope } from "@ckk/authz-core";
import type {
  Invoice,
  InvoiceItem,
  InvoiceLink,
  InvoiceStatus,
} from "@/components/billing/invoices/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import { type DocKey, formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

const INVOICE_INCLUDE = {
  // customerAttrs.taxType は消費税ラベル（10% / 8% / 非課税）の表示に使う。
  customerBp: { include: { customerAttrs: true } },
  customerBranchBp: true,
  salesRep: { select: { id: true, displayName: true } },
  createdByUser: { select: { displayName: true } },
  items: {
    orderBy: { sortOrder: "asc" as const },
    // 明細の税区分は**会計連携のためだけ**に読む — 束 (taxSummaries) の区分が
    // 一意に定まらないとき（同じ率の区分が 2 つ以上あるとき）に、科目コードが
    // 食い違っていないかをここで確かめる。
    include: {
      taxCategory: {
        select: { taxCode: true, salesAccountCode: true, taxAccountCode: true },
      },
    },
  },
  // 税率ごとの区分記載（適格請求書）。行が無い＝税区分マスタ以前の請求書で、
  // その場合は読み出し側がヘッダから 1 本合成する（resolveTaxBuckets）。
  taxSummaries: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      taxCategory: {
        select: {
          name: true,
          taxCode: true,
          salesAccountCode: true,
          taxAccountCode: true,
        },
      },
    },
  },
};

/** 明細 1 行から読める会計コードの組（比較用に 1 本の文字列へ畳む）。 */
function accountingCodeKey(c: {
  taxCode: string | null;
  salesAccountCode: string | null;
  taxAccountCode: string | null;
}): string {
  return `${c.taxCode ?? ""}|${c.salesAccountCode ?? ""}|${c.taxAccountCode ?? ""}`;
}

type InvoiceRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function findRow(key: DocKey) {
  return prisma.invoice.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    include: INVOICE_INCLUDE,
  });
}

/** 由来キー（nullable ペア）→ 導出文書番号。片方でも欠ければ null。 */
function provenanceNumber(
  prefix: "DOR" | "DRN",
  yearMonth: string | null,
  seq: number | null,
): string | null {
  if (!yearMonth || seq == null) return null;
  return formatDocNumber(prefix, { yearMonth, seq });
}

/**
 * @param forDocument 取引先に出す帳票（PDF）用に読むときは true。
 *   摘要・取引先名を**受取先の言語**（business_partners.document_locale）で
 *   解決する（§17.4 / i18n-glossary 決定 10 — 書類は受取先の言語で出す。
 *   閲覧者の設定では変わらない）。画面は false のまま = 従来どおり。
 */
function mapInvoice(r: InvoiceRow, forDocument = false): Invoice {
  const number = formatDocNumber("INV", { yearMonth: r.yearMonth, seq: r.seq });
  const recipientDocumentLocale =
    r.customerBranchBp?.documentLocale ?? r.customerBp.documentLocale ?? null;
  // 帳票のときだけ受取先の言語。null（未設定）は localized 側で ja へ落ちる。
  const loc = forDocument ? (recipientDocumentLocale ?? "ja") : "ja";
  const items: InvoiceItem[] = r.items.map((it) => ({
    id: it.id,
    description: localized(it.description as LocalizedText | null, loc),
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice),
    amount: Number(it.amount),
    deliveryOrderNumber: provenanceNumber(
      "DOR",
      it.deliveryOrderYearMonth,
      it.deliveryOrderSeq,
    ),
    deliveryNoteNumber: provenanceNumber(
      "DRN",
      it.deliveryNoteYearMonth,
      it.deliveryNoteSeq,
    ),
  }));
  return {
    id: number,
    invoiceNumber: number,
    customerBpId: r.customerBpId,
    customerName: localized(r.customerBp.name as LocalizedText | null, loc),
    customerBranchName: r.customerBranchBp
      ? localized(r.customerBranchBp.name as LocalizedText | null, loc)
      : null,
    recipientDocumentLocale,
    salesRepId: r.salesRep?.id ?? null,
    salesRepName: r.salesRep?.displayName ?? null,
    createdByName: r.createdByUser?.displayName ?? null,
    billingPeriodFrom: r.billingPeriodFrom.toISOString(),
    billingPeriodTo: r.billingPeriodTo.toISOString(),
    subtotal: Number(r.subtotal),
    taxAmount: Number(r.taxAmount),
    // 発行時点のスナップショットが正。無い（このマイグレーション以前の）行だけ
    // 顧客マスタの現在の区分へ落とす — 顧客を後から EXEMPT に変えても、
    // 発行済みの請求書のラベルは 10% のままでなければならない。
    taxType: r.taxType ?? r.customerBp.customerAttrs?.taxType ?? null,
    taxRate: r.taxRate != null ? Number(r.taxRate) : null,
    taxBuckets: r.taxSummaries.map((b) => {
      const rate = Number(b.taxRate);
      // 束の区分が定まらないときだけ、その率の明細が持つ科目コードを見比べる。
      // 1 種類に決まるならそれを使ってよい（区分が 2 つでも会計上は同じ科目、
      // というのは普通にある）。2 種類以上あるときだけ食い違いとして印を付ける。
      const itemCodes = b.taxCategory
        ? []
        : [
            ...new Set(
              r.items
                .filter(
                  (it) => it.taxRate != null && Number(it.taxRate) === rate,
                )
                .map((it) => it.taxCategory)
                .filter((c) => c != null)
                .map(accountingCodeKey),
            ),
          ];
      const sole =
        itemCodes.length === 1
          ? r.items
              .map((it) => it.taxCategory)
              .find((c) => c != null && accountingCodeKey(c) === itemCodes[0])
          : null;
      return {
        taxRate: rate,
        taxableBase: Number(b.taxableBase),
        taxAmount: Number(b.taxAmount),
        categoryName: b.taxCategory
          ? localized(b.taxCategory.name as LocalizedText | null)
          : null,
        taxCode: b.taxCategory?.taxCode ?? sole?.taxCode ?? null,
        salesAccountCode:
          b.taxCategory?.salesAccountCode ?? sole?.salesAccountCode ?? null,
        taxAccountCode:
          b.taxCategory?.taxAccountCode ?? sole?.taxAccountCode ?? null,
        codeConflict: itemCodes.length > 1,
      };
    }),
    totalAmount: Number(r.totalAmount),
    status: r.status as InvoiceStatus,
    issuedAt: r.issuedAt?.toISOString() ?? null,
    dueDate: r.dueDate?.toISOString() ?? null,
    sentAt: r.sentAt?.toISOString() ?? null,
    accountingExportedAt: r.accountingExportedAt?.toISOString() ?? null,
    notes: r.notes,
    items,
    totalQuantity: items.reduce((sum, it) => sum + it.quantity, 0),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/**
 * 一覧 — 新しい採番から順に。
 *
 * スコープ（監査 M3）: 請求書に拠点は無いので OWN（自分が起票した分）だけを
 * 見る。ALL は {} で従来どおり全件。見積書（sales/quotes/data.ts）と同じ形。
 */
export async function fetchInvoices(): Promise<Invoice[]> {
  const authz = await checkPermission("invoice", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.invoice.findMany({
    take: LIST_FETCH_CAP,
    where: ownWhere(
      authz.access,
      authz.userId,
      "createdBy",
    ) as Prisma.InvoiceWhereInput,
    include: INVOICE_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  // 引数付きで渡さない（`map(mapInvoice)` は添字が第 2 引数に入るため）。
  return rows.map((r) => mapInvoice(r));
}

/** 1件取得 — 未存在・スコープ外は null（呼び出し側の notFound / 404 に乗せる）。 */
export async function fetchInvoice(key: DocKey): Promise<Invoice | null> {
  const authz = await checkPermission("invoice", "READ");
  if (!authz.ok) return null;
  const row = await findRow(key);
  if (!row) return null;
  if (!rowInScope(authz.access, { createdBy: row.createdBy }, authz.userId)) {
    return null;
  }
  return mapInvoice(row);
}

/**
 * 帳票用の 1 件取得 — 摘要・取引先名を**受取先の言語**で解決する。
 * PDF ルート（api/pdf/invoice）と会計連携 CSV から使う。権限・スコープの扱いは
 * fetchInvoice と同じ。
 */
export async function fetchInvoiceForDocument(
  key: DocKey,
): Promise<Invoice | null> {
  const authz = await checkPermission("invoice", "READ");
  if (!authz.ok) return null;
  const row = await findRow(key);
  if (!row) return null;
  if (!rowInScope(authz.access, { createdBy: row.createdBy }, authz.userId)) {
    return null;
  }
  return mapInvoice(row, true);
}

/**
 * 会計連携（仕訳 CSV）が要る取引先側のコード。
 *
 * **画面の DTO（Invoice）には混ぜない** — 勘定科目コードは出力にしか使わない
 * 値で、一覧や詳細に載せるとクライアントのバンドルに乗るだけだから。読むのは
 * `app/api/export/accounting` の 1 か所。
 */
export async function fetchInvoiceAccountingParty(
  customerBpId: string,
): Promise<{
  customerCode: string | null;
  receivableAccountCode: string | null;
  receivableSubAccountCode: string | null;
}> {
  const attrs = await prisma.bpCustomerAttrs.findUnique({
    where: { bpId: customerBpId },
    select: {
      customerCode: true,
      receivableAccountCode: true,
      receivableSubAccountCode: true,
    },
  });
  return {
    customerCode: attrs?.customerCode ?? null,
    receivableAccountCode: attrs?.receivableAccountCode ?? null,
    receivableSubAccountCode: attrs?.receivableSubAccountCode ?? null,
  };
}

/**
 * 逆リンク — その納品書を請求した請求書（新しい採番順）。
 *
 * 明細（invoice_items）が由来の納品書キーを持つので、そこから逆に引く。
 * 1 納品書が複数の請求書に載ることは通常ないが、訂正再発行があり得るため配列。
 */
export async function fetchInvoicesForDeliveryNote(
  key: DocKey,
): Promise<InvoiceLink[]> {
  const rows = await prisma.invoice.findMany({
    where: {
      items: {
        some: {
          deliveryNoteYearMonth: key.yearMonth,
          deliveryNoteSeq: key.seq,
        },
      },
    },
    select: {
      yearMonth: true,
      seq: true,
      status: true,
      totalAmount: true,
      issuedAt: true,
    },
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
    take: 20,
  });
  return rows.map((r) => ({
    number: formatDocNumber("INV", { yearMonth: r.yearMonth, seq: r.seq }),
    status: r.status as InvoiceStatus,
    totalAmount: Number(r.totalAmount),
    issuedAt: r.issuedAt?.toISOString() ?? null,
  }));
}
