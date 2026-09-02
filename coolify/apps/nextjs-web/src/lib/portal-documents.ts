/**
 * portal-documents.ts — 社外へ出す書類の取得。server-only.
 *
 * ■ 二重に守る
 *   一覧は portalScopeFor() の集合で SQL を絞る（N+1 を避けるため）。
 *   詳細は改めて portalAccessFor() を通す（一覧の WHERE を間違えても、
 *   1 件ずつの判定は独立して効く）。
 *
 * ■ 素の行を返さない
 *   select は**許可リスト**にする。order_acceptances.extracted（AI 抽出の
 *   生 JSON）・notes（社内メモ）・assigned_plant_id・sales_rep_id、
 *   order_lines.lot_number（= 指示書番号。キオスクの QR そのもの）などが
 *   社外に出る事故を、書く時点で起こさないため。
 *   DTO のキー集合は portal-progress-core.test.ts が固定している。
 *
 * ■ 出さない書類
 *   出荷書（delivery_orders）は社外に出さない。work_order 経由で工程と
 *   外注先に 2 ジョインで届いてしまう。
 */

import "server-only";

import { prisma } from "./db";
import { formatDocNumber } from "./doc-number";
import { portalAccessFor, portalScopeFor } from "./portal-access";
import type { PortalResourceType, PortalTarget } from "./portal-access-core";
import type { PortalSession } from "./portal-auth";
// 種別とラベルは client-safe なほうに置いてある（このファイルは server-only なので
// クライアント部品から値を import できない）。
import {
  PORTAL_DOCUMENT_PREFIX,
  type PortalDocumentType,
} from "./portal-documents-core";
import type { PortalDocumentDto } from "./portal-progress-core";

/**
 * 見積書は社外に見せてよい状態だけ。
 * DRAFT（下書き）・REJECTED・EXPIRED は社内の状態なので出さない。
 */
const VISIBLE_QUOTE_STATUS = ["ISSUED", "ACCEPTED"] as const;
/** 注文請書は「確定して先へ進んだもの」だけ。IMPORT / DRAFT は取込の途中。 */
const VISIBLE_ACCEPTANCE_STATUS = [
  "APPROVED",
  "COMPLETED",
  "ARCHIVED",
] as const;
/** 納品書・請求書は発行済み以降。 */
const VISIBLE_DELIVERY_NOTE_STATUS = ["ISSUED", "DELIVERED"] as const;
const VISIBLE_INVOICE_STATUS = ["ISSUED", "SENT", "PAID"] as const;

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

function money(v: { toString(): string } | null | undefined): string | null {
  return v == null ? null : v.toString();
}

export {
  isPortalDocumentType,
  PORTAL_DOCUMENT_TYPES,
  type PortalDocumentType,
  portalDocumentLabel,
} from "./portal-documents-core";

export interface PortalDocumentListItem extends PortalDocumentDto {
  type: PortalDocumentType;
}

/**
 * 一覧。**スコープが空なら DB を引かない**（`in: []` は全件ではなく 0 件だが、
 * 無駄なクエリを撃たない）。
 */
