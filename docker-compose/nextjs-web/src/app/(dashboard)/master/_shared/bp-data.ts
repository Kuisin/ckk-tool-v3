/**
 * bp-data.ts — server-side fetch/mapping for the 取引先マスタ (MS01).
 *
 * One bp.business_partners row per 法人（支店は parent_id 参照の子 BP）。
 * 顧客 / 最終需要家 / 仕入先・外注先 は同じ 1 行にロール（bp_role_assignments）
 * を付与して表現し、ロール固有の属性は bp_customer_attrs / bp_end_user_attrs /
 * bp_vendor_attrs に持つ。Underscore folder → not routable.
 */

import { bpSearchKeys } from "@/lib/bp-search";
import { prisma } from "@/lib/db";
import { formatQuoteNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";
import { BP_ROLES, type BpRoleValue } from "./bp-schema";

const ja = (v: unknown) => (v as LocalizedText | null)?.ja ?? "";
const en = (v: unknown) => (v as LocalizedText | null)?.en ?? "";

/**
 * 有効なロール割当だけを拾う（解除済みは isActive=false の行として残る）。
 * 並びは BP_ROLES 固定 — DB の挿入順でバッジの順が揺れないように。
 */
type RoleAssignmentLike = { role: string; isActive: boolean };

function activeRoles(assignments: RoleAssignmentLike[]): BpRoleValue[] {
  const active = new Set(
    assignments.filter((a) => a.isActive).map((a) => a.role),
  );
  return BP_ROLES.filter((role) => active.has(role));
}

// ── 取引先 一覧 ───────────────────────────────────────────────────────────────

export interface BpRow {
  id: string;
  bpCode: string;
  name: string;
  /**
   * 検索用のキー（画面には出さない）。社名以外の探し方 — フリガナ・ローマ字・
   * 「THK」だけ・㈱ の表記違い — でも一覧を絞り込めるようにするため。
   * 中身は lib/bp-search の判定にそのまま渡す。
   */
  searchKeys: string[];
  roles: BpRoleValue[];
  vendorType: string | null;
  branchCount: number;
  isActive: boolean;
  updatedAt: string;
}

export async function fetchBusinessPartners(): Promise<BpRow[]> {
  const rows = await prisma.businessPartner.findMany({
    where: { parentId: null },
    include: {
      roleAssignments: true,
      vendorAttrs: { select: { vendorType: true } },
      _count: { select: { branches: true } },
    },
    orderBy: { bpCode: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    bpCode: r.bpCode ?? "—",
    name: localized(r.name as LocalizedText | null),
    searchKeys: bpSearchKeys({
      bpCode: r.bpCode,
      nameJa: localized(r.name as LocalizedText | null),
      nameEn: (r.name as { en?: string } | null)?.en ?? null,
      nameKana: r.nameKana,
      shortName: r.shortName,
      matchNames: r.matchNames,
      matchNamesAuto: r.matchNamesAuto,
    }),
    roles: activeRoles(r.roleAssignments),
    vendorType: r.vendorAttrs?.vendorType ?? null,
    branchCount: r._count.branches,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * 請求先セレクトの候補 — 顧客ロールを持つトップレベル BP（自分自身は除く）。
 */
export async function fetchBillingOptions(
  excludeId?: string,
): Promise<{ value: string; label: string }[]> {
  const rows = await prisma.businessPartner.findMany({
    where: {
      parentId: null,
      isActive: true,
      roleAssignments: { some: { role: "CUSTOMER", isActive: true } },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, bpCode: true },
    orderBy: { bpCode: "asc" },
  });
  return rows.map((r) => ({
    value: r.id,
    label: `${localized(r.name as LocalizedText | null)}（${r.bpCode ?? "—"}）`,
  }));
}

export interface BpBaseDetail {
  id: string;
  bpCode: string;
  nameJa: string;
  nameEn: string;
  name: string;
  nameKana: string;
  shortName: string;
  countryCode: string | null;
  postalCode: string;
  addressJa: string;
  addressEn: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website: string;
  taxNumber: string;
  matchNames: string[];
  isActive: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

type BpRowLike = {
  id: string;
  bpCode: string | null;
  name: unknown;
  nameKana: string | null;
  shortName: string | null;
  countryCode: string | null;
  postalCode: string | null;
  address: unknown;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  taxNumber: string | null;
  matchNames: string[];
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function mapBpBase(r: BpRowLike): BpBaseDetail {
  return {
    id: r.id,
    bpCode: r.bpCode ?? "—",
    nameJa: ja(r.name),
    nameEn: en(r.name),
    name: localized(r.name as LocalizedText | null),
    nameKana: r.nameKana ?? "",
    shortName: r.shortName ?? "",
    countryCode: r.countryCode,
    postalCode: r.postalCode ?? "",
    addressJa: ja(r.address),
    addressEn: en(r.address),
    address: localized(r.address as LocalizedText | null),
    phone: r.phone ?? "",
    fax: r.fax ?? "",
    email: r.email ?? "",
    website: r.website ?? "",
    taxNumber: r.taxNumber ?? "",
    matchNames: r.matchNames,
    isActive: r.isActive,
    notes: r.notes ?? "",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export interface ContactRow {
  id: string;
  name: string;
  nameKana: string;
  department: string;
  title: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

export interface BranchRow {
  id: string;
  name: string;
  phone: string;
  contact: string;
}

export interface CustomerAttrs {
  customerCode: string;
  billingBpId: string | null;
  billingName: string;
  closingDay: number | null;
  paymentTermsDays: number | null;
  paymentDay: number | null;
  creditLimit: number | null;
  taxType: string;
  invoiceMethod: string;
  isConsignment: boolean;
}

export interface DocHistoryRow {
  number: string;
  label: string;
  amount: number;
  status: { entity: "Quote"; value: string };
  date: string;
}

export interface EndUserAttrs {
  industry: string;
}

export interface VendorAttrs {
  vendorCode: string;
  vendorType: string;
  closingDay: number | null;
  paymentTermsDays: number | null;
  paymentDay: number | null;
  bankName: string;
  bankBranch: string;
  bankAccountType: string | null;
  bankAccountNumber: string;
  leadTimeDays: number | null;
}

/**
 * 取引先 詳細 — 付与ロールと、ロール別属性をすべて載せる。
 * `roles` に含まれないロールの属性も（過去に付与していれば）残るので、
 * 再付与したときに前の内容が戻る。
 */
export interface BpDetail extends BpBaseDetail {
  roles: BpRoleValue[];
  customer: CustomerAttrs | null;
  endUser: EndUserAttrs | null;
  vendor: VendorAttrs | null;
  contacts: ContactRow[];
  branches: BranchRow[];
  history: DocHistoryRow[];
}

export async function fetchBpDetail(id: string): Promise<BpDetail | null> {
  const r = await prisma.businessPartner.findUnique({
    where: { id },
    include: {
      roleAssignments: true,
      customerAttrs: { include: { billingBp: true } },
      endUserAttrs: true,
      vendorAttrs: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      branches: {
        orderBy: { bpCode: "asc" },
        include: {
          contacts: { where: { isPrimary: true }, take: 1 },
        },
      },
      quotesAsCustomer: {
        include: { items: true },
        orderBy: [{ yearMonth: "desc" }, { seq: "desc" }],
        take: 20,
      },
    },
  });
  if (!r) return null;
  const c = r.customerAttrs;
  const v = r.vendorAttrs;
  return {
    ...mapBpBase(r),
    roles: activeRoles(r.roleAssignments),
    customer: c
      ? {
          customerCode: c.customerCode ?? "",
          billingBpId: c.billingBpId ?? null,
          billingName: c.billingBp
            ? localized(c.billingBp.name as LocalizedText | null)
            : "—（自社）",
          closingDay: c.closingDay ?? null,
          paymentTermsDays: c.paymentTermsDays ?? null,
          paymentDay: c.paymentDay ?? null,
          creditLimit: c.creditLimit != null ? Number(c.creditLimit) : null,
          taxType: c.taxType,
          invoiceMethod: c.invoiceMethod,
          isConsignment: c.isConsignment,
        }
      : null,
    endUser: r.endUserAttrs
      ? { industry: r.endUserAttrs.industry ?? "" }
      : null,
    vendor: v
      ? {
          vendorCode: v.vendorCode ?? "",
          vendorType: v.vendorType,
          closingDay: v.closingDay ?? null,
          paymentTermsDays: v.paymentTermsDays ?? null,
          paymentDay: v.paymentDay ?? null,
          bankName: v.bankName ?? "",
          bankBranch: v.bankBranch ?? "",
          bankAccountType: v.bankAccountType ?? null,
          bankAccountNumber: v.bankAccountNumber ?? "",
          leadTimeDays: v.leadTimeDays ?? null,
        }
      : null,
    contacts: r.contacts.map((c2) => ({
      id: c2.id,
      name: c2.name,
      nameKana: c2.nameKana ?? "",
      department: c2.department ?? "",
      title: c2.title ?? "",
      email: c2.email ?? "",
      phone: c2.phone ?? "",
      isPrimary: c2.isPrimary,
    })),
    branches: r.branches.map((b) => ({
      id: b.id,
      name: localized(b.name as LocalizedText | null),
      phone: b.phone ?? "",
      contact: b.contacts[0]?.name ?? "—",
    })),
    history: r.quotesAsCustomer.map((q) => ({
      number: formatQuoteNumber({ yearMonth: q.yearMonth, seq: q.seq }),
      label: "見積書",
      amount: q.items.reduce((sum, it) => sum + Number(it.amount), 0),
      status: { entity: "Quote" as const, value: q.status },
      date: q.createdAt.toISOString(),
    })),
  };
}

export interface BranchDetail extends BpBaseDetail {
  parentId: string;
  parentName: string;
  parentBpCode: string;
  contacts: ContactRow[];
}

export async function fetchBranchDetail(
  parentId: string,
  branchId: string,
): Promise<BranchDetail | null> {
  const r = await prisma.businessPartner.findUnique({
    where: { id: branchId },
    include: {
      parent: true,
      contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
    },
  });
  if (!r || r.parentId !== parentId || !r.parent) return null;
  return {
    ...mapBpBase(r),
    parentId,
    parentName: localized(r.parent.name as LocalizedText | null),
    parentBpCode: r.parent.bpCode ?? "—",
    contacts: r.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      nameKana: c.nameKana ?? "",
      department: c.department ?? "",
      title: c.title ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      isPrimary: c.isPrimary,
    })),
  };
}
