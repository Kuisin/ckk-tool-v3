/**
 * data.ts — server-side fetch/mapping for the 試算 (SA01) pages.
 *
 * Maps sales.estimates rows (combined key year_month+seq) to the
 * TrialEstimateRecord view-model; the derived EST- number doubles as the
 * URL id. Also builds the shared select options (顧客 = bp CUSTOMER role,
 * 素材 / 製品 = active masters) and the existing price-entry identities for
 * duplicate warnings.
 */

import { ownWhere, rowInScope } from "@ckk/authz-core";
import type { EntryIdentity } from "@/components/sales/price-lists/model";
import type {
  TrialEstimateRecord,
  TrialPriceSnapshot,
} from "@/components/sales/trial-estimates/types";
import { checkPermission } from "@/lib/authz";
import { type Prisma, prisma } from "@/lib/db";
import {
  formatEstimateNumber,
  formatPriceListNumber,
  formatProductNumber,
} from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import type { Option } from "@/lib/mock";
import type { TrialInput } from "@/lib/trial-pricing";

/** estimate.result JSON → 価格スナップショット（lots を持つもののみ採用）。 */
function toPriceSnapshot(value: unknown): TrialPriceSnapshot | null {
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as { lots?: unknown }).lots)
  ) {
    return value as TrialPriceSnapshot;
  }
  return null;
}

// 一覧クエリの取得上限（監査 P2-8）。
const LIST_FETCH_CAP = 1000;

type EstimateRow = NonNullable<
  Awaited<ReturnType<typeof fetchEstimateRowByKey>>
>;

function fetchEstimateRowByKey(yearMonth: string, seq: number) {
  return prisma.estimate.findUnique({
    where: { yearMonth_seq: { yearMonth, seq } },
    include: {
      customerBp: true,
      product: true,
      materialType: true,
      diameter: true,
      surfaceFinish: true,
      salesRep: { select: { id: true, displayName: true } },
      createdByUser: { select: { displayName: true } },
    },
  });
}

export function materialTypeOptionLabel(m: {
  code: string | null;
  name: unknown;
}): string {
  const name = localized(m.name as LocalizedText | null);
  return m.code ? `${m.code} — ${name}` : name;
}

/** 材種 × 直径 × 黒皮/研磨 の表示ラベル（一覧・詳細）。 */
export function materialTypeLabel(r: {
  materialType: { code: string | null; name: unknown } | null;
  diameter: { diameterMm: unknown } | null;
  surfaceFinish: { name: unknown } | null;
}): string {
  if (!r.materialType) return "—";
  const parts = [materialTypeOptionLabel(r.materialType)];
  if (r.diameter) parts.push(`φ${Number(r.diameter.diameterMm)}`);
  if (r.surfaceFinish)
    parts.push(localized(r.surfaceFinish.name as LocalizedText | null));
  return parts.join(" / ");
}

