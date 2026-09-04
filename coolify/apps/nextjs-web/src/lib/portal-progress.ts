/**
 * portal-progress.ts — 社外へ出す進捗（受注・出荷）。server-only.
 *
 * ■ 行のダンプではなく射影
 *
 * order_lines と delivery_orders を素で返すと、社外に出してはいけないものが
 * 一緒に出る（実測）:
 *   order_lines.lot_number      = 指示書番号。キオスクの QR `CKK:WO:<int>` そのもの
 *   order_lines.is_locked       = 承認依頼中であること
 *   delivery_orders.work_order_id → WorkOrderStep.supplierBp = **外注先**
 *   order_acceptances.extracted / notes / assigned_plant_id / sales_rep_id
 *
 * なので select は許可リストにし、返すのは PortalOrderLineDto だけにする
 * （キー集合は portal-progress-core.test.ts が固定）。
 *
 * ■ 出荷は「納品書が届いたか」までしか言わない
 * 出荷書（delivery_orders）そのものは社外に出さない。納品書の delivered_at を
 * 見て DELIVERED を出すだけで、どの拠点からどう出たかは語らない。
 */

import "server-only";

import { prisma } from "./db";
import { type LocalizedTextInput, localized } from "./format";
import { portalAccessFor, portalScopeFor } from "./portal-access";
import type { PortalSession } from "./portal-auth";
import {
  type PortalRelatedRef,
  visiblePortalRelated,
} from "./portal-documents";
import {
  type PortalOrderLineDetailDto,
  type PortalOrderLineDto,
  portalProgressOf,
} from "./portal-progress-core";

// 純粋なもの（番号の組み立て・分解・集計）は core にある。ページからは
// このファイル 1 本を読めば済むように、そのまま通す。
export {
  type PortalOrderSummary,
  parsePortalOrderLineNumber,
  portalOrderLineNumber,
  summarizePortalOrders,
} from "./portal-progress-core";

/** 社外に出す注文明細の状態（DRAFT は確定前なので出さない）。 */
const VISIBLE_LINE_STATUS = [
  "CONFIRMED",
  "IN_PRODUCTION",
  "PARTIAL_SHIPPED",
  "SHIPPED",
  "CANCELLED",
] as const;

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export interface PortalOrderLineRow extends PortalOrderLineDto {
  /** 一覧の並び・リンク用（表示番号。内部 id は出さない）。 */
  acceptanceNumber: string;
}

/**
 * 自社の注文明細の進捗。
 *
 * 納品済みの判定は「その明細が載っている出荷書の納品書が納品済みか」。
 * 出荷書そのものは出さないので、ここは delivered_at の有無だけを取る。
 */
export async function listPortalOrderLines(
  session: PortalSession,
): Promise<PortalOrderLineRow[]> {
  // リンク限定セッションは進捗を持たない（その 1 件だけのスコープ）。
  if (session.linkId) return [];

  const scope = await portalScopeFor(session);
  const bpIds = scope.customerBpIds;
  const endUserBpIds = scope.endUserBpIds;
  if (bpIds.length === 0 && endUserBpIds.length === 0) return [];

  const rows = await prisma.orderLine.findMany({
    where: {
      status: { in: [...VISIBLE_LINE_STATUS] },
      branch: { not: null }, // 確定していない行は番号も金額も無い
      acceptance: {
        OR: [
          { customerBpId: { in: bpIds } },
          { customerBranchBpId: { in: bpIds } },
          ...(endUserBpIds.length
            ? [
                { endUserBpId: { in: endUserBpIds } },
                { shipToBpId: { in: endUserBpIds } },
              ]
            : []),
        ],
      },
    },
    // ★ 許可リスト。lot_number / is_locked / product_id は**取らない**。
    select: {
      acceptanceYearMonth: true,
      acceptanceSeq: true,
      branch: true,
      quantity: true,
      unitPrice: true,
      amount: true,
      deliveryDate: true,
      status: true,
      cancelledAt: true,
      productText: true,
      product: { select: { name: true } },
      deliveryItems: {
        select: {
          deliveryOrder: {
            select: {
              deliveryNotes: { select: { deliveredAt: true } },
              shippedAt: true,
            },
          },
        },
      },
    },
    orderBy: [
      { acceptanceYearMonth: "desc" },
      { acceptanceSeq: "desc" },
      { branch: "asc" },
    ],
    take: 300,
  });

  return rows.map((r) => {
    const deliveries = r.deliveryItems.flatMap((i) =>
      i.deliveryOrder.deliveryNotes.map((n) => ({
        deliveredAt: n.deliveredAt,
      })),
    );
    const shippedAt = r.deliveryItems
      .map((i) => i.deliveryOrder.shippedAt)
      .filter((d): d is Date => d != null)
      .sort((a, b) => a.getTime() - b.getTime())[0];

    return {
      acceptanceNumber: `ORD-${r.acceptanceYearMonth}-${String(r.acceptanceSeq).padStart(5, "0")}`,
      branch: r.branch,
      // 製品マスタに突合済みならその名称、未突合なら注文書に印字されていた
      // 品名（product_text）。**内部の product_id は出さない。**
      productName: r.product?.name
        ? localized(r.product.name as LocalizedTextInput)
        : (r.productText ?? "—"),
      quantity: r.quantity,
      unitPrice: r.unitPrice?.toString() ?? null,
      amount: r.amount?.toString() ?? null,
      deliveryDate: iso(r.deliveryDate),
      progress: portalProgressOf(
        { status: r.status, cancelledAt: r.cancelledAt },
        deliveries,
      ),
      shippedOn: iso(shippedAt ?? null),
    };
  });
}