export async function listPortalDocuments(
  session: PortalSession,
  type: PortalDocumentType,
): Promise<PortalDocumentListItem[]> {
  const scope = await portalScopeFor(session);
  const ids = scope.documentIds.get(type as PortalResourceType);
  const bpIds = scope.customerBpIds;
  const endUserBpIds = scope.endUserBpIds;

  // リンク限定セッションは一覧を持たない（その 1 件だけのスコープ）。
  if (session.linkId) return [];
  if (bpIds.length === 0 && (!ids || ids.size === 0)) return [];

  switch (type) {
    case "quotes": {
      const rows = await prisma.quote.findMany({
        where: {
          status: { in: [...VISIBLE_QUOTE_STATUS] },
          OR: [
            { customerBpId: { in: bpIds } },
            { customerBranchBpId: { in: bpIds } },
          ],
        },
        select: {
          yearMonth: true,
          seq: true,
          createdAt: true,
          pdfFileId: true,
        },
        orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
        take: 200,
      });
      return rows.map((r) => ({
        type,
        number: formatDocNumber("QOT", r),
        issuedOn: iso(r.createdAt),
        totalAmount: null, // 見積の合計は明細の集計。一覧では出さない。
        hasPdf: r.pdfFileId != null,
      }));
    }

    case "order_acceptances": {
      const rows = await prisma.orderAcceptance.findMany({
        where: {
          status: { in: [...VISIBLE_ACCEPTANCE_STATUS] },
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
        select: { yearMonth: true, seq: true, createdAt: true },
        orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
        take: 200,
      });
      return rows.map((r) => ({
        type,
        number: formatDocNumber("ORD", r),
        issuedOn: iso(r.createdAt),
        totalAmount: null,
        hasPdf: false,
      }));
    }

    case "delivery_notes": {
      const rows = await prisma.deliveryNote.findMany({
        where: {
          status: { in: [...VISIBLE_DELIVERY_NOTE_STATUS] },
          OR: [
            { recipientBpId: { in: bpIds } },
            { recipientBranchBpId: { in: bpIds } },
            ...(endUserBpIds.length
              ? [{ endUserBpId: { in: endUserBpIds } }]
              : []),
          ],
        },
        select: {
          yearMonth: true,
          seq: true,
          deliveredAt: true,
          createdAt: true,
          pdfFileId: true,
        },
        orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
        take: 200,
      });
      return rows.map((r) => ({
        type,
        number: formatDocNumber("DRN", r),
        issuedOn: iso(r.deliveredAt ?? r.createdAt),
        // 金額は include_price に従う（詳細で出す。一覧では出さない）。
        totalAmount: null,
        hasPdf: r.pdfFileId != null,
      }));
    }

    case "invoices": {
      const rows = await prisma.invoice.findMany({
        where: {
          status: { in: [...VISIBLE_INVOICE_STATUS] },
          OR: [
            { customerBpId: { in: bpIds } },
            { customerBranchBpId: { in: bpIds } },
          ],
        },
        select: {
          yearMonth: true,
          seq: true,
          issuedAt: true,
          createdAt: true,
          totalAmount: true,
          pdfFileId: true,
        },
        orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
        take: 200,
      });
      return rows.map((r) => ({
        type,
        number: formatDocNumber("INV", r),
        issuedOn: iso(r.issuedAt ?? r.createdAt),
        totalAmount: money(r.totalAmount),
        hasPdf: r.pdfFileId != null,
      }));
    }
  }
}

/**
 * 1 件ぶんの「その書類が誰宛か」。認可の判定に渡す材料で、**表示には使わない**。
 * 見つからなければ null（存在しないものと見えないものを区別しない）。
 */
export async function portalTargetOf(
  type: PortalDocumentType,
  yearMonth: string,
  seq: number,
): Promise<PortalTarget | null> {
  const id = formatDocNumber(PORTAL_DOCUMENT_PREFIX[type], { yearMonth, seq });
  const key = { yearMonth_seq: { yearMonth, seq } };

  switch (type) {
    case "quotes": {
      const r = await prisma.quote.findUnique({
        where: key,
        select: { customerBpId: true, customerBranchBpId: true, status: true },
      });
      if (!r || !VISIBLE_QUOTE_STATUS.includes(r.status as never)) return null;
      return {
        type,
        id,
        customerBpIds: [r.customerBpId, r.customerBranchBpId].filter(
          (v): v is string => !!v,
        ),
        endUserBpIds: [],
      };
    }
    case "order_acceptances": {
      const r = await prisma.orderAcceptance.findUnique({
        where: key,
        select: {
          customerBpId: true,
          customerBranchBpId: true,
          shipToBpId: true,
          endUserBpId: true,
          status: true,
        },
      });
      if (!r || !VISIBLE_ACCEPTANCE_STATUS.includes(r.status as never))
        return null;
      return {
        type,
        id,
        customerBpIds: [r.customerBpId, r.customerBranchBpId].filter(
          (v): v is string => !!v,
        ),
        endUserBpIds: [r.endUserBpId, r.shipToBpId].filter(
          (v): v is string => !!v,
        ),
      };
    }
    case "delivery_notes": {
      const r = await prisma.deliveryNote.findUnique({
        where: key,
        select: {
          recipientBpId: true,
          recipientBranchBpId: true,
          endUserBpId: true,
          status: true,
        },
      });
      if (!r || !VISIBLE_DELIVERY_NOTE_STATUS.includes(r.status as never))
        return null;
      return {
        type,
        id,
        customerBpIds: [r.recipientBpId, r.recipientBranchBpId].filter(
          (v): v is string => !!v,
        ),
        endUserBpIds: [r.endUserBpId].filter((v): v is string => !!v),
      };
    }
    case "invoices": {
      const r = await prisma.invoice.findUnique({
        where: key,
        select: { customerBpId: true, customerBranchBpId: true, status: true },
      });
      if (!r || !VISIBLE_INVOICE_STATUS.includes(r.status as never))
        return null;
      return {
        type,
        id,
        customerBpIds: [r.customerBpId, r.customerBranchBpId].filter(
          (v): v is string => !!v,
        ),
        endUserBpIds: [],
      };
    }
  }
}

export interface PortalDocumentDetail extends PortalDocumentDto {
  type: PortalDocumentType;
  /** PDF を引くための file id（アクセスを証明した後にだけ返す）。 */
  pdfFileId: string | null;
}

/**
 * 詳細。**認可は呼び出し側（requirePortalView）が済ませている前提だが、
 * ここでも念のため通す**（一覧の WHERE と独立に効かせる）。
 */
export async function getPortalDocument(
  session: PortalSession,
  type: PortalDocumentType,
  yearMonth: string,
  seq: number,
): Promise<PortalDocumentDetail | null> {
  const target = await portalTargetOf(type, yearMonth, seq);
  if (!target) return null;
  const access = await portalAccessFor(session, target);
  if (!access.canView) return null;

  const key = { yearMonth_seq: { yearMonth, seq } };

  switch (type) {
    case "quotes": {
      const r = await prisma.quote.findUnique({
        where: key,
        select: { createdAt: true, pdfFileId: true },
      });
      if (!r) return null;
      return {
        type,
        number: target.id,
        issuedOn: iso(r.createdAt),
        totalAmount: null,
        hasPdf: r.pdfFileId != null,
        pdfFileId: r.pdfFileId,
      };
    }
    case "order_acceptances": {
      const r = await prisma.orderAcceptance.findUnique({
        where: key,
        select: { createdAt: true },
      });
      if (!r) return null;
      return {
        type,
        number: target.id,
        issuedOn: iso(r.createdAt),
        totalAmount: null,
        hasPdf: false,
        pdfFileId: null,
      };
    }
    case "delivery_notes": {
      const r = await prisma.deliveryNote.findUnique({
        where: key,
        select: {
          deliveredAt: true,
          createdAt: true,
          pdfFileId: true,
          includePrice: true,
        },
      });
      if (!r) return null;
      return {
        type,
        number: target.id,
        issuedOn: iso(r.deliveredAt ?? r.createdAt),
        // **include_price に必ず従う** — 価格を載せない納品書に金額を出さない。
        totalAmount: null,
        hasPdf: r.pdfFileId != null,
        pdfFileId: r.pdfFileId,
      };
    }
    case "invoices": {
      const r = await prisma.invoice.findUnique({
        where: key,
        select: {
          issuedAt: true,
          createdAt: true,
          totalAmount: true,
          pdfFileId: true,
        },
      });
      if (!r) return null;
      return {
        type,
        number: target.id,
        issuedOn: iso(r.issuedAt ?? r.createdAt),
        totalAmount: money(r.totalAmount),
        hasPdf: r.pdfFileId != null,
        pdfFileId: r.pdfFileId,
      };
    }
  }
}
