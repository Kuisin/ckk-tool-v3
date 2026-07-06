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
} from "@/components/sales/trial-estimates/types";
import { prisma } from "@/lib/db";
import { formatEstimateNumber } from "@/lib/doc-number";
import { MATERIAL_FORM_LABEL } from "@/lib/enum-labels";
import { type LocalizedText, localized } from "@/lib/format";
import type { Option } from "@/lib/mock";
import type { TrialInput } from "@/lib/trial-pricing";

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
  id: string;
  name: unknown;
  materialForm: string;
}): string {
  const form = MATERIAL_FORM_LABEL[m.materialForm] ?? m.materialForm;
  return `${m.id} — ${localized(m.name as LocalizedText | null)}（${form}）`;
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
    materialId: r.materialId ?? "",
    materialLabel: r.material ? materialOptionLabel(r.material) : "—",
    input: r.input as unknown as TrialInput,
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
    orderBy: { id: "asc" },
  });
  return rows.map((m) => ({ value: m.id, label: materialOptionLabel(m) }));
}

/** 製品 options — active products (名称 + コード). */
export async function fetchProductOptions(): Promise<Option[]> {
  const rows = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { id: "asc" },
  });
  return rows.map((p) => ({
    value: p.id,
    label: `${localized(p.name as LocalizedText | null)} ${p.id}`,
  }));
}

/** 単一製品の option（ロック表示・編集初期値用 — 全件を送らない）. */
export async function fetchProductOption(id: string): Promise<Option | null> {
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) return null;
  return {
    value: p.id,
    label: `${localized(p.name as LocalizedText | null)} ${p.id}`,
  };
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
  return rows;
}
