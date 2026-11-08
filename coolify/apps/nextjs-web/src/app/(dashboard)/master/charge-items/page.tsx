import {
  type ChargeItemRow,
  ChargeItemTable,
} from "@/components/master/charge-items/ChargeItemTable";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import {
  type LocalizedText,
  localized,
  localizedTranslations,
} from "@/lib/format";
import { loadTaxCategoryOptions } from "@/lib/tax-categories";
import { getServerLocale } from "@/lib/user-preferences";

export const dynamic = "force-dynamic";

/** 料金マスタ 一覧 (MS0G). */
export default async function MasterChargeItemsPage() {
  const denied = await requireAppRead("master-charge-items");
  if (denied) return denied;
  const locale = await getServerLocale();
  const [records, taxCategoryOptions] = await Promise.all([
    prisma.chargeItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      include: { taxCategory: { select: { name: true } } },
    }),
    loadTaxCategoryOptions(locale),
  ]);

  const rows: ChargeItemRow[] = records.map((r) => {
    const name = r.name as LocalizedText | null;
    return {
      id: r.id,
      code: r.code,
      name: localized(name, locale),
      nameJa: name?.ja ?? "",
      nameTranslations: localizedTranslations(name),
      amountMode: r.amountMode,
      defaultAmount: r.defaultAmount != null ? Number(r.defaultAmount) : null,
      taxCategoryId: r.taxCategoryId != null ? String(r.taxCategoryId) : null,
      taxCategoryName: r.taxCategory
        ? localized(r.taxCategory.name as LocalizedText | null, locale)
        : null,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
      notes: r.notes ?? "",
    };
  });

  return (
    <ChargeItemTable rows={rows} taxCategoryOptions={taxCategoryOptions} />
  );
}