/**
 * 注文明細 1 件の詳細。
 *
 * **一覧と同じ許可リスト**に、その 1 件を開いたときだけ出すもの
 * （取引先自身の注文書番号・注文日・関連書類）を足す。関連書類は
 * `visiblePortalRelated` を通すので、見えない相手は行ごと落ちる。
 *
 * 見えない／存在しないは同じ null（呼び出し側は 404 にする）。
 */
export async function getPortalOrderLine(
  session: PortalSession,
  yearMonth: string,
  seq: number,
  branch: number,
): Promise<PortalOrderLineDetailDto | null> {
  // リンク限定セッションは進捗を持たない（その 1 件だけのスコープ）。
  if (session.linkId) return null;

  const row = await prisma.orderLine.findFirst({
    where: {
      acceptanceYearMonth: yearMonth,
      acceptanceSeq: seq,
      branch,
      status: { in: [...VISIBLE_LINE_STATUS] },
    },
    // ★ 許可リスト。lot_number / is_locked / product_id は取らない。
    select: {
      branch: true,
      quantity: true,
      unitPrice: true,
      amount: true,
      deliveryDate: true,
      status: true,
      cancelledAt: true,
      productText: true,
      product: { select: { name: true } },
      acceptance: {
        select: {
          customerOrderRef: true,
          orderDate: true,
          createdAt: true,
          // 認可の材料（誰宛の注文か）。表示には使わない。
          customerBpId: true,
          customerBranchBpId: true,
          endUserBpId: true,
          shipToBpId: true,
        },
      },
      deliveryItems: {
        select: {
          deliveryOrder: {
            select: {
              shippedAt: true,
              deliveryNotes: {
                select: {
                  yearMonth: true,
                  seq: true,
                  deliveredAt: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
      invoiceItems: {
        select: {
          invoiceYearMonth: true,
          invoiceSeq: true,
          invoice: { select: { issuedAt: true, createdAt: true } },
        },
      },
    },
  });
  if (!row) return null;

  // 認可は **注文明細（order_lines）そのもの**を対象に判定する。
  //
  // 以前は「その注文請書を書類として見てよいか」（portalTargetOf）で代用して
  // いたが、あちらは請書の状態が APPROVED 以降であることまで要求するので、
  // **キャンセルされた注文**（acceptance.status = CANCELLED）の明細が一覧には
  // 出るのに詳細だけ 404 になる。一覧が CANCELLED を出すのは意図的（止まった
  // ことこそ知らせたい）なので、詳細の側を合わせる。
  //
  // 宛て先の集合は一覧の WHERE と同じ列から作る ⇒ 一覧に出た行は必ず開ける。
  const access = await portalAccessFor(session, {
    type: "order_lines",
    id: `ORD-${yearMonth}-${String(seq).padStart(5, "0")}-${String(branch).padStart(2, "0")}`,
    customerBpIds: [
      row.acceptance.customerBpId,
      row.acceptance.customerBranchBpId,
    ].filter((v): v is string => !!v),
    endUserBpIds: [
      row.acceptance.endUserBpId,
      row.acceptance.shipToBpId,
    ].filter((v): v is string => !!v),
  });
  if (!access.canView) return null;

  const deliveries = row.deliveryItems.flatMap((i) =>
    i.deliveryOrder.deliveryNotes.map((n) => ({ deliveredAt: n.deliveredAt })),
  );
  const shippedAt = row.deliveryItems
    .map((i) => i.deliveryOrder.shippedAt)
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime())[0];

  const acceptanceNumber = `ORD-${yearMonth}-${String(seq).padStart(5, "0")}`;
  const refs: PortalRelatedRef[] = [
    {
      type: "order_acceptances",
      yearMonth,
      seq,
      issuedOn:
        iso(row.acceptance.orderDate) ??
        row.acceptance.createdAt.toISOString().slice(0, 10),
    },
  ];
  for (const di of row.deliveryItems) {
    for (const n of di.deliveryOrder.deliveryNotes) {
      refs.push({
        type: "delivery_notes",
        yearMonth: n.yearMonth,
        seq: n.seq,
        issuedOn: (n.deliveredAt ?? n.createdAt).toISOString().slice(0, 10),
      });
    }
  }
  for (const ii of row.invoiceItems) {
    refs.push({
      type: "invoices",
      yearMonth: ii.invoiceYearMonth,
      seq: ii.invoiceSeq,
      issuedOn: (ii.invoice.issuedAt ?? ii.invoice.createdAt)
        .toISOString()
        .slice(0, 10),
    });
  }

  return {
    acceptanceNumber,
    branch: row.branch,
    productName: row.product?.name
      ? localized(row.product.name as LocalizedTextInput)
      : (row.productText ?? "—"),
    quantity: row.quantity,
    unitPrice: row.unitPrice?.toString() ?? null,
    amount: row.amount?.toString() ?? null,
    deliveryDate: iso(row.deliveryDate),
    progress: portalProgressOf(
      { status: row.status, cancelledAt: row.cancelledAt },
      deliveries,
    ),
    shippedOn: iso(shippedAt ?? null),
    customerOrderRef: row.acceptance.customerOrderRef,
    orderedOn: iso(row.acceptance.orderDate),
    related: await visiblePortalRelated(session, refs),
  };
}
