/**
 * data.ts — 納品書 (SH02) ページのサーバーサイド取得・マッピング。
 *
 * app.delivery_notes は (year_month, seq) の複合キー — 表示番号
 * DRN-YYYYMM-NNNNN は導出（保存しない）で、URL id を兼ねる。
 * Prisma Decimal はここで Number() へ変換してからクライアントへ渡す。
 */

import { ownOrPlantWhere, rowInScope } from "@ckk/authz-core";
import type {
  DeliveryMethod,
  DeliveryNote,
  DeliveryNoteStatus,
} from "@/components/shipping/delivery-notes/model";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  type DocKey,
  formatDocNumber,
  formatProductNumber,
  orderLineNumberOf,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

const DELIVERY_NOTE_INCLUDE = {
  // 1 出荷書は複数の注文明細を束ねられるので、明細行から番号を集める。
  deliveryOrder: {
    include: {
      items: {
        select: {
          orderLine: {
            select: {
              acceptanceYearMonth: true,
              acceptanceSeq: true,
              branch: true,
            },
          },
        },
      },
    },
  },
  recipientBp: true,
  recipientBranchBp: true,
  endUserBp: true,
  salesRep: { select: { id: true, displayName: true } },
  createdByUser: { select: { displayName: true } },
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
    deliveryOrderNumber: formatDocNumber("DOR", {
      yearMonth: r.deliveryOrderYearMonth,
      seq: r.deliveryOrderSeq,
    }),
    orderLineNumbers: [
      ...new Set(
        r.deliveryOrder.items
          .map((it) => (it.orderLine ? orderLineNumberOf(it.orderLine) : null))
          .filter((n): n is string => n != null),
      ),
    ],
    deliveryMethod: r.deliveryMethod as DeliveryMethod,
    recipientId: r.recipientBpId,
    recipientName: localized(r.recipientBp.name as LocalizedText | null),
    recipientBranchId: r.recipientBranchBpId,
    recipientBranchName: r.recipientBranchBp
      ? localized(r.recipientBranchBp.name as LocalizedText | null)
      : null,
    recipientDocumentLocale:
      r.recipientBranchBp?.documentLocale ??
      r.recipientBp.documentLocale ??
      null,
    endUserId: r.endUserBpId,
    endUserName: r.endUserBp
      ? localized(r.endUserBp.name as LocalizedText | null)
      : null,
    salesRepId: r.salesRep?.id ?? null,
    salesRepName: r.salesRep?.displayName ?? null,
    createdByName: r.createdByUser?.displayName ?? null,
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
  // スコープ行フィルタ（PLANT = 出荷書の出荷元拠点経由 ∪ OWN = 作成者）。
  // ALL は {} で従来通り全件。
  const authz = await checkPermission("delivery_note", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.deliveryNote.findMany({
    take: LIST_FETCH_CAP,
    where: ownOrPlantWhere(authz.access, authz.userId, {
      plantClause: (ids) => ({ deliveryOrder: { fromPlantId: { in: ids } } }),
      ownColumn: "createdBy",
    }) as Prisma.DeliveryNoteWhereInput,
    include: DELIVERY_NOTE_INCLUDE,
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
  });
  return rows.map(mapDeliveryNote);
}

/** 1件取得 — 未存在・スコープ外は null。 */
export async function fetchDeliveryNote(
  key: DocKey,
): Promise<DeliveryNote | null> {
  const authz = await checkPermission("delivery_note", "READ");
  if (!authz.ok) return null;
  const row = await findRow(key);
  if (!row) return null;
  if (
    !rowInScope(
      authz.access,
      { plantIds: [row.deliveryOrder.fromPlantId], createdBy: row.createdBy },
      authz.userId,
    )
  ) {
    return null;
  }
  return mapDeliveryNote(row);
}
