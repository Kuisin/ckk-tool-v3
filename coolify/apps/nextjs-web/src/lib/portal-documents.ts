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

import { quoteDisplayStatus } from "@/components/sales/quotes/model";
import { type Prisma, prisma } from "./db";
import { formatDocNumber } from "./doc-number";
import { type LocalizedTextInput, localized } from "./format";
import { portalAccessFor, portalScopeFor } from "./portal-access";
import type { PortalResourceType, PortalTarget } from "./portal-access-core";
import type { PortalSession } from "./portal-auth";
// 種別とラベルは client-safe なほうに置いてある（このファイルは server-only なので
// クライアント部品から値を import できない）。
import {
  PORTAL_DOCUMENT_PREFIX,
  type PortalDocumentType,
} from "./portal-documents-core";
import type {
  PortalDocumentDetailDto,
  PortalDocumentDto,
  PortalRelatedDocumentDto,
} from "./portal-progress-core";

/**
 * 見積書は社外に見せてよい状態だけ。DRAFT（下書き）・期限切れは出さない。
 * EXPIRED は保存しない派生状態（components/sales/quotes/model.ts
 * quoteDisplayStatus）なので、ここでは validUntil を直接条件に入れる
 * （下の quoteVisibleWhere）。
 */
const VISIBLE_QUOTE_STATUS = ["ISSUED"] as const;

/** 「発行済み × 期限切れでない」— 見積の一覧・単件アクセス判定で共有する条件。 */
function quoteVisibleWhere(now: Date = new Date()): Prisma.QuoteWhereInput {
  return {
    status: { in: [...VISIBLE_QUOTE_STATUS] },
    OR: [{ validUntil: null }, { validUntil: { gte: now } }],
  };
}
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

/**
 * 明細の合計。**見積書・注文請書には合計列が無い**（DB に持っていない）ので、
 * 社外に出す合計はここで足す。
 *
 * 小数第 2 位までの通貨（Decimal(12,2)）なので、銭単位の整数に直してから
 * 足す —— 浮動小数のまま足すと `¥10,000.000000000002` が出る。
 */
function sumAmounts(
  items: readonly { amount: string | null }[],
): string | null {
  const values = items
    .map((i) => i.amount)
    .filter((v): v is string => v != null);
  if (values.length === 0) return null;
  const cents = values.reduce((acc, v) => acc + Math.round(Number(v) * 100), 0);
  return String(cents / 100);
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
          ...quoteVisibleWhere(),
          AND: [
            {
              OR: [
                { customerBpId: { in: bpIds } },
                { customerBranchBpId: { in: bpIds } },
              ],
            },
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
        select: {
          customerBpId: true,
          customerBranchBpId: true,
          status: true,
          validUntil: true,
        },
      });
      if (
        !r ||
        !VISIBLE_QUOTE_STATUS.includes(r.status as never) ||
        quoteDisplayStatus({
          status: r.status,
          validUntil: r.validUntil?.toISOString().slice(0, 10) ?? null,
        }) === "EXPIRED"
      ) {
        return null;
      }
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

/**
 * 書類 1 件の詳細。**形（キー集合）は portal-progress-core.ts が持ち、
 * テストが固定している** — 「これは取引先に見せてよいか」を毎回考えるため。
 */
export type PortalDocumentDetail = PortalDocumentDetailDto;

/**
 * 関連書類の候補（表示に要る日付まで、拾った側のクエリで一緒に取る）。
 * こうしておくと、可視判定のたびに日付を引き直さずに済む。
 */
export interface PortalRelatedRef {
  type: PortalDocumentType;
  yearMonth: string;
  seq: number;
  issuedOn: string | null;
}

/** 1 画面で解決する関連書類の上限（詳細ページ 1 枚のクエリ数を抑える）。 */
const MAX_RELATED = 20;

/**
 * 候補のうち、**このセッションで実際に見える**ものだけを返す。
 *
 * 見えない相手は行ごと落とす —— 「番号は出すがリンクは死んでいる」にすると、
 * その書類が存在することだけが漏れる。判定は 1 件ずつ portalAccessFor を
 * 通す（一覧の WHERE とは独立に効かせる、このファイルの方針どおり）。
 */
