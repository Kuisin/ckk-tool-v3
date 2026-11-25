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

/**
 * 会計年度の開始月が閉じているか — その法人の連番行（document_sequences）が
 * 1 行でもあれば閉じる。DB のトリガー own_companies_fiscal_month_lock と同じ条件で、
 * 画面（欄を閉じる）と Server Action（先に分かりやすい文で断る）が使う。
 */
export async function isFiscalYearLocked(id: number): Promise<boolean> {
  const row = await prisma.documentSequence.findFirst({
    where: { ownCompanyId: id },
    select: { key: true },
  });
  return row != null;
}

/** 1 行 → 編集フォームの初期値。 */
export async function fetchOwnCompanyFormInitial(
  id: number,
): Promise<OwnCompanyFormInitial | null> {
  const r = await prisma.ownCompany.findUnique({ where: { id } });
  if (!r) return null;
  const fiscalYearLocked = await isFiscalYearLocked(id);
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
    fiscalYearLocked,
    isDefault: r.isDefault,
    isActive: r.isActive,
    notes: r.notes ?? "",
  };
}
