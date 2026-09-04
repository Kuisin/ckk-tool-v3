/**
 * data.ts — 設計依頼書 (SA06) ページのサーバーサイド取得・マッピング。
 *
 * app.design_requests は uuid PK + request_number（DSG-YYYYMM-NNNNN、保存済み）。
 * URL id = request_number。参照元（見積書/注文明細）の表示番号はキーから導出する。
 * history Json（{action,user,at,notes}）は displayName を解決して返す。
 * 担当者候補・注文明細の参照解決は work-orders の data.ts を再利用する。
 */

import { NEVER } from "@ckk/authz-core";
import type {
  DesignFileRole,
  DesignKindDetection,
  DesignRequest,
  DesignRequestHistoryView,
  DesignRequestKind,
  DesignRequestLink,
  DesignRequestPriority,
  DesignRequestStatus,
  DesignRequestTrigger,
} from "@/components/sales/design-requests/model";
import type { HistoryEntry } from "@/lib/approvals";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  formatProductNumber,
  formatQuoteNumber,
  orderLineNumberOf,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import type { Locale } from "@/lib/i18n";
import { label } from "@/lib/messages";

// 一覧クエリの取得上限（監査 P2-8 — 全件フェッチのデータ増加対策）。
// DataTable はクライアントページングのため、最新分のみで実用上十分。
const LIST_FETCH_CAP = 1000;

/** history の user 未解決フォールバック名。PDF ルートは locale を渡さず ja のまま。 */
function systemActorName(locale: Locale = "ja"): string {
  return label("common.system", locale, "システム");
}

export {
  fetchEmployeeOptions,
  fetchOrderLineRef,
  type Option,
  type OrderLineRef,
} from "../../production/work-orders/data";

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

/**
 * 一覧はファイル版を描かないので include から外す。
 * 全行に files を積むと、行数 × 版数ぶんの JOIN がそのままクライアントへ渡る。
 */
const LIST_INCLUDE = {
  orderLine: true,
  product: true,
  // 版が載る系列（受注元）。一覧でも「誰向けの図面か」が要る。
  customerBp: { select: { name: true } },
  createdByUser: { select: { displayName: true } },
  assigneeUser: { select: { displayName: true } },
  // 改訂の元図面（版とファイル名だけ — 一覧でもバッジに出す）。
  baseDesignFile: {
    select: { version: true, file: { select: { filename: true } } },
  },
};

const DETAIL_INCLUDE = {
  ...LIST_INCLUDE,
  // ファイルタブ — 最新バージョンから順に。
  files: {
    include: { file: true },
    orderBy: [{ version: "desc" as const }, { role: "asc" as const }],
  },
};

type DetailRow = NonNullable<Awaited<ReturnType<typeof findRow>>>;
type ListRow = Awaited<ReturnType<typeof findListRows>>[number];

function findRow(requestNumber: string) {
  return prisma.designRequest.findUnique({
    where: { requestNumber },
    include: DETAIL_INCLUDE,
  });
}

