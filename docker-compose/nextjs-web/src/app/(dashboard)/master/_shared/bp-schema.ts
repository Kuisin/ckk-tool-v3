/**
 * bp-schema.ts — shared zod inputs + Prisma data builders for the BP master
 * Server Actions (plain module — "use server" files can only export
 * async functions).
 */

import { z } from "zod";
import { Prisma } from "@/lib/db";
import { localizedInput, localizedInputOrNull } from "@/lib/server-action";

export const bpBaseInput = z.object({
  nameJa: z.string().min(1, "名称（日本語）を入力してください"),
  nameEn: z.string().optional(),
  nameKana: z.string().optional(),
  shortName: z.string().optional(),
  countryCode: z.string().nullable(),
  postalCode: z.string().optional(),
  addressJa: z.string().optional(),
  addressEn: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z
    .string()
    .email("メールアドレスの形式が正しくありません")
    .or(z.literal(""))
    .optional(),
  website: z.string().optional(),
  taxNumber: z.string().optional(),
  matchNames: z.array(z.string()),
  isActive: z.boolean(),
  notes: z.string().optional(),
});

export type BpBaseInput = z.infer<typeof bpBaseInput>;

/** BP base columns from validated input (create/update shared). */
export function bpBaseData(v: BpBaseInput) {
  return {
    name: localizedInput(v.nameJa, v.nameEn),
    nameKana: v.nameKana?.trim() || null,
    shortName: v.shortName?.trim() || null,
    countryCode: v.countryCode,
    postalCode: v.postalCode?.trim() || null,
    address: localizedInputOrNull(v.addressJa, v.addressEn) ?? Prisma.DbNull,
    phone: v.phone?.trim() || null,
    fax: v.fax?.trim() || null,
    email: v.email?.trim() || null,
    website: v.website?.trim() || null,
    taxNumber: v.taxNumber?.trim() || null,
    matchNames: [...new Set(v.matchNames.map((n) => n.trim()).filter(Boolean))],
    isActive: v.isActive,
    notes: v.notes?.trim() || null,
  };
}

export const customerAttrsInput = z.object({
  customerCode: z.string().optional(),
  billingBpId: z.string().nullable(),
  closingDay: z.number().int().min(1).max(31).nullable(),
  paymentTermsDays: z.number().int().min(0).nullable(),
  paymentDay: z.number().int().min(1).max(31).nullable(),
  creditLimit: z.number().min(0).nullable(),
  taxType: z.enum(["TAXABLE", "EXEMPT", "REDUCED"]),
  invoiceMethod: z.enum(["EMAIL", "FAX", "POST", "PORTAL"]),
  isConsignment: z.boolean(),
});

export type CustomerAttrsInput = z.infer<typeof customerAttrsInput>;

export function customerAttrsData(v: CustomerAttrsInput) {
  return {
    customerCode: v.customerCode?.trim() || null,
    billingBpId: v.billingBpId,
    closingDay: v.closingDay,
    paymentTermsDays: v.paymentTermsDays,
    paymentDay: v.paymentDay,
    creditLimit: v.creditLimit,
    taxType: v.taxType,
    invoiceMethod: v.invoiceMethod,
    isConsignment: v.isConsignment,
  };
}

export const vendorAttrsInput = z.object({
  vendorCode: z.string().optional(),
  vendorType: z.enum(["SUPPLIER", "OUTSOURCE"]),
  closingDay: z.number().int().min(1).max(31).nullable(),
  paymentTermsDays: z.number().int().min(0).nullable(),
  paymentDay: z.number().int().min(1).max(31).nullable(),
  leadTimeDays: z.number().int().min(0).nullable(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  bankAccountType: z.string().nullable(),
  bankAccountNumber: z.string().optional(),
});

export type VendorAttrsInput = z.infer<typeof vendorAttrsInput>;

export function vendorAttrsData(v: VendorAttrsInput) {
  return {
    vendorCode: v.vendorCode?.trim() || null,
    vendorType: v.vendorType,
    closingDay: v.closingDay,
    paymentTermsDays: v.paymentTermsDays,
    paymentDay: v.paymentDay,
    leadTimeDays: v.leadTimeDays,
    bankName: v.bankName?.trim() || null,
    bankBranch: v.bankBranch?.trim() || null,
    bankAccountType: v.bankAccountType,
    bankAccountNumber: v.bankAccountNumber?.trim() || null,
  };
}

export const endUserAttrsInput = z.object({
  industry: z.string().optional(),
});

export type EndUserAttrsInput = z.infer<typeof endUserAttrsInput>;

export function endUserAttrsData(v: EndUserAttrsInput) {
  return { industry: v.industry?.trim() || null };
}

/** 付与できるロール（bp_role_assignments.role）。 */
export const BP_ROLES = ["CUSTOMER", "END_USER", "VENDOR"] as const;

export type BpRoleValue = (typeof BP_ROLES)[number];

/**
 * 取引先（MS01）の入力 — 法人基本情報 + 付与ロール + ロール別属性。
 *
 * ロールは 0 件でも作れる（まず BP を登録し、後からロールを付ける運用）。
 * 属性は対応ロールが選ばれているときだけ必須。
 */
export const bpInput = bpBaseInput
  .extend({
    roles: z.array(z.enum(BP_ROLES)),
    customer: customerAttrsInput.nullable(),
    endUser: endUserAttrsInput.nullable(),
    vendor: vendorAttrsInput.nullable(),
  })
  .superRefine((v, ctx) => {
    const missing = (role: BpRoleValue, path: string) => {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path],
        message: `${role === "CUSTOMER" ? "顧客" : role === "END_USER" ? "最終需要家" : "仕入先・外注先"}の情報を入力してください`,
      });
    };
    if (v.roles.includes("CUSTOMER") && !v.customer)
      missing("CUSTOMER", "customer");
    if (v.roles.includes("END_USER") && !v.endUser)
      missing("END_USER", "endUser");
    if (v.roles.includes("VENDOR") && !v.vendor) missing("VENDOR", "vendor");
  });

export type BpInput = z.infer<typeof bpInput>;

export const contactInput = z.object({
  name: z.string().min(1, "氏名を入力してください"),
  nameKana: z.string().optional(),
  department: z.string().optional(),
  title: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  isPrimary: z.boolean(),
});

export type ContactInput = z.infer<typeof contactInput>;

// パス定数は client component からも使うため bp-paths.ts に分離してある
// （このファイルは @/lib/db 経由で Prisma を引き込むのでブラウザに乗せられない）。
export { BP_BASE_PATH, BP_PATHS } from "./bp-paths";
