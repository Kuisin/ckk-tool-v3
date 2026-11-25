/**
 * data.ts — 自社法人マスタ (MS0I) の共有サーバーサイド取得ヘルパ。
 */

import type { OwnCompanyFormInitial } from "@/components/master/own-companies/OwnCompanyForm";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";

/** 拠点フォームの法人 Select（有効のみ。value = String(id)）。 */
export async function fetchOwnCompanyOptions(): Promise<
  { value: string; label: string }[]
> {
  const rows = await prisma.ownCompany.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { code: "asc" }],
  });
  return rows.map((r) => ({
    value: String(r.id),
    label: `${r.code} ${localized(r.name as LocalizedText | null)}`,
  }));
}

/** 1 行 → 編集フォームの初期値。 */
export async function fetchOwnCompanyFormInitial(
  id: number,
): Promise<OwnCompanyFormInitial | null> {
  const r = await prisma.ownCompany.findUnique({ where: { id } });
  if (!r) return null;
  const name = r.name as LocalizedText | null;
  const address = r.address as LocalizedText | null;
  return {
    id: r.id,
    code: r.code,
    nameJa: name?.ja ?? "",
    nameTranslations: localizedTranslations(name),
    nameKana: r.nameKana ?? "",
    postalCode: r.postalCode ?? "",
    addressJa: address?.ja ?? "",
    addressTranslations: localizedTranslations(address),
    phone: r.phone ?? "",
    fax: r.fax ?? "",
    email: r.email ?? "",
    invoiceRegistrationNo: r.invoiceRegistrationNo ?? "",
    bankName: r.bankName ?? "",
    bankBranch: r.bankBranch ?? "",
    bankAccountType: r.bankAccountType ?? "",
    bankAccountNumber: r.bankAccountNumber ?? "",
    bankAccountHolder: r.bankAccountHolder ?? "",
    fiscalYearStartMonth: r.fiscalYearStartMonth,
    isDefault: r.isDefault,
    isActive: r.isActive,
    notes: r.notes ?? "",
  };
}
