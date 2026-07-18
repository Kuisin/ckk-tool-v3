/**
 * data.ts — server-side fetch/mapping for the 試算 (SA05) pages.
 *
 * Maps sales.estimates rows (combined key year_month+seq) to the
 * TrialEstimateRecord view-model; the derived EST- number doubles as the
 * URL id. Also builds the shared select options (顧客 = bp CUSTOMER role,
 * 素材 / 製品 = active masters) and the existing price-entry identities for
 * duplicate warnings.
 */

import type {
  ExistingEntryRef,
  TrialEstimateRecord,
  TrialPriceSnapshot,
} from "@/components/sales/trial-estimates/types";
import { prisma } from "@/lib/db";
import { formatEstimateNumber, formatProductNumber } from "@/lib/doc-number";
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
    include: { customerBp: true, material: true },
  });
}

export function materialOptionLabel(m: {
  code: string;
  name: unknown;
}): string {
  return `${m.code} — ${localized(m.name as LocalizedText | null)}`;
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
    materialId: r.materialId != null ? String(r.materialId) : "",
    materialLabel: r.material ? materialOptionLabel(r.material) : "—",
    input: r.input as unknown as TrialInput,
    resultSnapshot: toPriceSnapshot(r.result),
    referenceDate: r.referenceDate?.toISOString().slice(0, 10) ?? "",
    isCustomPrice: r.referenceOverridden,
    registeredAt: r.registeredAt?.toISOString() ?? null,
    createdBy: "—",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function fetchTrialEstimates(): Promise<TrialEstimateRecord[]> {
  const rows = await prisma.estimate.findMany({
    take: LIST_FETCH_CAP,
    include: { customerBp: true, material: true },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapEstimate);
}

export async function fetchTrialEstimate(
  yearMonth: string,
  seq: number,
): Promise<TrialEstimateRecord | null> {
  const row = await fetchEstimateRowByKey(yearMonth, seq);
  return row ? mapEstimate(row) : null;
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

/** 素材 options — active materials, labelled like the 素材マスタ. */
export async function fetchMaterialOptions(): Promise<Option[]> {
  const rows = await prisma.material.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
  });
  return rows.map((m) => ({
    value: String(m.id),
    label: materialOptionLabel(m),
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

/** All current price-entry identities — duplicate warnings on 登録. */
export async function fetchExistingEntryRefs(): Promise<ExistingEntryRef[]> {
  const rows = await prisma.priceListEntry.findMany({
    select: { customerBpId: true, productId: true, orderType: true },
  });
  return rows.map((r) => ({ ...r, productId: String(r.productId) }));
}
