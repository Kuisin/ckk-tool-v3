/**
 * data.ts — 納品書 (SH02) ページのサーバーサイド取得・マッピング。
 *
 * app.delivery_notes は (year_month, seq) の複合キー — 表示番号
 * DRN-YYYYMM-NNNNN は導出（保存しない）で、URL id を兼ねる。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import type {
  DeliveryMethod,
  DeliveryNote,
  DeliveryNoteStatus,
  ShippingOrderCandidate,
} from "@/components/shipping/delivery-notes/model";
import { prisma } from "@/lib/db";
import {
  type DocKey,
  formatDocNumber,
  formatProductNumber,
  formatSalesOrderNumber,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

const DELIVERY_NOTE_INCLUDE = {
  shippingOrder: {
    include: { salesOrder: true },
  },
  recipientBp: true,
  recipientBranchBp: true,
  endUserBp: true,
  items: {
    orderBy: { sortOrder: "asc" as const },
    include: { product: true },
  },
};

type DeliveryNoteRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function findRow(key: DocKey) {
  return prisma.deliveryNote.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    include: DELIVERY_NOTE_INCLUDE,
  });
}

/** 製品ラベル: 名称 + 製品コード（レガシーはコード未採番 → 名称のみ）。 */
function productLabel(p: {
  name: unknown;
  yearMonth: string | null;
  seq: number | null;
}): string {
  const code = formatProductNumber(p.yearMonth, p.seq);
  const name = localized(p.name as LocalizedText | null);
  return code ? `${name} ${code}` : name;
}

function mapDeliveryNote(r: DeliveryNoteRow): DeliveryNote {
  const number = formatDocNumber("DRN", {
    yearMonth: r.yearMonth,
    seq: r.seq,
  });
  const items = r.items.map((it) => ({
    id: it.id,
    productId: String(it.productId),
    productName: productLabel(it.product),
    quantity: it.quantity,
    unitPrice: it.unitPrice != null ? Number(it.unitPrice) : null,
    amount: it.amount != null ? Number(it.amount) : null,
    notes: it.notes,
  }));
  return {
    id: number,
    deliveryNumber: number,
    shippingOrderNumber: formatDocNumber("SHP", {
      yearMonth: r.shippingOrderYearMonth,
      seq: r.shippingOrderSeq,
    }),
    salesOrderNumber: formatSalesOrderNumber(r.shippingOrder.salesOrder),
    deliveryMethod: r.deliveryMethod as DeliveryMethod,
    recipientId: r.recipientBpId,
    recipientName: localized(r.recipientBp.name as LocalizedText | null),
    recipientBranchId: r.recipientBranchBpId,
    recipientBranchName: r.recipientBranchBp
      ? localized(r.recipientBranchBp.name as LocalizedText | null)
      : null,
    endUserId: r.endUserBpId,
    endUserName: r.endUserBp
      ? localized(r.endUserBp.name as LocalizedText | null)
      : null,
    includePrice: r.includePrice,
    status: r.status as DeliveryNoteStatus,
    deliveredAt: r.deliveredAt?.toISOString() ?? null,
    notes: r.notes,
    items,
    totalQuantity: items.reduce((sum, it) => sum + it.quantity, 0),
    totalAmount: r.includePrice
      ? items.reduce((sum, it) => sum + (it.amount ?? 0), 0)
      : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** 一覧 — 新しい採番から順に。 */
export async function fetchDeliveryNotes(): Promise<DeliveryNote[]> {
  const rows = await prisma.deliveryNote.findMany({
    include: DELIVERY_NOTE_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map(mapDeliveryNote);
}

/** 1件取得 — 未存在は null。 */
export async function fetchDeliveryNote(
  key: DocKey,
): Promise<DeliveryNote | null> {
  const row = await findRow(key);
  return row ? mapDeliveryNote(row) : null;
}

// ── 新規フォーム用: 出荷書候補（確定済み・出荷済みのみ） ─────────────────────

/**
 * 納品書を作成できる出荷書（CONFIRMED / SHIPPED）の候補一覧。
 * 少数想定のためサーバーで一括ロードして Select に渡す（最新 100 件）。
 */
export async function fetchShippingOrderCandidates(): Promise<
  ShippingOrderCandidate[]
> {
  const rows = await prisma.shippingOrder.findMany({
    where: { status: { in: ["CONFIRMED", "SHIPPED"] } },
    include: {
      salesOrder: {
        include: { customerBp: true, customerBranchBp: true, endUserBp: true },
      },
      items: {
        orderBy: { sortOrder: "asc" },
        include: { product: true },
      },
    },
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
    take: 100,
  });
  return rows.map((r) => {
    const number = formatDocNumber("SHP", {
      yearMonth: r.yearMonth,
      seq: r.seq,
    });
    const customerName = localized(
      r.salesOrder.customerBp.name as LocalizedText | null,
    );
    const totalQuantity = r.items.reduce((sum, it) => sum + it.quantity, 0);
    return {
      number,
      label: `${number}　${customerName}（${totalQuantity}）`,
      customerName,
      customerBranchName: r.salesOrder.customerBranchBp
        ? localized(r.salesOrder.customerBranchBp.name as LocalizedText | null)
        : null,
      endUserBpId: r.salesOrder.endUserBpId,
      endUserName: r.salesOrder.endUserBp
        ? localized(r.salesOrder.endUserBp.name as LocalizedText | null)
        : null,
      items: r.items.map((it) => ({
        productId: String(it.productId),
        productName: productLabel(it.product),
        quantity: it.quantity,
        // 単価の既定値は注文請書の単価（価格記載ありのとき使用）。
        unitPrice: Number(r.salesOrder.unitPrice),
      })),
    };
  });
}