export async function visiblePortalRelated(
  session: PortalSession,
  refs: readonly PortalRelatedRef[],
): Promise<PortalRelatedDocumentDto[]> {
  const seen = new Set<string>();
  const unique: PortalRelatedRef[] = [];
  for (const r of refs) {
    const k = `${r.type}:${r.yearMonth}:${r.seq}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(r);
    if (unique.length >= MAX_RELATED) break;
  }

  const resolved = await Promise.all(
    unique.map(async (r) => {
      const target = await portalTargetOf(r.type, r.yearMonth, r.seq);
      if (!target) return null;
      const access = await portalAccessFor(session, target);
      if (!access.canView) return null;
      return { type: r.type, number: target.id, issuedOn: r.issuedOn };
    }),
  );
  return resolved.filter((r): r is PortalRelatedDocumentDto => r !== null);
}

/** 明細の見出し。製品マスタに突合済みならその名称、未突合なら注文書の品名。 */
function lineLabel(
  product: { name: unknown } | null,
  fallback?: string | null,
): string {
  if (product?.name) return localized(product.name as LocalizedTextInput);
  return fallback ?? "—";
}

function date(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
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
  const base = {
    type,
    number: target.id,
    showsPrices: true,
    validUntil: null,
    customerOrderRef: null,
    orderedOn: null,
    deliveredOn: null,
    billingPeriodFrom: null,
    billingPeriodTo: null,
    dueDate: null,
    subtotal: null,
    taxAmount: null,
  } as const;

  switch (type) {
    case "quotes": {
      const r = await prisma.quote.findUnique({
        where: key,
        select: {
          createdAt: true,
          pdfFileId: true,
          validUntil: true,
          currency: true,
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              amount: true,
              deliveryDate: true,
              product: { select: { name: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      if (!r) return null;
      // 見積から起こされた注文請書へ辿れるようにする（「この見積はどうなった？」）。
      const acceptances = await prisma.orderAcceptance.findMany({
        where: { quoteYearMonth: yearMonth, quoteSeq: seq },
        select: {
          yearMonth: true,
          seq: true,
          orderDate: true,
          createdAt: true,
        },
        orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
        take: MAX_RELATED,
      });
      const lineItems = r.items.map((it) => ({
        label: lineLabel(it.product),
        quantity: it.quantity,
        unitPrice: money(it.unitPrice),
        amount: money(it.amount),
        deliveryDate: date(it.deliveryDate),
      }));
      return {
        ...base,
        issuedOn: iso(r.createdAt),
        // 見積の合計は明細の集計（DB に列が無い）。
        totalAmount: sumAmounts(lineItems),
        hasPdf: r.pdfFileId != null,
        pdfFileId: r.pdfFileId,
        currency: r.currency,
        validUntil: date(r.validUntil),
        lineItems,
        related: await visiblePortalRelated(
          session,
          acceptances.map((a) => ({
            type: "order_acceptances" as const,
            yearMonth: a.yearMonth,
            seq: a.seq,
            issuedOn: date(a.orderDate) ?? iso(a.createdAt),
          })),
        ),
      };
    }

    case "order_acceptances": {
      const r = await prisma.orderAcceptance.findUnique({
        where: key,
        select: {
          createdAt: true,
          orderDate: true,
          customerOrderRef: true,
          currency: true,
          quoteYearMonth: true,
          quoteSeq: true,
          items: {
            // ★ 許可リスト。lot_number / is_locked / product_id は取らない。
            select: {
              branch: true,
              quantity: true,
              unitPrice: true,
              amount: true,
              deliveryDate: true,
              productText: true,
              product: { select: { name: true } },
              deliveryItems: {
                select: {
                  deliveryOrder: {
                    select: {
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
            // 枝番が無い行＝未確定。キャンセル済みの行は**この書類の内容では
            // ない**ので明細にも合計にも数えない（止まったことは注文の進捗
            // 一覧が CANCELLED として出す — 情報は失われない）。
            where: { branch: { not: null }, status: { not: "CANCELLED" } },
            orderBy: { branch: "asc" },
          },
        },
      });
      if (!r) return null;

      const refs: PortalRelatedRef[] = [];
      if (r.quoteYearMonth && r.quoteSeq != null) {
        refs.push({
          type: "quotes",
          yearMonth: r.quoteYearMonth,
          seq: r.quoteSeq,
          issuedOn: null,
        });
      }
      for (const line of r.items) {
        for (const di of line.deliveryItems) {
          for (const n of di.deliveryOrder.deliveryNotes) {
            refs.push({
              type: "delivery_notes",
              yearMonth: n.yearMonth,
              seq: n.seq,
              issuedOn: iso(n.deliveredAt ?? n.createdAt),
            });
          }
        }
        for (const ii of line.invoiceItems) {
          refs.push({
            type: "invoices",
            yearMonth: ii.invoiceYearMonth,
            seq: ii.invoiceSeq,
            issuedOn: iso(ii.invoice.issuedAt ?? ii.invoice.createdAt),
          });
        }
      }

      const lineItems = r.items.map((it) => ({
        label: lineLabel(it.product, it.productText),
        quantity: it.quantity,
        unitPrice: money(it.unitPrice),
        amount: money(it.amount),
        deliveryDate: date(it.deliveryDate),
      }));
      return {
        ...base,
        issuedOn: iso(r.createdAt),
        totalAmount: sumAmounts(lineItems),
        hasPdf: false,
        pdfFileId: null,
        currency: r.currency,
        customerOrderRef: r.customerOrderRef,
        orderedOn: date(r.orderDate),
        lineItems,
        related: await visiblePortalRelated(session, refs),
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
          items: {
            select: {
              quantity: true,
              unitPrice: true,
              amount: true,
              product: { select: { name: true } },
            },
            orderBy: { sortOrder: "asc" },
          },
          deliveryOrder: {
            select: {
              items: {
                select: {
                  orderLine: {
                    select: {
                      acceptanceYearMonth: true,
                      acceptanceSeq: true,
                      acceptance: {
                        select: { orderDate: true, createdAt: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      if (!r) return null;

      const refs: PortalRelatedRef[] = [];
      for (const di of r.deliveryOrder.items) {
        const line = di.orderLine;
        if (!line) continue;
        refs.push({
          type: "order_acceptances",
          yearMonth: line.acceptanceYearMonth,
          seq: line.acceptanceSeq,
          issuedOn:
            date(line.acceptance.orderDate) ?? iso(line.acceptance.createdAt),
        });
      }
      const invoiced = await prisma.invoiceItem.findMany({
        where: { deliveryNoteYearMonth: yearMonth, deliveryNoteSeq: seq },
        select: {
          invoiceYearMonth: true,
          invoiceSeq: true,
          invoice: { select: { issuedAt: true, createdAt: true } },
        },
        take: MAX_RELATED,
      });
      for (const ii of invoiced) {
        refs.push({
          type: "invoices",
          yearMonth: ii.invoiceYearMonth,
          seq: ii.invoiceSeq,
          issuedOn: iso(ii.invoice.issuedAt ?? ii.invoice.createdAt),
        });
      }

      // **include_price に必ず従う** — 価格を載せない納品書に金額を出さない。
      const lineItems = r.items.map((it) => ({
        label: lineLabel(it.product),
        quantity: it.quantity,
        unitPrice: r.includePrice ? money(it.unitPrice) : null,
        amount: r.includePrice ? money(it.amount) : null,
        deliveryDate: null,
      }));
      return {
        ...base,
        issuedOn: iso(r.deliveredAt ?? r.createdAt),
        totalAmount: r.includePrice ? sumAmounts(lineItems) : null,
        hasPdf: r.pdfFileId != null,
        pdfFileId: r.pdfFileId,
        currency: "JPY",
        showsPrices: r.includePrice,
        deliveredOn: date(r.deliveredAt),
        lineItems,
        related: await visiblePortalRelated(session, refs),
      };
    }

    case "invoices": {
      const r = await prisma.invoice.findUnique({
        where: key,
        select: {
          issuedAt: true,
          createdAt: true,
          totalAmount: true,
          subtotal: true,
          taxAmount: true,
          currency: true,
          dueDate: true,
          billingPeriodFrom: true,
          billingPeriodTo: true,
          pdfFileId: true,
          items: {
            select: {
              description: true,
              quantity: true,
              unitPrice: true,
              amount: true,
              deliveryNoteYearMonth: true,
              deliveryNoteSeq: true,
            },
            orderBy: { sortOrder: "asc" },
          },
        },
      });
      if (!r) return null;

      const refs: PortalRelatedRef[] = [];
      for (const it of r.items) {
        if (it.deliveryNoteYearMonth && it.deliveryNoteSeq != null) {
          refs.push({
            type: "delivery_notes",
            yearMonth: it.deliveryNoteYearMonth,
            seq: it.deliveryNoteSeq,
            issuedOn: null,
          });
        }
      }

      return {
        ...base,
        issuedOn: iso(r.issuedAt ?? r.createdAt),
        totalAmount: money(r.totalAmount),
        hasPdf: r.pdfFileId != null,
        pdfFileId: r.pdfFileId,
        currency: r.currency,
        subtotal: money(r.subtotal),
        taxAmount: money(r.taxAmount),
        dueDate: date(r.dueDate),
        billingPeriodFrom: date(r.billingPeriodFrom),
        billingPeriodTo: date(r.billingPeriodTo),
        lineItems: r.items.map((it) => ({
          // 請求書の摘要は多言語 JSON（{ ja, en }）。
          label: localized(it.description as LocalizedTextInput),
          quantity: it.quantity,
          unitPrice: money(it.unitPrice),
          amount: money(it.amount),
          deliveryDate: null,
        })),
        related: await visiblePortalRelated(session, refs),
      };
    }
  }
}
