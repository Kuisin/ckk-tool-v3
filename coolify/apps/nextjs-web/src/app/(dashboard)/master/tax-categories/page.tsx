import {
  TaxCategoriesManager,
  type TaxCategoryRow,
} from "@/components/master/tax-categories/TaxCategoriesManager";
import { isoDateJst } from "@/components/sales/price-lists/model";
import { requireAppRead } from "@/lib/authz-page";
import { prisma } from "@/lib/db";
import { type LocalizedText, localizedTranslations } from "@/lib/format";

export const dynamic = "force-dynamic";

/** 税区分マスタ (MS0F) — 単一管理画面（区分カード + 率の履歴）。 */
export default async function MasterTaxCategoriesPage() {
  const denied = await requireAppRead("master-tax-categories");
  if (denied) return denied;

  const categories = await prisma.taxCategory.findMany({
    include: {
      rates: { orderBy: { effectiveFrom: "desc" } },
      // 削除できるかどうかの目安。FK は RESTRICT なので DB でも止まるが、
      // 画面で先に「どこから使われているか」を見せる。
      _count: {
        select: {
          products: true,
          customerAttrs: true,
          invoiceItems: true,
          quoteItems: true,
          invoiceTaxLines: true,
        },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const rows: TaxCategoryRow[] = categories.map((c) => {
    const name = c.name as LocalizedText | null;
    const shortLabel = c.shortLabel as LocalizedText | null;
    return {
      id: c.id,
      code: c.code,
      nameJa: name?.ja ?? "",
      nameTranslations: localizedTranslations(name),
      shortLabelJa: shortLabel?.ja ?? "",
      shortLabelTranslations: localizedTranslations(shortLabel),
      isDefault: c.isDefault,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      notes: c.notes ?? "",
      productCount: c._count.products,
      customerCount: c._count.customerAttrs,
      documentCount:
        c._count.invoiceItems + c._count.quoteItems + c._count.invoiceTaxLines,
      rates: c.rates.map((r) => ({
        id: r.id,
        // DATE 列は UTC 00:00 の Date で返るので UTC 側から暦日を切り出す
        // （JST へ寄せると 1 日ずれる）。lib/tax-categories.ts と同じ扱い。
        effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
        rate: Number(r.rate),
        notes: r.notes ?? "",
      })),
    };
  });

  return (
    <TaxCategoriesManager categories={rows} today={isoDateJst(new Date())} />
  );
}