export function mapEstimate(r: EstimateRow): TrialEstimateRecord {
  const number = formatEstimateNumber({ yearMonth: r.yearMonth, seq: r.seq });
  return {
    id: number,
    estimateNumber: number,
    name: r.name,
    status: r.status,
    customerId: r.customerBpId,
    customerName: r.customerBp
      ? localized(r.customerBp.name as LocalizedText | null)
      : null,
    productId: r.productId != null ? String(r.productId) : null,
    productName: r.product ? productOptionLabel(r.product) : null,
    materialTypeId: r.materialTypeId != null ? String(r.materialTypeId) : "",
    diameterCode: r.diameterCode ?? "",
    surfaceFinishCode: r.surfaceFinishCode ?? "",
    materialLabel: materialTypeLabel(r),
    input: r.input as unknown as TrialInput,
    resultSnapshot: toPriceSnapshot(r.result),
    referenceDate: r.referenceDate?.toISOString().slice(0, 10) ?? "",
    isCustomPrice: r.referenceOverridden,
    registeredAt: r.registeredAt?.toISOString() ?? null,
    salesRepId: r.salesRep?.id ?? null,
    salesRepName: r.salesRep?.displayName ?? null,
    createdBy: r.createdByUser?.displayName ?? "—",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function fetchTrialEstimates(): Promise<TrialEstimateRecord[]> {
  // スコープ行フィルタ（OWN = 自分の作成分のみ。ALL は {} で従来通り全件）。
  const authz = await checkPermission("price_list", "READ");
  if (!authz.ok) return [];
  const rows = await prisma.estimate.findMany({
    take: LIST_FETCH_CAP,
    where: ownWhere(
      authz.access,
      authz.userId,
      "createdBy",
    ) as Prisma.EstimateWhereInput,
    include: {
      customerBp: true,
      product: true,
      materialType: true,
      diameter: true,
      surfaceFinish: true,
      salesRep: { select: { id: true, displayName: true } },
      createdByUser: { select: { displayName: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapEstimate);
}

export async function fetchTrialEstimate(
  yearMonth: string,
  seq: number,
): Promise<TrialEstimateRecord | null> {
  const authz = await checkPermission("price_list", "READ");
  if (!authz.ok) return null;
  const row = await fetchEstimateRowByKey(yearMonth, seq);
  if (!row) return null;
  // スコープ外の行は不可視（null → 呼び出し側の notFound に乗せる）。
  if (!rowInScope(authz.access, { createdBy: row.createdBy }, authz.userId)) {
    return null;
  }
  return mapEstimate(row);
}

/** 顧客 options — BPs with an active CUSTOMER role (top-level only). */
export async function fetchCustomerOptions(): Promise<Option[]> {
  const rows = await prisma.businessPartner.findMany({
    where: {
      isActive: true,
      parentId: null,
      roleAssignments: { some: { role: "CUSTOMER", isActive: true } },
    },
    orderBy: { bpCode: "asc" },
  });
  return rows.map((r) => ({
    value: r.id,
    label: localized(r.name as LocalizedText | null),
  }));
}

/** 材種 options — active material-types with a 材種コード. */
export async function fetchMaterialTypeOptions(): Promise<Option[]> {
  const rows = await prisma.materialType.findMany({
    where: { isActive: true, code: { not: null } },
    orderBy: { code: "asc" },
  });
  return rows.map((m) => ({
    value: String(m.id),
    label: materialTypeOptionLabel(m),
  }));
}

/** 直径 options — masters (φ表示). */
export async function fetchDiameterOptions(): Promise<Option[]> {
  const rows = await prisma.materialDiameter.findMany({
    where: { isActive: true },
    orderBy: { diameterMm: "asc" },
  });
  return rows.map((d) => ({
    value: d.code,
    label: `φ${Number(d.diameterMm)}`,
  }));
}

/** 黒皮/研磨 options — surface-finish masters. */
export async function fetchSurfaceFinishOptions(): Promise<Option[]> {
  const rows = await prisma.materialSurfaceFinish.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return rows.map((s) => ({
    value: s.code,
    label: localized(s.name as LocalizedText | null),
  }));
}

/** 製品 options — active products (名称 + コード、レガシーは名称のみ). */
export async function fetchProductOptions(): Promise<Option[]> {
  const rows = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });
  return rows.map((p) => ({
    value: String(p.id),
    label: productOptionLabel(p),
  }));
}

function productOptionLabel(p: {
  id: number;
  name: unknown;
  yearMonth: string | null;
  seq: number | null;
}): string {
  const code = formatProductNumber(p.yearMonth, p.seq);
  const name = localized(p.name as LocalizedText | null);
  return code ? `${name} ${code}` : name;
}

/** 単一製品の option（ロック表示・編集初期値用 — 全件を送らない）. */
export async function fetchProductOption(id: string): Promise<Option | null> {
  const idNum = Number(id);
  if (!Number.isInteger(idNum)) return null;
  const p = await prisma.product.findUnique({ where: { id: idNum } });
  if (!p) return null;
  return { value: String(p.id), label: productOptionLabel(p) };
}

/** 単一顧客の option（ロック表示用）. */
export async function fetchCustomerOption(id: string): Promise<Option | null> {
  const r = await prisma.businessPartner.findUnique({ where: { id } });
  if (!r) return null;
  return { value: r.id, label: localized(r.name as LocalizedText | null) };
}

/** All current price-entry identities (顧客×製品) — duplicate warnings. */
export async function fetchExistingEntryRefs(): Promise<EntryIdentity[]> {
  const rows = await prisma.priceListEntry.findMany({
    select: {
      yearMonth: true,
      seq: true,
      customerBpId: true,
      productId: true,
      variants: { select: { orderType: true } },
    },
  });
  return rows.map((r) => ({
    customerBpId: r.customerBpId,
    productId: String(r.productId),
    orderTypes: r.variants.map((v) => v.orderType),
    entryId: formatPriceListNumber({ yearMonth: r.yearMonth, seq: r.seq }),
  }));
}
