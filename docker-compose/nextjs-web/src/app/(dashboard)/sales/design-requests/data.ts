/**
 * data.ts — 設計依頼書 (SA04) ページのサーバーサイド取得・マッピング。
 *
 * app.design_requests は uuid PK + request_number（DSG-YYYYMM-NNNNN、保存済み）。
 * URL id = request_number。参照元（見積書/注文請書）の表示番号はキーから導出する。
 */

import type {
  DesignRequest,
  DesignRequestStatus,
  DesignRequestTrigger,
} from "@/components/sales/design-requests/model";
import { prisma } from "@/lib/db";
import {
  formatProductNumber,
  formatQuoteNumber,
  formatSalesOrderNumber,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

const DESIGN_REQUEST_INCLUDE = {
  salesOrder: true,
  product: true,
  // ファイルタブ — 最新バージョンから順に。
  files: {
    include: { file: true },
    orderBy: { version: "desc" as const },
  },
};

type DesignRequestRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;

function findRow(requestNumber: string) {
  return prisma.designRequest.findUnique({
    where: { requestNumber },
    include: DESIGN_REQUEST_INCLUDE,
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

function mapDesignRequest(r: DesignRequestRow): DesignRequest {
  return {
    id: r.requestNumber,
    requestNumber: r.requestNumber,
    uuid: r.id,
    trigger: r.trigger as DesignRequestTrigger,
    quoteNumber:
      r.quoteYearMonth && r.quoteSeq != null
        ? formatQuoteNumber({ yearMonth: r.quoteYearMonth, seq: r.quoteSeq })
        : null,
    salesOrderId: r.salesOrderId,
    salesOrderNumber: r.salesOrder
      ? formatSalesOrderNumber(r.salesOrder)
      : null,
    productId: r.productId != null ? String(r.productId) : null,
    productName: r.product ? productLabel(r.product) : null,
    description: r.description,
    status: r.status as DesignRequestStatus,
    completedAt: r.completedAt?.toISOString() ?? null,
    files: r.files.map((f) => ({
      id: f.id,
      version: f.version,
      isLatest: f.isLatest,
      filename: f.file.filename,
      mimeType: f.file.mimeType,
      sizeBytes: Number(f.file.sizeBytes ?? 0),
      notes: f.notes,
      createdAt: f.createdAt.toISOString(),
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** 一覧 — 新しい依頼番号から順に（DSG-YYYYMM-NNNNN は文字列順 = 採番順）。 */
export async function fetchDesignRequests(): Promise<DesignRequest[]> {
  const rows = await prisma.designRequest.findMany({
    include: DESIGN_REQUEST_INCLUDE,
    orderBy: { requestNumber: "desc" },
  });
  return rows.map(mapDesignRequest);
}

/** 1件取得 — 未存在は null。 */
export async function fetchDesignRequest(
  requestNumber: string,
): Promise<DesignRequest | null> {
  const row = await findRow(requestNumber);
  return row ? mapDesignRequest(row) : null;
}

export interface QuoteOption {
  value: string;
  label: string;
}

/**
 * 見積書リンク用の options（新規フォームの 見積書 Select）。
 * 見積マスタは注文請書ほど大きくないため、直近 50 件をサーバーで読み込んで
 * 通常の Select に渡す（value = 導出番号 QOT-YYYYMM-NNNNN）。
 */
export async function fetchRecentQuoteOptions(): Promise<QuoteOption[]> {
  const rows = await prisma.quote.findMany({
    include: { customerBp: true },
    orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
    take: 50,
  });
  return rows.map((r) => {
    const number = formatQuoteNumber({ yearMonth: r.yearMonth, seq: r.seq });
    return {
      value: number,
      label: `${number} ${localized(r.customerBp.name as LocalizedText | null)}`,
    };
  });
}
