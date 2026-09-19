/**
 * data.ts — 締日処理 (BL02) のサーバーサイド取得・請求対象出荷の収集。
 *
 * 請求対象 = SHIPPED × DISPATCH の出荷書のうち「未請求」のもの。
 * 未請求判定は invoice_items の由来キー（delivery_order_year_month/seq）に
 * その出荷書が現れないこと（STOCK_STORAGE は請求フロー外なので対象外）。
 * 請求期間は顧客ごとに **(前回締日, 今回締日]**（境界は JST 0 時 —
 * model.ts billingWindowFor）。暦月で切ると締日より後の出荷がどの締めにも
 * 入らず請求されない。
 * runClosing / processClosing (actions.ts) と詳細画面がここを共用する。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import {
  addDays,
  type BillingClosing,
  type BillingClosingDetail,
  billingPeriodStartFrom,
  type ClosingKind,
  type ClosingShipmentRow,
  type ClosingStatus,
  jstMidnightOf,
  scheduledClosingDates,
} from "@/components/billing/closings/model";
import { resolveDueDate } from "@/lib/billing-terms-core";
import { chargesTotal } from "@/lib/charge-core";
import { prisma } from "@/lib/db";
import { formatDocNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { lineAmountYen } from "@/lib/money";

// ── 締日処理行のマッピング ───────────────────────────────────────────────────

const CLOSING_INCLUDE = {
  customerBp: {
    include: {
      // 支払条件（支払サイト・支払日）と請求先 — 支払期日と宛先の根拠。
      customerAttrs: {
        select: {
          paymentTermsDays: true,
          paymentDay: true,
          billingBpId: true,
          billingBp: { select: { name: true } },
        },
      },
    },
  },
};

type ClosingRow = NonNullable<Awaited<ReturnType<typeof findClosingRow>>>;

function findClosingRow(id: string) {
  return prisma.billingClosing.findUnique({
    where: { id },
    include: CLOSING_INCLUDE,
  });
}

function mapClosing(r: ClosingRow): BillingClosing {
  return {
    id: r.id,
    customerBpId: r.customerBpId,
    customerName: localized(r.customerBp.name as LocalizedText | null),
    closingDate: r.closingDate.toISOString(),
    kind: r.kind as ClosingKind,
    status: r.status as ClosingStatus,
    totalAmount: r.totalAmount != null ? Number(r.totalAmount) : null,
    invoiceNumber:
      r.invoiceYearMonth && r.invoiceSeq != null
        ? formatDocNumber("INV", {
            yearMonth: r.invoiceYearMonth,
            seq: r.invoiceSeq,
          })
        : null,
    processedAt: r.processedAt?.toISOString() ?? null,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  };
}

/** 一覧 — 締日の新しい順。 */
export async function fetchClosings(): Promise<BillingClosing[]> {
  const rows = await prisma.billingClosing.findMany({
    include: CLOSING_INCLUDE,
    orderBy: [{ closingDate: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(mapClosing);
}

// ── 請求対象出荷（SHIPPED × DISPATCH × 未請求）の収集 ────────────────────────

const SHIPMENT_INCLUDE = {
  // 顧客はヘッダが権威。単価は明細行が参照する注文明細ごとに異なり得る。
  customerBp: { include: { customerAttrs: true } },
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      // 品目統合 第 2 段 C — 品名・課税区分は品目側から読む。
      item: true,
      // acceptance は営業担当の導出用（出荷書は担当を保存しない）と、
      // 税率の基準日（注文日）の取得用。
      orderLine: {
        include: {
          acceptance: { select: { salesRepId: true, orderDate: true } },
        },
      },
    },
  },
  deliveryNotes: {
    select: { yearMonth: true, seq: true },
    orderBy: [{ yearMonth: "asc" as const }, { seq: "asc" as const }],
  },
  // 追加料金（送料など）。製品明細と同じく請求書へ写る — 締日画面の予定額と
  // 発行される請求書が同じものを数えるよう、ここで一緒に読む。
  charges: {
    orderBy: { sortOrder: "asc" as const },
    include: { chargeItem: { select: { name: true, taxCategoryId: true } } },
  },
};

export type BillableShipment = Awaited<
  ReturnType<typeof fetchUninvoicedShipments>
>[number];

/**
 * 期間内（shippedAt: gte ≤ t < lt）の SHIPPED × DISPATCH 出荷書のうち、
 * まだどの請求書明細にも由来として現れていないもの。
 */
export async function fetchUninvoicedShipments(range: { gte: Date; lt: Date }) {
  const [rows, invoiced] = await Promise.all([
    prisma.deliveryOrder.findMany({
      where: {
        type: "DISPATCH",
        status: "SHIPPED",
        shippedAt: { gte: range.gte, lt: range.lt },
      },
      include: SHIPMENT_INCLUDE,
      orderBy: [{ yearMonth: "asc" }, { seq: "asc" }],
    }),
    prisma.invoiceItem.findMany({
      where: { deliveryOrderYearMonth: { not: null } },
      select: { deliveryOrderYearMonth: true, deliveryOrderSeq: true },
    }),
  ]);
  const invoicedSet = new Set(
    invoiced.map((r) => `${r.deliveryOrderYearMonth}-${r.deliveryOrderSeq}`),
  );
  return rows.filter((r) => !invoicedSet.has(`${r.yearMonth}-${r.seq}`));
}

/**
 * 請求期間の始点（暦日）。**前回処理した締日の翌日**が正で、処理済みの行が
 * 無いときだけ顧客の締日設定から逆算する（model.ts billingPeriodStartFrom）。
 * processClosing と fetchBillableShipmentsForClosing の両方がこれを通る。
 */
export async function resolveBillingPeriodStart(
  customerBpId: string,
  closingDate: Date,
): Promise<Date> {
  const [attrs, previous] = await Promise.all([
    prisma.bpCustomerAttrs.findUnique({
      where: { bpId: customerBpId },
      select: { closingDay: true },
    }),
    prisma.billingClosing.findFirst({
      where: {
        customerBpId,
        closingDate: { lt: closingDate },
        status: { in: ["PROCESSED", "EXPORTED"] },
      },
      orderBy: { closingDate: "desc" },
      select: { closingDate: true },
    }),
  ]);
  return billingPeriodStartFrom(
    closingDate,
    attrs?.closingDay ?? null,
    previous?.closingDate ?? null,
  );
}

/**
 * 顧客 × 締日の請求対象出荷 — (前回締日, 締日]（JST）。processClosing と共用。
 * 前回締日は顧客の締日設定（BpCustomerAttrs.closingDay）から引く。上限は
 * この締日行の closingDate そのもの（設定が後から変わっても行の締日は動かない）。
 */
export async function fetchBillableShipmentsForClosing(
  customerBpId: string,
  closingDate: Date,
): Promise<BillableShipment[]> {
  const gte = jstMidnightOf(
    await resolveBillingPeriodStart(customerBpId, closingDate),
  );
  const lt = jstMidnightOf(addDays(closingDate, 1)); // 締日当日を含む（排他的上限）
  const rows = await fetchUninvoicedShipments({ gte, lt });
  return rows.filter((r) => r.customerBpId === customerBpId);
}

/**
 * 請求に使う単価 — **出荷書の確定時に焼き込んだ値が先**（過不足納品で
 * 「実納品数で価格表を引き直す」を選んだ出荷はここに反映されている）。
 * null は移行前・未確定のデータなので、そのときだけ注文明細の単価へ落ちる。
 *
 * 締日画面の予定額（shipmentAmount）と発行される請求書の明細が同じ関数を
 * 通るようにしてある — 別々に読むと、片方だけ焼き込みを見落とす。
 */
export function billableUnitPrice(it: {
  unitPrice: unknown;
  orderLine?: { unitPrice: unknown } | null;
}): number {
  if (it.unitPrice != null) return Number(it.unitPrice);
  return Number(it.orderLine?.unitPrice ?? 0);
}

/**
 * 出荷書 1 件の請求金額 = Σ（明細数量 × **その行の**単価）。
 * 1 出荷書が単価の異なる複数の注文明細を束ねられるので、出荷書単位の
 * 単一単価では誤請求になる。
 */
export function shipmentAmount(s: BillableShipment): number {
  // 行ごとに円へ丸めてから足す（lib/money.ts の方針）— 締日処理が作る請求書の
  // 明細と同じ丸め方なので、締日画面の予定額と発行後の請求額がずれない。
  // **追加料金（送料など）も足す** — 請求書には明細として載るので、ここで
  // 数えないと締日画面の予定額だけが少なく出る。
  return (
    s.items.reduce(
      (sum, it) => sum + lineAmountYen(billableUnitPrice(it), it.quantity),
      0,
    ) + chargesTotal(s.charges.map((c) => ({ amount: Number(c.amount) })))
  );
}

function mapShipmentRow(s: BillableShipment): ClosingShipmentRow {
  return {
    deliveryOrderNumber: formatDocNumber("DOR", {
      yearMonth: s.yearMonth,
      seq: s.seq,
    }),
    shippedAt: s.shippedAt?.toISOString() ?? null,
    quantity: s.items.reduce((sum, it) => sum + it.quantity, 0),
    amount: shipmentAmount(s),
  };
}

// ── 詳細（対象出荷リスト込み） ───────────────────────────────────────────────

/** 処理済み締日の対象出荷 — 生成請求書の明細由来から復元する。 */
async function fetchShipmentsFromInvoice(
  invoiceYearMonth: string,
  invoiceSeq: number,
): Promise<ClosingShipmentRow[]> {
  const items = await prisma.invoiceItem.findMany({
    where: { invoiceYearMonth, invoiceSeq },
    orderBy: { sortOrder: "asc" },
  });
  // 出荷書キーごとに数量・金額を集計する。
  const byKey = new Map<
    string,
    { yearMonth: string; seq: number; quantity: number; amount: number }
  >();
  for (const it of items) {
    if (!it.deliveryOrderYearMonth || it.deliveryOrderSeq == null) continue;
    const key = `${it.deliveryOrderYearMonth}-${it.deliveryOrderSeq}`;
    const cur = byKey.get(key) ?? {
      yearMonth: it.deliveryOrderYearMonth,
      seq: it.deliveryOrderSeq,
      quantity: 0,
      amount: 0,
    };
    cur.quantity += it.quantity;
    cur.amount += Number(it.amount);
    byKey.set(key, cur);
  }
  const keys = [...byKey.values()];
  if (keys.length === 0) return [];
  const orders = await prisma.deliveryOrder.findMany({
    where: {
      OR: keys.map((k) => ({ yearMonth: k.yearMonth, seq: k.seq })),
    },
    select: { yearMonth: true, seq: true, shippedAt: true },
  });
  const shippedAtByKey = new Map(
    orders.map((o) => [`${o.yearMonth}-${o.seq}`, o.shippedAt]),
  );
  return keys.map((k) => ({
    deliveryOrderNumber: formatDocNumber("DOR", {
      yearMonth: k.yearMonth,
      seq: k.seq,
    }),
    shippedAt:
      shippedAtByKey.get(`${k.yearMonth}-${k.seq}`)?.toISOString() ?? null,
    quantity: k.quantity,
    amount: k.amount,
  }));
}

/** 1件取得（詳細）— 未存在は null。 */
export async function fetchClosing(
  id: string,
): Promise<BillingClosingDetail | null> {
  const row = await findClosingRow(id);
  if (!row) return null;
  const closing = mapClosing(row);

  // PENDING: 未請求候補を計算 / PROCESSED・EXPORTED: 請求書の由来から復元。
  const shipments =
    row.status === "PENDING"
      ? (
          await fetchBillableShipmentsForClosing(
            row.customerBpId,
            row.closingDate,
          )
        ).map(mapShipmentRow)
      : row.invoiceYearMonth && row.invoiceSeq != null
        ? await fetchShipmentsFromInvoice(row.invoiceYearMonth, row.invoiceSeq)
        : [];

  const attrs = row.customerBp.customerAttrs;
  return {
    ...closing,
    shipments,
    // 請求先が顧客本人と同じなら出さない（全顧客の 99% は null）。
    billingPartyName:
      attrs?.billingBpId && attrs.billingBpId !== row.customerBpId
        ? localized(attrs.billingBp?.name as LocalizedText | null)
        : null,
    paymentTermsDays: attrs?.paymentTermsDays ?? null,
    paymentDay: attrs?.paymentDay ?? null,
    // 画面に出す期日も請求書に刷る期日も同じ関数を通す
    // （別々に計算すると、生成前に見えていた期日と請求書が食い違う）。
    dueDate: resolveDueDate(row.closingDate, {
      paymentTermsDays: attrs?.paymentTermsDays,
      paymentDay: attrs?.paymentDay,
    })
      .toISOString()
      .slice(0, 10),
  };
}

// ── runClosing 用: 顧客ごとの締日確定 ────────────────────────────────────────

export interface CustomerClosingCandidate {
  customerBpId: string;
  customerName: string;
  closingDate: Date;
  totalAmount: number;
  shipmentNumbers: string[];
}

/** 実質的に下限なしとして扱う日付（未請求出荷は epoch より後にしか存在しない）。 */
const EPOCH = new Date(0);

/**
 * **指定日までに締日が到来し、まだ請求されていない未請求出荷**を顧客ごとに
 * まとめる。締日（BpCustomerAttrs.closingDay、既定 = 月末）は顧客ごとに違う
 * ので、1 回の呼び出しで「何か月ぶんも走らせ忘れていた顧客」を一度に拾う —
 * 月次だった旧 collectClosingCandidates（1 回の呼び出しで 1 顧客 1 締日しか
 * 見なかった）が「月初 3 日だけ前月も見る」その場しのぎを要求していた原因。
 *
 * 顧客ごとに、
 *   1. 最初の締日候補の窓の始点は resolveBillingPeriodStart で決める
 *      （前回実際に処理した締日があればその翌日 — 締日設定を変えた月でも
 *      隙間を作らない、従来の processClosing と同じ規約）。
 *   2. 以降の締日候補は 1 か月ずつ後ろへ鎖状につながる（scheduledClosingDates
 *      が生成する隣り合う締日は必ず暦 1 か月差なので、窓の終わりと次の窓の
 *      始まりが一致する）。
 * 出荷が 1 件も無い締日候補は行を作らない（従来どおり）。
 */
export async function collectClosingCandidatesUpTo(
  targetDate: Date,
): Promise<CustomerClosingCandidate[]> {
  const lt = jstMidnightOf(addDays(targetDate, 1));
  const shipments = await fetchUninvoicedShipments({ gte: EPOCH, lt });

  const byCustomer = new Map<string, BillableShipment[]>();
  for (const s of shipments) {
    if (!s.shippedAt) continue;
    const list = byCustomer.get(s.customerBpId);
    if (list) list.push(s);
    else byCustomer.set(s.customerBpId, [s]);
  }

  const candidates: CustomerClosingCandidate[] = [];
  for (const [customerBpId, custShipments] of byCustomer) {
    const customer = custShipments[0].customerBp;
    const closingDay = customer.customerAttrs?.closingDay ?? null;
    const customerName = localized(customer.name as LocalizedText | null);

    // scheduledClosingDates の fromDate は「どの月から数え始めるか」だけを
    // 決める下限 — 実際の窓の始点（gte）は resolveBillingPeriodStart /
    // 前候補の締日+1日 が別に決める（下のループ）。
    const earliestShippedAt = custShipments.reduce(
      (min, s) => (s.shippedAt && s.shippedAt < min ? s.shippedAt : min),
      custShipments[0].shippedAt as Date,
    );
    const scanFrom = new Date(
      Date.UTC(
        earliestShippedAt.getUTCFullYear(),
        earliestShippedAt.getUTCMonth(),
        1,
      ),
    );
    const dates = scheduledClosingDates(scanFrom, targetDate, closingDay);

    let previousClosingDate: Date | null = null;
    for (const closingDate of dates) {
      const windowStart = previousClosingDate
        ? addDays(previousClosingDate, 1)
        : await resolveBillingPeriodStart(customerBpId, closingDate);
      const gte = jstMidnightOf(windowStart);
      const windowLt = jstMidnightOf(addDays(closingDate, 1));
      const inWindow = custShipments.filter(
        (s) => s.shippedAt && s.shippedAt >= gte && s.shippedAt < windowLt,
      );
      if (inWindow.length > 0) {
        candidates.push({
          customerBpId,
          customerName,
          closingDate,
          totalAmount: inWindow.reduce((sum, s) => sum + shipmentAmount(s), 0),
          shipmentNumbers: inWindow.map((s) =>
            formatDocNumber("DOR", { yearMonth: s.yearMonth, seq: s.seq }),
          ),
        });
      }
      previousClosingDate = closingDate;
    }
  }
  return candidates;
}

// ── 手動請求（BL11）用: 顧客の未請求出荷を締日窓に依らず全件 ──────────────────

/** 締日窓を無視して、その顧客の未請求出荷を全件返す（手動請求の選択肢）。 */
export async function fetchUninvoicedShipmentsForCustomer(
  customerBpId: string,
): Promise<BillableShipment[]> {
  const rows = await fetchUninvoicedShipments({
    gte: EPOCH,
    lt: jstMidnightOf(addDays(new Date(), 1)),
  });
  return rows.filter((r) => r.customerBpId === customerBpId);
}