function findListRows(where: Prisma.DesignRequestWhereInput = {}) {
  return prisma.designRequest.findMany({
    take: LIST_FETCH_CAP,
    where,
    include: LIST_INCLUDE,
    orderBy: { requestNumber: "desc" },
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

/** 参照元・製品・担当者など、一覧と詳細で共通の射影。 */
function mapCommon(r: ListRow) {
  return {
    id: r.requestNumber,
    requestNumber: r.requestNumber,
    uuid: r.id,
    trigger: r.trigger as DesignRequestTrigger,
    quoteNumber:
      r.quoteYearMonth && r.quoteSeq != null
        ? formatQuoteNumber({ yearMonth: r.quoteYearMonth, seq: r.quoteSeq })
        : null,
    orderLineId: r.orderLineId,
    orderLineNumber: r.orderLine ? orderLineNumberOf(r.orderLine) : null,
    productId: r.productId != null ? String(r.productId) : null,
    productName: r.product ? productLabel(r.product) : null,
    customerBpId: r.customerBpId,
    customerName: localized(r.customerBp?.name as LocalizedText | null) || null,
    description: r.description,
    kind: r.kind as DesignRequestKind,
    kindOverridden: r.kindOverridden,
    baseDesignFileId: r.baseDesignFileId,
    baseDesignFileLabel: r.baseDesignFile
      ? `v${r.baseDesignFile.version} ${r.baseDesignFile.file.filename}`
      : null,
    changeReason: r.changeReason,
    // 希望納期は日付のみ（DatePickerInput / 比較のため YYYY-MM-DD で渡す）。
    desiredAt: r.desiredAt ? r.desiredAt.toISOString().slice(0, 10) : null,
    priority: r.priority as DesignRequestPriority,
    status: r.status as DesignRequestStatus,
    assigneeId: r.assigneeId,
    assigneeName: r.assigneeUser?.displayName ?? null,
    createdByName: r.createdByUser?.displayName ?? null,
    requestedAt: iso(r.requestedAt),
    approvedAt: iso(r.approvedAt),
    startedAt: iso(r.startedAt),
    completedAt: iso(r.completedAt),
    cancelledAt: iso(r.cancelledAt),
    cancelReason: r.cancelReason,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

/** history Json の user uuid → displayName を 1 クエリで解決する。 */
async function resolveHistory(
  raw: unknown,
  locale?: Locale,
): Promise<DesignRequestHistoryView[]> {
  const entries: HistoryEntry[] = Array.isArray(raw)
    ? (raw as unknown as HistoryEntry[])
    : [];
  if (entries.length === 0) return [];
  const userIds = new Set<string>();
  for (const h of entries) if (h.user) userIds.add(h.user);
  const users = userIds.size
    ? await prisma.user.findMany({
        where: { id: { in: [...userIds] } },
        select: { id: true, displayName: true },
      })
    : [];
  const nameOf = (id: string | null | undefined) =>
    (id && users.find((u) => u.id === id)?.displayName) ||
    systemActorName(locale);
  return entries.map((h) => ({
    action: h.action,
    user: nameOf(h.user),
    at: h.at,
    ...(h.notes ? { notes: h.notes } : {}),
  }));
}

/**
 * スコープ（監査 M3）: 設計依頼に拠点は無いので OWN だけ — 起票者か、
 * 図面を作る担当者（assigneeId）。ALL は {} で従来どおり全件。
 */
function designRequestScope(
  access: Awaited<ReturnType<typeof checkPermission>> extends infer R
    ? R extends { ok: true; access: infer A }
      ? A
      : never
    : never,
  userId: string,
): Prisma.DesignRequestWhereInput {
  if (access.kind === "ALL") return {};
  if (!access.own) return NEVER as Prisma.DesignRequestWhereInput;
  return { OR: [{ createdBy: userId }, { assigneeId: userId }] };
}

export function designRequestInScope(
  access: Parameters<typeof designRequestScope>[0],
  row: { createdBy: string | null; assigneeId: string | null },
  userId: string,
): boolean {
  if (access.kind === "ALL") return true;
  return access.own && (row.createdBy === userId || row.assigneeId === userId);
}

/** 一覧 — 新しい依頼番号から順に（DSG-YYYYMM-NNNNN は文字列順 = 採番順）。 */
export async function fetchDesignRequests(): Promise<DesignRequest[]> {
  const authz = await checkPermission("design_request", "READ");
  if (!authz.ok) return [];
  const rows = await findListRows(
    designRequestScope(authz.access, authz.userId),
  );
  // 一覧は履歴・版を描かないので空で返す（型は詳細と共有する）。
  return rows.map((r) => ({ ...mapCommon(r), history: [], files: [] }));
}

/** 1件取得 — 未存在・スコープ外は null。 */
export async function fetchDesignRequest(
  requestNumber: string,
  locale?: Locale,
): Promise<DesignRequest | null> {
  const authz = await checkPermission("design_request", "READ");
  if (!authz.ok) return null;
  const row: DetailRow | null = await findRow(requestNumber);
  if (!row) return null;
  if (!designRequestInScope(authz.access, row, authz.userId)) return null;
  return {
    ...mapCommon(row),
    history: await resolveHistory(row.history, locale),
    files: row.files.map((f) => ({
      id: f.id,
      version: f.version,
      isLatest: f.isLatest,
      role: f.role as DesignFileRole,
      filename: f.file.filename,
      mimeType: f.file.mimeType,
      sizeBytes: Number(f.file.sizeBytes ?? 0),
      notes: f.notes,
      createdAt: f.createdAt.toISOString(),
    })),
  };
}

/**
 * 逆リンク — その書類に紐づく設計依頼（新しい順）。
 *
 * 見積書詳細・注文明細詳細・製品詳細の「関連」から呼ぶ。キャンセル済みは
 * 出さない（起票し直した跡が並ぶだけで読み手の助けにならない）。
 */
async function fetchLinks(
  where: Prisma.DesignRequestWhereInput,
): Promise<DesignRequestLink[]> {
  const rows = await prisma.designRequest.findMany({
    where,
    include: { assigneeUser: { select: { displayName: true } } },
    orderBy: { requestNumber: "desc" },
    take: 20,
  });
  return rows.map((r) => ({
    requestNumber: r.requestNumber,
    status: r.status as DesignRequestStatus,
    description: r.description,
    assigneeName: r.assigneeUser?.displayName ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** 見積書に紐づく設計依頼（見積書詳細 関連タブ）。 */
export function fetchDesignRequestsForQuote(key: {
  yearMonth: string;
  seq: number;
}): Promise<DesignRequestLink[]> {
  return fetchLinks({
    quoteYearMonth: key.yearMonth,
    quoteSeq: key.seq,
    status: { not: "CANCELLED" },
  });
}

/** 注文明細に紐づく設計依頼（注文明細詳細 設計タブ）。 */
export function fetchDesignRequestsForOrderLine(
  orderLineId: string,
): Promise<DesignRequestLink[]> {
  return fetchLinks({ orderLineId, status: { not: "CANCELLED" } });
}

/** 製品に紐づく設計依頼（製品詳細 関連タブ）。 */
export function fetchDesignRequestsForProduct(
  productId: number,
): Promise<DesignRequestLink[]> {
  return fetchLinks({ productId, status: { not: "CANCELLED" } });
}

export interface QuoteOption {
  value: string;
  label: string;
}

/**
 * 製品の版一覧 + 依頼区分の判定結果。
 *
 * フォームが「新規/改訂の根拠」と「元図面の選択肢」を同時に要るので 1 回で返す。
 * 判定規則そのものは actions.ts の detectDesignKind と同じ（design_files の存在）
 * — あちらは保存する値を決め、こちらは画面に見せる。
 */
export async function fetchDesignKindContext(
  productId: string,
  customerBpId: string | null = null,
): Promise<{
  detection: DesignKindDetection;
  versions: QuoteOption[];
} | null> {
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) return null;
  // 版は (製品 × 受注元) ごとの系列なので、**その系列だけ**を見て数える。
  // 「顧客 A には図面があるが B にはまだ無い」は B から見れば新規で、
  // 製品全体で数えると改訂に見えてしまう。
  const rows = await prisma.designFile.findMany({
    where: { productId: id, customerBpId },
    include: { file: { select: { filename: true } } },
    orderBy: [{ version: "desc" }, { role: "asc" }],
    take: 50,
  });
  const latest = rows.find((r) => r.isLatest) ?? rows[0] ?? null;
  const label = (r: (typeof rows)[number]) =>
    `v${r.version}${r.isLatest ? "（最新）" : ""} ${r.file.filename}`;
  return {
    detection: {
      kind: rows.length > 0 ? "REVISION" : "NEW",
      versionCount: rows.length,
      latestFileId: latest?.id ?? null,
      latestFileLabel: latest ? label(latest) : null,
    },
    versions: rows.map((r) => ({ value: r.id, label: label(r) })),
  };
}

/**
 * 見積書リンク用の options（新規フォームの 見積書 Select）。
 * 見積マスタは注文明細ほど大きくないため、直近 50 件をサーバーで読み込んで
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

/**
 * 見積書 1 件の参照解決（`?quote=QOT-…` プリフィル用）。
 *
 * クエリ文字列をそのままフォームへ渡さず、実在を確かめてからラベル付きで渡す
 * （存在しない番号でトリガーだけ固定されるのを防ぐ）。
 */
export async function fetchQuoteRef(
  quoteNumber: string,
): Promise<(QuoteOption & { customerBpId: string | null }) | null> {
  const { parseDocKey } = await import("@/lib/doc-number");
  const key = parseDocKey(quoteNumber, "QOT");
  if (!key) return null;
  const r = await prisma.quote.findUnique({
    where: { yearMonth_seq: { yearMonth: key.yearMonth, seq: key.seq } },
    include: { customerBp: true },
  });
  if (!r) return null;
  const number = formatQuoteNumber({ yearMonth: r.yearMonth, seq: r.seq });
  return {
    value: number,
    label: `${number} ${localized(r.customerBp.name as LocalizedText | null)}`,
    // 起票時に「版がどの系列に載るか」の既定を決めるために要る。
    customerBpId: r.customerBpId,
  };
}

/**
 * 注文明細の顧客（`?orderLine=` 起票時の受注元の既定）。
 * 顧客は明細ではなく注文請書ヘッダが持つ（明細に複写すると乖離するため）。
 */
export async function fetchOrderLineCustomerBpId(
  orderLineId: string,
): Promise<string | null> {
  const r = await prisma.orderLine.findUnique({
    where: { id: orderLineId },
    select: { acceptance: { select: { customerBpId: true } } },
  });
  return r?.acceptance.customerBpId ?? null;
}

/**
 * 注文明細の納期（`?orderLine=` 起票時の希望納期の既定）。
 * 受注時トリガーなら、その明細の納期をそのまま希望納期の初期値にする。
 */
export async function fetchOrderLineDeliveryDate(
  orderLineId: string,
): Promise<string | null> {
  const r = await prisma.orderLine.findUnique({
    where: { id: orderLineId },
    select: { deliveryDate: true },
  });
  return r?.deliveryDate ? r.deliveryDate.toISOString().slice(0, 10) : null;
}

/** 製品 1 件の参照解決（`?product=<id>` プリフィル用）。 */
export async function fetchProductRef(
  productId: string,
): Promise<QuoteOption | null> {
  const id = Number(productId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const r = await prisma.product.findUnique({ where: { id } });
  if (!r) return null;
  return { value: String(r.id), label: productLabel(r) };
}
