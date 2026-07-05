/**
 * bp-data.ts — server-side fetch/mapping shared by the BP master screens
 * (顧客 MS01 / 最終需要家 MS02 / 外注企業 MS06).
 *
 * One bp.business_partners row per 法人（支店は parent_id 参照の子 BP）;
 * role-specific attrs live in bp_customer_attrs / bp_vendor_attrs /
 * bp_end_user_attrs. Underscore folder → not routable.
 */

import { prisma } from "@/lib/db";
import { formatQuoteNumber } from "@/lib/doc-number";
import { type LocalizedText, localized } from "@/lib/format";

const ja = (v: unknown) => (v as LocalizedText | null)?.ja ?? "";
const en = (v: unknown) => (v as LocalizedText | null)?.en ?? "";

// ── 顧客 ─────────────────────────────────────────────────────────────────────

export interface CustomerRow {
  id: string;
  bpCode: string;
  name: string;
  branchCount: number;
  isActive: boolean;
  updatedAt: string;
}

export async function fetchCustomers(): Promise<CustomerRow[]> {
  const rows = await prisma.businessPartner.findMany({
    where: {
      parentId: null,
      roleAssignments: { some: { role: "CUSTOMER" } },
    },
    include: { _count: { select: { branches: true } } },
    orderBy: { bpCode: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    bpCode: r.bpCode ?? "—",
    name: localized(r.name as LocalizedText | null),
    branchCount: r._count.branches,
    isActive: r.isActive,
    updatedAt: r.updatedAt.toISOString(),
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

export interface CustomerDetail extends BpBaseDetail {
  attrs: CustomerAttrs;
  contacts: ContactRow[];
  branches: BranchRow[];
  history: DocHistoryRow[];
}

export async function fetchCustomerDetail(
  id: string,
): Promise<CustomerDetail | null> {
  const r = await prisma.businessPartner.findUnique({
    where: { id },
    include: {
      customerAttrs: { include: { billingBp: true } },
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
  const a = r.customerAttrs;
  return {
    ...mapBpBase(r),
    attrs: {
      customerCode: a?.customerCode ?? "",
      billingBpId: a?.billingBpId ?? null,
      billingName: a?.billingBp
        ? localized(a.billingBp.name as LocalizedText | null)
        : "—（自社）",
      closingDay: a?.closingDay ?? null,
      paymentTermsDays: a?.paymentTermsDays ?? null,
      paymentDay: a?.paymentDay ?? null,
      creditLimit: a?.creditLimit != null ? Number(a.creditLimit) : null,
      taxType: a?.taxType ?? "TAXABLE",
      invoiceMethod: a?.invoiceMethod ?? "EMAIL",
      isConsignment: a?.isConsignment ?? false,
    },
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

// ── 最終需要家 ────────────────────────────────────────────────────────────────

export interface EndUserRow {
  id: string;
  bpCode: string;
  name: string;
  industry: string;
  isActive: boolean;
}

export async function fetchEndUsers(): Promise<EndUserRow[]> {
  const rows = await prisma.businessPartner.findMany({
    where: { roleAssignments: { some: { role: "END_USER" } } },
    include: { endUserAttrs: true },
    orderBy: { bpCode: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    bpCode: r.bpCode ?? "—",
    name: localized(r.name as LocalizedText | null),
    industry: r.endUserAttrs?.industry ?? "—",
    isActive: r.isActive,
  }));
}

export interface EndUserDetail extends BpBaseDetail {
  industry: string;
  attrNotes: string;
}

export async function fetchEndUserDetail(
  id: string,
): Promise<EndUserDetail | null> {
  const r = await prisma.businessPartner.findUnique({
    where: { id },
    include: { endUserAttrs: true },
  });
  if (!r) return null;
  return {
    ...mapBpBase(r),
    industry: r.endUserAttrs?.industry ?? "",
    attrNotes: r.endUserAttrs?.notes ?? "",
  };
}

// ── 外注企業（仕入先・外注先） ────────────────────────────────────────────────

export interface SupplierRow {
  id: string;
  bpCode: string;
  name: string;
  vendorType: string;
  leadTimeDays: number | null;
  isActive: boolean;
}

export async function fetchSuppliers(): Promise<SupplierRow[]> {
  const rows = await prisma.businessPartner.findMany({
    where: { roleAssignments: { some: { role: "VENDOR" } } },
    include: { vendorAttrs: true },
    orderBy: { bpCode: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    bpCode: r.bpCode ?? "—",
    name: localized(r.name as LocalizedText | null),
    vendorType: r.vendorAttrs?.vendorType ?? "OUTSOURCE",
    leadTimeDays: r.vendorAttrs?.leadTimeDays ?? null,
    isActive: r.isActive,
  }));
}

export interface SupplierAttrs {
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

export interface SupplierDetail extends BpBaseDetail {
  attrs: SupplierAttrs;
}

export async function fetchSupplierDetail(
  id: string,
): Promise<SupplierDetail | null> {
  const r = await prisma.businessPartner.findUnique({
    where: { id },
    include: { vendorAttrs: true },
  });
  if (!r) return null;
  const a = r.vendorAttrs;
  return {
    ...mapBpBase(r),
    attrs: {
      vendorCode: a?.vendorCode ?? "",
      vendorType: a?.vendorType ?? "OUTSOURCE",
      closingDay: a?.closingDay ?? null,
      paymentTermsDays: a?.paymentTermsDays ?? null,
      paymentDay: a?.paymentDay ?? null,
      bankName: a?.bankName ?? "",
      bankBranch: a?.bankBranch ?? "",
      bankAccountType: a?.bankAccountType ?? null,
      bankAccountNumber: a?.bankAccountNumber ?? "",
      leadTimeDays: a?.leadTimeDays ?? null,
    },
  };
}
